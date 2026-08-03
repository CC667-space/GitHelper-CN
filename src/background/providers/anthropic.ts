import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class AnthropicProvider extends OpenAICompatibleProvider {
  readonly id = 'anthropic' as const;
  readonly label = 'Anthropic';
  readonly apiHost = 'https://api.anthropic.com';
  protected readonly chatEndpoint = 'https://api.anthropic.com/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://api.anthropic.com/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
