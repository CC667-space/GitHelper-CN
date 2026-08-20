import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class GlmProvider extends OpenAICompatibleProvider {
  readonly id = 'glm' as const;
  readonly label = 'GLM（智谱 API）';
  readonly apiHost = 'https://open.bigmodel.cn';
  protected readonly chatEndpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  protected readonly modelsEndpoint = 'https://open.bigmodel.cn/api/paas/v4/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
