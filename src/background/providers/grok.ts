import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class GrokProvider extends OpenAICompatibleProvider {
  readonly id = 'grok' as const;
  readonly label = 'Grok（xAI API）';
  readonly apiHost = 'https://api.x.ai';
  protected readonly chatEndpoint = 'https://api.x.ai/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://api.x.ai/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
