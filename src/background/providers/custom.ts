import { normalizeCustomProviderUrl } from '../../lib/custom-provider-config';
import { providerSettingsStore } from '../../lib/provider-settings';
import type { ProviderCapabilities } from '../../lib/types';
import type {
  Provider,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderModel,
  ProviderStreamChunk,
  ProviderTransport,
} from './base';
import { OpenAICompatibleProvider } from './base';

interface CustomSettingsReader {
  read(): ReturnType<ReturnType<typeof providerSettingsStore>['read']>;
}

class ConfiguredCustomProvider extends OpenAICompatibleProvider {
  readonly id = 'custom' as const;
  readonly label = '自定 Provider（OpenAI-compatible）';
  readonly apiHost: string;
  protected readonly chatEndpoint: string;
  protected readonly modelsEndpoint: string;

  constructor(transport: ProviderTransport, baseUrl: string) {
    const normalized = normalizeCustomProviderUrl(baseUrl);
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
    this.apiHost = normalized.apiHost;
    this.chatEndpoint = normalized.chatEndpoint;
    this.modelsEndpoint = normalized.modelsEndpoint;
  }
}

const UNPROBED_CUSTOM_CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: false,
  supportsVision: false,
  supportsToolCalls: false,
  supportsStructuredOutput: false,
  supportsUsage: false,
  supportsAbort: false,
  imageInputFormat: 'openai_image_url',
  toolCallStreamingFormat: 'openai_delta',
  errorResponseFormat: 'openai',
};

export class CustomProvider implements Provider {
  readonly id = 'custom' as const;
  readonly label = '自定 Provider（OpenAI-compatible）';
  readonly apiHost = '';
  readonly capabilities = UNPROBED_CUSTOM_CAPABILITIES;
  private readonly active = new Map<string, Provider>();

  constructor(
    private readonly transport: ProviderTransport,
    private readonly settings: CustomSettingsReader = providerSettingsStore(),
  ) {}

  async chat(request: ProviderChatRequest, signal?: AbortSignal): Promise<ProviderChatResponse> {
    const delegate = await this.delegate();
    this.active.set(request.requestId, delegate);
    try {
      return await delegate.chat(request, signal);
    } finally {
      this.active.delete(request.requestId);
    }
  }

  async *chatStream(
    request: ProviderChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderStreamChunk> {
    const delegate = await this.delegate();
    this.active.set(request.requestId, delegate);
    try {
      yield* delegate.chatStream(request, signal);
    } finally {
      this.active.delete(request.requestId);
    }
  }

  abort(requestId: string): boolean {
    return this.active.get(requestId)?.abort(requestId) ?? false;
  }

  async listModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    return await (await this.delegate()).listModels(signal);
  }

  private async delegate(): Promise<ConfiguredCustomProvider> {
    const setting = (await this.settings.read()).providers.custom;
    if (!setting.baseUrl) {
      throw new Error('自定 Provider 尚未配置 API Base URL');
    }
    return new ConfiguredCustomProvider(this.transport, setting.baseUrl);
  }
}
