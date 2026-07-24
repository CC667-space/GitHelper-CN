import type { ProviderCapabilities, ProviderId, ToolCall } from '../../lib/types';

export type ProviderMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ProviderTextPart {
  type: 'text';
  text: string;
}

export interface ProviderImagePart {
  type: 'image_url';
  image_url: { url: string };
}

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string | Array<ProviderTextPart | ProviderImagePart>;
  tool_call_id?: string;
}

export interface ProviderToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderChatRequest {
  requestId: string;
  model: string;
  messages: ProviderMessage[];
  images?: string[];
  tools?: ProviderToolDefinition[];
  responseFormat?: { type: 'json_object' };
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ProviderChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: ProviderUsage;
  model?: string;
}

export interface ProviderStreamChunk {
  delta?: string;
  toolCalls?: ToolCall[];
  usage?: ProviderUsage;
  done?: boolean;
}

export interface ProviderModel {
  id: string;
  name?: string;
  inputModalities?: string[];
  supportedParameters?: string[];
}

export interface ProviderTransport {
  request(
    providerId: ProviderId,
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response>;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly apiHost: string;
  readonly capabilities: ProviderCapabilities;
  chat(request: ProviderChatRequest, signal?: AbortSignal): Promise<ProviderChatResponse>;
  chatStream(
    request: ProviderChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderStreamChunk>;
  abort(requestId: string): boolean;
  listModels(signal?: AbortSignal): Promise<ProviderModel[]>;
}

export type ProviderErrorCode =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'ABORTED'
  | 'HTTP_ERROR';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

interface OpenAIChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      function?: { name?: string; arguments?: string };
    }>;
  };
  delta?: {
    content?: string | null;
    tool_calls?: Array<{
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason?: string | null;
}

interface OpenAIResponse {
  model?: string;
  choices?: OpenAIChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: unknown;
}

const UNPROBED_CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: false,
  supportsVision: false,
  supportsToolCalls: false,
  supportsStructuredOutput: false,
  supportsUsage: false,
  supportsAbort: false,
  imageInputFormat: 'none',
  toolCallStreamingFormat: 'none',
  errorResponseFormat: 'custom',
};

function parseToolCalls(
  toolCalls: Array<{ function?: { name?: string; arguments?: string } }> | undefined,
): ToolCall[] | undefined {
  const parsed = (toolCalls ?? [])
    .map((call) => {
      const name = call.function?.name;
      if (!name) {
        return undefined;
      }
      let args: Record<string, unknown> = {};
      try {
        const candidate = JSON.parse(call.function?.arguments ?? '{}') as unknown;
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          args = candidate as Record<string, unknown>;
        }
      } catch {
        args = { raw: call.function?.arguments ?? '' };
      }
      return { name, args };
    })
    .filter((call): call is ToolCall => call !== undefined);
  return parsed.length > 0 ? parsed : undefined;
}

function parseUsage(value: OpenAIResponse['usage']): ProviderUsage | undefined {
  if (typeof value?.prompt_tokens !== 'number' || typeof value.completion_tokens !== 'number') {
    return undefined;
  }
  return {
    promptTokens: value.prompt_tokens,
    completionTokens: value.completion_tokens,
  };
}

function parseRetryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get('Retry-After'));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function errorCode(status: number, message: string): ProviderErrorCode {
  if (status === 401 || status === 403) {
    return 'AUTH';
  }
  if (status === 429) {
    return 'RATE_LIMIT';
  }
  if (status === 404 || /model.+(?:not found|unavailable)/i.test(message)) {
    return 'MODEL_UNAVAILABLE';
  }
  if (status >= 500) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return 'HTTP_ERROR';
}

