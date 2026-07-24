import type { ProviderTransport } from './base';
import { OpenAICompatibleProvider, ProviderError } from './base';

export class UuapiProvider extends OpenAICompatibleProvider {
  readonly id = 'uuapi' as const;
  readonly label = 'UUAPI';
  readonly apiHost = 'https://uuapi.net';
  protected readonly chatEndpoint = 'https://uuapi.net/v1/chat/completions';
  protected readonly modelsEndpoint = 'https://uuapi.net/v1/models';

  constructor(transport: ProviderTransport) {
    super(transport, {
      imageInputFormat: 'openai_image_url',
      errorResponseFormat: 'custom',
    });
  }

  protected override async extractErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.clone().json()) as {
        error?: { message?: string; msg?: string } | string;
        msg?: string;
        message?: string;
      };
      if (typeof payload.error === 'string') {
        return payload.error;
      }
      return (
        payload.error?.message ??
        payload.error?.msg ??
        payload.msg ??
        payload.message ??
        `HTTP ${response.status}`
      );
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  protected override streamError(error: unknown): ProviderError {
    const candidate = error as { message?: unknown; msg?: unknown };
    const message =
      typeof candidate?.message === 'string'
        ? candidate.message
        : typeof candidate?.msg === 'string'
          ? candidate.msg
          : String(error);
    return new ProviderError('HTTP_ERROR', `UUAPI: ${message}`);
  }
}
