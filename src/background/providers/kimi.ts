import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class KimiProvider extends OpenAICompatibleProvider {
  readonly id = 'kimi' as const;
  readonly label = 'Kimi（月之暗面 API）';
  readonly apiHost = 'https://api.moonshot.cn';
  protected readonly chatEndpoint = 'https://api.moonshot.cn/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://api.moonshot.cn/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
