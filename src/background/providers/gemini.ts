import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class GeminiProvider extends OpenAICompatibleProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Google Gemini';
  readonly apiHost = 'https://generativelanguage.googleapis.com';
  protected readonly chatEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  protected readonly modelsEndpoint =
    'https://generativelanguage.googleapis.com/v1beta/openai/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
