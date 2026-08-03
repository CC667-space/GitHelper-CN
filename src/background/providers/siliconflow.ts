import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class SiliconFlowProvider extends OpenAICompatibleProvider {
  readonly id = 'siliconflow' as const;
  readonly label = 'SiliconFlow';
  readonly apiHost = 'https://api.siliconflow.cn';
  protected readonly chatEndpoint = 'https://api.siliconflow.cn/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://api.siliconflow.cn/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