function linkAbortSignal(controller: AbortController, signal?: AbortSignal): () => void {
  if (!signal) {
    return () => undefined;
  }
  const abort = (): void => controller.abort(signal.reason);
  if (signal.aborted) {
    abort();
    return () => undefined;
  }
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

export abstract class OpenAICompatibleProvider implements Provider {
  abstract readonly id: ProviderId;
  abstract readonly label: string;
  abstract readonly apiHost: string;
  protected abstract readonly chatEndpoint: string;
  protected abstract readonly modelsEndpoint: string;
  readonly capabilities: ProviderCapabilities;
  private readonly activeRequests = new Map<string, AbortController>();

  constructor(
    protected readonly transport: ProviderTransport,
    capabilities: Partial<ProviderCapabilities> = {},
  ) {
    this.capabilities = { ...UNPROBED_CAPABILITIES, ...capabilities };
  }

  async chat(request: ProviderChatRequest, signal?: AbortSignal): Promise<ProviderChatResponse> {
    const { controller, unlink } = this.beginRequest(request.requestId, signal);
    try {
      const response = await this.transport.request(
        this.id,
        this.chatEndpoint,
        {
          method: 'POST',
          headers: this.requestHeaders(),
          body: JSON.stringify(this.buildRequestBody(request, false)),
        },
        controller.signal,
      );
      await this.assertResponse(response);
      const parsed = (await response.json()) as OpenAIResponse;
      if (parsed.error) {
        throw this.streamError(parsed.error);
      }
      const choice = parsed.choices?.[0];
      if (!choice?.message) {
        throw new ProviderError('INVALID_RESPONSE', `${this.label} 返回缺少 message`);
      }
      return {
        content: choice.message.content ?? '',
        toolCalls: parseToolCalls(choice.message.tool_calls),
        usage: parseUsage(parsed.usage),
        model: parsed.model,
      };
    } catch (error: unknown) {
      throw this.normalizeThrownError(error, controller.signal);
    } finally {
      unlink();
      this.activeRequests.delete(request.requestId);
    }
  }

  async *chatStream(
    request: ProviderChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderStreamChunk> {
    const { controller, unlink } = this.beginRequest(request.requestId, signal);
    try {
      const response = await this.transport.request(
        this.id,
        this.chatEndpoint,
        {
          method: 'POST',
          headers: this.requestHeaders(),
          body: JSON.stringify(this.buildRequestBody(request, true)),
        },
        controller.signal,
      );
      await this.assertResponse(response);
      if (!response.body) {
        throw new ProviderError('INVALID_RESPONSE', `${this.label} 流式响应缺少 body`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
            continue;
          }
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            yield { done: true };
            return;
          }
          const parsed = JSON.parse(data) as OpenAIResponse;
          if (parsed.error) {
            throw this.streamError(parsed.error);
          }
          const choice = parsed.choices?.[0];
          const usage = parseUsage(parsed.usage);
          const toolCalls = parseToolCalls(choice?.delta?.tool_calls);
          const delta = choice?.delta?.content ?? undefined;
          if (delta || toolCalls || usage) {
            yield { delta, toolCalls, usage };
          }
          if (choice?.finish_reason) {
            yield { done: true };
          }
        }
        if (done) {
          break;
        }
      }
      if (buffer.trim()) {
        throw new ProviderError('INVALID_RESPONSE', `${this.label} 流式响应尾部不完整`);
      }
    } catch (error: unknown) {
      throw this.normalizeThrownError(error, controller.signal);
    } finally {
      unlink();
      this.activeRequests.delete(request.requestId);
    }
  }

  abort(requestId: string): boolean {
    const controller = this.activeRequests.get(requestId);
    if (!controller) {
      return false;
    }
    controller.abort(new DOMException('用户已取消请求', 'AbortError'));
    return true;
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const requestId = `models:${crypto.randomUUID()}`;
    const { controller, unlink } = this.beginRequest(requestId, signal);
    try {
      const response = await this.transport.request(
        this.id,
        this.modelsEndpoint,
        { method: 'GET', headers: this.requestHeaders() },
        controller.signal,
      );
      await this.assertResponse(response);
      const payload = (await response.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          architecture?: { input_modalities?: string[] };
          supported_parameters?: string[];
        }>;
      };
      return (payload.data ?? [])
        .filter((model): model is typeof model & { id: string } => typeof model.id === 'string')
        .map((model) => ({
          id: model.id,
          name: model.name,
          inputModalities: model.architecture?.input_modalities,
          supportedParameters: model.supported_parameters,
        }));
    } finally {
      unlink();
      this.activeRequests.delete(requestId);
    }
  }

  protected mapModel(model: string): string {
    return model;
  }

  protected requestHeaders(): HeadersInit {
    return { 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  protected buildRequestBody(
    request: ProviderChatRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.mapModel(request.model),
      messages: this.withImages(request),
      stream,
    };
    if (stream) {
      body.stream_options = { include_usage: true };
    }
    if (request.tools?.length) {
      body.tools = request.tools;
    }
    if (request.responseFormat) {
      body.response_format = request.responseFormat;
    }
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    return body;
  }

  protected withImages(request: ProviderChatRequest): ProviderMessage[] {
    if (!request.images?.length) {
      return request.messages;
    }
    const messages = [...request.messages];
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) {
      throw new Error('视觉请求缺少 user message');
    }
    const target = messages[lastUserIndex]!;
    const content: Array<ProviderTextPart | ProviderImagePart> =
      typeof target.content === 'string'
        ? [{ type: 'text', text: target.content }]
        : [...target.content];
    content.push(
      ...request.images.map((url): ProviderImagePart => ({
        type: 'image_url',
        image_url: { url },
      })),
    );
    messages[lastUserIndex] = { ...target, content };
    return messages;
  }

  protected async extractErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.clone().json()) as {
        error?: { message?: string } | string;
        message?: string;
      };
      if (typeof payload.error === 'string') {
        return payload.error;
      }
      return (
        payload.error?.message ?? payload.message ?? `${response.status} ${response.statusText}`
      );
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }

  protected streamError(error: unknown): ProviderError {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : String(error);
    return new ProviderError('HTTP_ERROR', `${this.label}: ${message}`);
  }

  private beginRequest(
    requestId: string,
    signal?: AbortSignal,
  ): { controller: AbortController; unlink: () => void } {
    if (this.activeRequests.has(requestId)) {
      throw new Error(`重复的 Provider requestId：${requestId}`);
    }
    const controller = new AbortController();
    this.activeRequests.set(requestId, controller);
    return { controller, unlink: linkAbortSignal(controller, signal) };
  }

  private async assertResponse(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    const message = await this.extractErrorMessage(response);
    throw new ProviderError(
      errorCode(response.status, message),
      `${this.label}: ${message}`,
      response.status,
      parseRetryAfter(response),
    );
  }

  private normalizeThrownError(error: unknown, signal: AbortSignal): Error {
    if (error instanceof ProviderError) {
      return error;
    }
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return new ProviderError('ABORTED', '请求已取消');
    }
    return error instanceof Error ? error : new ProviderError('INVALID_RESPONSE', String(error));
  }
}
