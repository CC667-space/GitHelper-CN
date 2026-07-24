import { describe, expect, it } from 'vitest';

import { runCapabilityProbe } from '../../src/background/capability-probe';
import {
  ProviderError,
  type Provider,
  type ProviderChatRequest,
  type ProviderStreamChunk,
} from '../../src/background/providers/base';
import type { ProviderCapabilities } from '../../src/lib/types';

class ProbeProvider implements Provider {
  readonly id = 'uuapi' as const;
  readonly label = 'UUAPI Mock';
  readonly apiHost = 'https://uuapi.net';
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: false,
    supportsVision: false,
    supportsToolCalls: false,
    supportsStructuredOutput: false,
    supportsUsage: false,
    supportsAbort: false,
    imageInputFormat: 'openai_image_url',
    toolCallStreamingFormat: 'none',
    errorResponseFormat: 'custom',
  };
  private abortReject?: (error: Error) => void;
  private abortRequestId?: string;

  async chat(request: ProviderChatRequest) {
    if (request.model === 'git-helper-intentionally-invalid-model') {
      throw new ProviderError('MODEL_UNAVAILABLE', 'invalid model', 404);
    }
    if (request.responseFormat) {
      return { content: '{"ok":true}' };
    }
    if (request.tools) {
      return {
        content: '',
        toolCalls: [{ name: 'echo', args: { text: 'ok' } }],
      };
    }
    return {
      content: request.images?.length ? 'red' : 'OK',
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }

  async *chatStream(request: ProviderChatRequest): AsyncIterable<ProviderStreamChunk> {
    const content = request.messages[0]?.content;
    if (typeof content === 'string' && content.includes('缓慢')) {
      this.abortRequestId = request.requestId;
      await new Promise<never>((_resolve, reject) => {
        this.abortReject = reject;
      });
    }
    yield { delta: 'OK' };
    yield { done: true };
  }

  abort(requestId: string): boolean {
    if (requestId !== this.abortRequestId || !this.abortReject) {
      return false;
    }
    this.abortReject(new ProviderError('ABORTED', 'cancelled'));
    return true;
  }

  async listModels() {
    return [
      {
        id: 'vision-model',
        inputModalities: ['text', 'image'],
        supportedParameters: ['tools', 'structured_outputs'],
      },
    ];
  }
}

describe('Capability probe', () => {
  it('只把实际通过的能力写入带时间戳报告', async () => {
    const report = await runCapabilityProbe(new ProbeProvider(), {
      textModel: 'text-model',
      visionModel: 'vision-model',
      sampleImageDataUrl: 'data:image/png;base64,AA==',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
    });
    expect(report.summary).toMatchObject({
      providerId: 'uuapi',
      text: true,
      streaming: true,
      abort: true,
      vision: true,
      toolCalls: true,
      structuredOutput: true,
      usage: true,
      errorFormat: true,
      rateLimitFormat: false,
      probedAt: '2026-07-24T00:00:00.000Z',
    });
    expect(report.capabilities.probedAt).toBe('2026-07-24T00:00:00.000Z');
    expect(report.checks.rateLimitFormat?.detail).toMatch(/未触发真实限流/);
  });
});
