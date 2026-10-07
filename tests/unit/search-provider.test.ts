import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderRuntime } from '../../src/background/provider-runtime';
import { ProviderError, type Provider } from '../../src/background/providers/base';
import type { ProviderCapabilities, ProviderId } from '../../src/lib/types';

function provider(chat: Provider['chat']): Provider {
  const capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalls: false,
    supportsStructuredOutput: true,
    supportsUsage: true,
    supportsAbort: true,
    imageInputFormat: 'none',
    toolCallStreamingFormat: 'none',
    errorResponseFormat: 'openai',
  };
  return {
    id: 'deepseek',
    label: 'DeepSeek',
    apiHost: 'https://api.deepseek.com',
    capabilities,
    chat,
    chatStream: vi.fn(),
    abort: vi.fn(() => false),
    listModels: vi.fn(async () => []),
  };
}

function stubStorage(): void {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) =>
          key === 'provider:probes:v1'
            ? {
                'provider:probes:v1': {
                  schemaVersion: 2,
                  results: {
                    deepseek: {
                      summary: {
                        providerId: 'deepseek',
                        text: true,
                        streaming: true,
                        abort: true,
                        vision: false,
                        toolCalls: false,
                        structuredOutput: true,
                        usage: true,
                        errorFormat: true,
                        rateLimitFormat: true,
                        probedAt: '2026-07-24T00:00:00.000Z',
                      },
                      binding: {
                        credentialRevision: 'test-revision',
                        textModel: 'deepseek-flash',
                        visionModel: 'deepseek-flash',
                      },
                    },
                  },
                },
              }
            : key === 'credential:provider:deepseek'
              ? {
                  'credential:provider:deepseek': {
                    providerId: 'deepseek',
                    apiKey: 'deepseek-test-key',
                    revision: 'test-revision',
                  },
                }
              : {},
        ),
        set: vi.fn(),
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProviderRuntime search intent', () => {
  it('只调用一次文本 Provider，并返回通过 Schema 的受限搜索结构', async () => {
    stubStorage();
    const chat = vi.fn<Provider['chat']>(async () => ({
      content: JSON.stringify({
        target: 'repositories',
        keywords: ['AI'],
        stars: { operator: '>', value: 1_000 },
        pushedWithin: { amount: 2, unit: 'months' },
      }),
    }));
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat)]]),
    );

    await expect(
      runtime.generateSearchIntent({
        requestId: 'search-intent-1',
        naturalLanguage: '最近两个月 Star 超过 1000 的 AI 相关项目',
        requestedTarget: 'auto',
        now: new Date('2026-07-28T08:00:00.000Z'),
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      intent: {
        target: 'repositories',
        keywords: ['AI'],
        stars: { operator: '>', value: 1_000 },
        pushedWithin: { amount: 2, unit: 'months' },
      },
      providerId: 'deepseek',
      providerLabel: 'DeepSeek',
    });

    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0]?.[0]).toMatchObject({
      requestId: 'search-intent-1:search-intent',
      responseFormat: { type: 'json_object' },
      maxTokens: 350,
      temperature: 0,
    });
    const serializedMessages = JSON.stringify(chat.mock.calls[0]?.[0].messages);
    expect(serializedMessages).toContain('最近两个月 Star 超过 1000 的 AI 相关项目');
    expect(serializedMessages).not.toContain('PageContext');
  });

  it('把不符合搜索 Schema 的 Provider 内容归类为 INVALID_RESPONSE', async () => {
    stubStorage();
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([
        [
          'deepseek',
          provider(
            vi.fn(async () => ({
              content: '{"target":"repository","keywords":["voice cloning"]}',
            })),
          ),
        ],
      ]),
    );

    const result = runtime.generateSearchIntent({
      requestId: 'search-intent-invalid',
      naturalLanguage: '声音克隆',
      requestedTarget: 'auto',
      signal: new AbortController().signal,
    });

    await expect(result).rejects.toBeInstanceOf(ProviderError);
    await expect(result).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
