import type { ProviderChatRequest, ProviderMessage, ProviderTransport } from './base';
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
      supportsVision: false,
      imageInputFormat: 'none',
      errorResponseFormat: 'custom',
    });
  }

  protected override mapModel(model: string): string {
    if (LEGACY_MODELS.has(model)) {
      throw new Error(`${model} 已停用，请使用 deepseek-v4-flash 或 deepseek-v4-pro`);
    }
    return model || 'deepseek-v4-flash';
  }

  protected override withImages(request: ProviderChatRequest): ProviderMessage[] {
    if (request.images?.length) {
      throw new Error('DeepSeek API 不支持图像输入，请切换 UUAPI 或 OpenRouter');
    }
    return request.messages;
  }
}
