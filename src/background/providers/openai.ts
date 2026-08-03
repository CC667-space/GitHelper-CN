import type { ProviderChatRequest, ProviderTransport } from './base';
import { OpenAICompatibleProvider } from './base';

export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly id = 'openai' as const;
  readonly label = 'OpenAI';
  readonly apiHost = 'https://api.openai.com';
  protected readonly chatEndpoint = 'https://api.openai.com/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://api.openai.com/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      toolCallStreamingFormat: 'openai_delta',
      errorResponseFormat: 'openai',
    });
  }

  protected override buildRequestBody(
    request: ProviderChatRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const body = super.buildRequestBody(request, stream);
    if (request.maxTokens !== undefined) {
      delete body.max_tokens;
      body.max_completion_tokens = request.maxTokens;
    }
    return body;
  }
}
