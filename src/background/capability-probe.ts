import type { ProviderCapabilities } from '../lib/types';
import type {
  Provider,
  ProviderChatRequest,
  ProviderModel,
  ProviderStreamChunk,
} from './providers/base';
import { ProviderError } from './providers/base';
import type { CapabilityProbeSummary } from './provider-manager';

export interface CapabilityProbeOptions {
  textModel: string;
  visionModel?: string;
  sampleImageDataUrl?: string;
  now?: () => Date;
}

export interface CapabilityProbeReport {
  summary: CapabilityProbeSummary;
  capabilities: ProviderCapabilities;
  models: ProviderModel[];
  checks: Record<string, { passed: boolean; detail?: string }>;
}

async function collect(stream: AsyncIterable<ProviderStreamChunk>): Promise<ProviderStreamChunk[]> {
  const chunks: ProviderStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function request(
  requestId: string,
  model: string,
  content: string,
  extra: Partial<ProviderChatRequest> = {},
): ProviderChatRequest {
  return {
    requestId,
    model,
    messages: [{ role: 'user', content }],
    maxTokens: 16,
    temperature: 0,
    ...extra,
  };
}

export async function runCapabilityProbe(
  provider: Provider,
  options: CapabilityProbeOptions,
): Promise<CapabilityProbeReport> {
  const checks: CapabilityProbeReport['checks'] = {};
  let models: ProviderModel[] = [];
  try {
    models = await provider.listModels();
    checks.models = { passed: true, detail: `${models.length} models` };
  } catch (error: unknown) {
    checks.models = {
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let text = false;
  let usage = false;
  try {
    const response = await provider.chat(
      request(`probe:text:${crypto.randomUUID()}`, options.textModel, '只回复 OK'),
    );
    text = response.content.length > 0;
    usage = response.usage !== undefined;
    checks.text = { passed: text };
    checks.usage = { passed: usage };
  } catch (error: unknown) {
    checks.text = { passed: false, detail: error instanceof Error ? error.message : String(error) };
  }

  let streaming = false;
  try {
    const chunks = await collect(
      provider.chatStream(
        request(`probe:stream:${crypto.randomUUID()}`, options.textModel, '只回复 OK'),
      ),
    );
    streaming = chunks.some((chunk) => Boolean(chunk.delta)) && chunks.some((chunk) => chunk.done);
    checks.streaming = { passed: streaming };
  } catch (error: unknown) {
    checks.streaming = {
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let abort = false;
  try {
    const requestId = `probe:abort:${crypto.randomUUID()}`;
    const stream = provider.chatStream(
      request(requestId, options.textModel, '从 1 缓慢数到 100'),
      undefined,
    );
    const iterator = stream[Symbol.asyncIterator]();
    const pending = iterator.next();
    await Promise.resolve();
    abort = provider.abort(requestId);
    await pending.catch(() => undefined);
    checks.abort = { passed: abort };
  } catch (error: unknown) {
    checks.abort = {
      passed: abort,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let vision = false;
  if (options.visionModel && options.sampleImageDataUrl) {
    try {
      const response = await provider.chat(
        request(`probe:vision:${crypto.randomUUID()}`, options.visionModel, '图片中是什么颜色？', {
          images: [options.sampleImageDataUrl],
        }),
      );
      vision = response.content.length > 0;
      checks.vision = { passed: vision };
    } catch (error: unknown) {
      checks.vision = {
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    checks.vision = { passed: false, detail: '未配置视觉模型或样例图' };
  }

  let toolCalls = false;
  try {
    const response = await provider.chat(
      request(`probe:tools:${crypto.randomUUID()}`, options.textModel, '调用 echo 工具', {
        tools: [
          {
            type: 'function',
            function: {
              name: 'echo',
              description: '原样返回输入',
              parameters: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
              },
            },
          },
        ],
      }),
    );
    toolCalls = Boolean(response.toolCalls?.length);
    checks.toolCalls = { passed: toolCalls };
  } catch (error: unknown) {
    checks.toolCalls = {
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let structuredOutput = false;
  try {
    const response = await provider.chat(
      request(`probe:json:${crypto.randomUUID()}`, options.textModel, '返回 {"ok":true}', {
        responseFormat: { type: 'json_object' },
      }),
    );
    const parsed = JSON.parse(response.content) as { ok?: unknown };
    structuredOutput = parsed.ok === true;
    checks.structuredOutput = { passed: structuredOutput };
  } catch (error: unknown) {
    checks.structuredOutput = {
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let errorFormat = false;
  let rateLimitFormat = false;
  try {
    await provider.chat(
      request(
        `probe:error:${crypto.randomUUID()}`,
        'git-helper-intentionally-invalid-model',
        'ping',
      ),
    );
    checks.errorFormat = {
      passed: false,
      detail: '无效模型未返回预期错误，未验证错误格式',
    };
  } catch (error: unknown) {
    errorFormat = error instanceof ProviderError;
    rateLimitFormat = error instanceof ProviderError && error.code === 'RATE_LIMIT';
    checks.errorFormat = {
      passed: errorFormat,
      detail: error instanceof Error ? error.message : String(error),
    };
    checks.rateLimitFormat = {
      passed: rateLimitFormat,
      detail: rateLimitFormat ? '真实端点返回限流格式' : '本轮未触发真实限流；仅 Mock 映射已验证',
    };
  }

  const probedAt = (options.now?.() ?? new Date()).toISOString();
  const summary: CapabilityProbeSummary = {
    providerId: provider.id,
    text,
    streaming,
    abort,
    vision,
    toolCalls,
    structuredOutput,
    usage,
    errorFormat,
    rateLimitFormat,
    probedAt,
    failureReason: text ? undefined : (checks.text?.detail ?? '文本探针失败'),
  };
  return {
    summary,
    capabilities: {
      ...provider.capabilities,
      supportsStreaming: streaming,
      supportsVision: vision,
      supportsToolCalls: toolCalls,
      supportsStructuredOutput: structuredOutput,
      supportsUsage: usage,
      supportsAbort: abort,
      probedAt,
    },
    models,
    checks,
  };
}
