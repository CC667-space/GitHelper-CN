import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class QwenProvider extends OpenAICompatibleProvider {
  readonly id = 'qwen' as const;
  readonly label = '阿里云百炼 / Qwen';
  readonly apiHost = 'https://dashscope.aliyuncs.com';
  protected readonly chatEndpoint =
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }
}
