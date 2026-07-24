import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderRuntime } from '../../src/background/provider-runtime';
import type { Provider, ProviderChatResponse } from '../../src/background/providers/base';
import type { ProviderCapabilities, ProviderId } from '../../src/lib/types';
import type { RepositoryAnalysisFacts } from '../../src/background/repository-analysis';

function facts(): RepositoryAnalysisFacts {
  return {
    repository: 'react/react',
    url: 'https://github.com/react/react',
    description: 'The library for web and native user interfaces.',
    topics: ['react'],
    primaryLanguage: 'JavaScript',
    languages: [{ name: 'JavaScript', percent: 100 }],
    detectedPlatforms: ['Web/Browser'],
    installCommands: ['npm install react'],
    stars: 240_000,
  };
}

function provider(chat: Provider['chat'], supportsStructuredOutput: boolean): Provider {
  const capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalls: false,
    supportsStructuredOutput,
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

function validResponse(): ProviderChatResponse {
  return {
    content: JSON.stringify({
      purpose: '用于构建 Web 和原生用户界面。',
      platforms: ['Web/Browser'],
      installation: ['npm install react'],
      difficulty: { level: '入门', reason: '提供标准 npm 安装方式。' },
      risks: ['需核对 React 版本兼容性。'],
      nextSteps: ['阅读官方快速开始。'],
    }),
  };
}

function stubStorage(structuredOutput: boolean): void {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) =>
          key === 'provider:probes:v1'
            ? {
                'provider:probes:v1': {
                  schemaVersion: 1,
                  results: {
                    deepseek: {
                      providerId: 'deepseek',
                      text: true,
                      streaming: true,
                      abort: true,
                      vision: false,
                      toolCalls: false,
                      structuredOutput,
                      usage: true,
                      errorFormat: true,
                      rateLimitFormat: true,
                      probedAt: '2026-07-24T00:00:00.000Z',
                    },
                  },
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

describe('ProviderRuntime repository structured analysis', () => {
  it('Provider 支持 structuredOutput 时发送 json_object 并通过本地 Schema', async () => {
    stubStorage(true);
    const chat = vi.fn<Provider['chat']>(async () => validResponse());
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, true)]]),
    );

    const result = await runtime.generateRepositoryInsights({
      requestId: 'analysis-1',
      facts: facts(),
      signal: new AbortController().signal,
    });

    expect(result.insights.difficulty.level).toBe('入门');
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0]?.[0]).toMatchObject({
      responseFormat: { type: 'json_object' },
    });
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('不得输出或改写 Star');
  });

  it('能力未验证时用 Prompt+zod，非法 JSON 只重试一次后成功', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({ content: 'not json' })
      .mockResolvedValueOnce(validResponse());
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    await expect(
      runtime.generateRepositoryInsights({
        requestId: 'analysis-2',
        facts: facts(),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ providerId: 'deepseek' });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0]?.[0].responseFormat).toBeUndefined();
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).toContain('未通过本地 zod 校验');
  });

  it('网络/Provider 错误不重复请求，交由上层降级', async () => {
    stubStorage(false);
    const chat = vi.fn<Provider['chat']>(async () => {
      throw new Error('network down');
    });
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );
    await expect(
      runtime.generateRepositoryInsights({
        requestId: 'analysis-3',
        facts: facts(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/network down/);
    expect(chat).toHaveBeenCalledOnce();
  });
});
