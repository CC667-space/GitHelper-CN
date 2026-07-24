import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider, ProviderError } from './base';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly id = 'openrouter' as const;
  readonly label = 'OpenRouter';
  readonly apiHost = 'https://openrouter.ai';
  protected readonly chatEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://openrouter.ai/api/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }

  protected override requestHeaders(): HeadersInit {
    return {
      ...super.requestHeaders(),
      'X-OpenRouter-Title': 'GitHelper-CN',
    };
  }

  protected override streamError(error: unknown): ProviderError {
    const candidate = error as { message?: unknown; code?: unknown };
    const message =
      typeof candidate?.message === 'string' ? candidate.message : JSON.stringify(error);
    const code = candidate?.code === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR';
    return new ProviderError(code, `OpenRouter: ${message}`);
  }
}
