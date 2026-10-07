import type { ProviderChatRequest, ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

const LEGACY_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);

export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly id = 'deepseek' as const;
  readonly label = 'DeepSeek';
  readonly apiHost = 'https://api.deepseek.com';
  protected readonly chatEndpoint = 'https://api.deepseek.com/chat/completions';
  protected readonly modelsEndpoint = 'https://api.deepseek.com/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      supportsVision: true,
      imageInputFormat: 'openai_image_url',
      errorResponseFormat: 'custom',
    });
  }

  protected override mapModel(model: string): string {
    if (LEGACY_MODELS.has(model)) {
      throw new Error(`${model} 已停用，请使用 deepseek-flash 或 deepseek-v4-pro`);
    }
    return model || 'deepseek-flash';
  }

  protected override buildRequestBody(
    request: ProviderChatRequest,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      ...super.buildRequestBody(request, stream),
      thinking: { type: 'disabled' },
    };
  }
}
