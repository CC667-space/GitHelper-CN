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
    fileSnapshot: {
      directories: ['packages'],
      inspectedFiles: [
        {
          path: 'package.json',
          content: '{"name":"react","scripts":{"test":"yarn test"}}',
        },
      ],
      truncated: true,
    },
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
      overview: {
        summary: 'React 帮你把页面拆成可复用的组件，再组合成完整界面。',
        highlights: ['适合构建 Web 和原生界面', '组件可以在不同页面重复使用'],
      },
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
                        structuredOutput,
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

    expect(result.insights.difficulty?.level).toBe('入门');
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0]?.[0]).toMatchObject({
      responseFormat: { type: 'json_object' },
    });
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('不得输出或改写 Star');
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('实际检查的关键文件');
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain(
      '所有面向用户的自然语言内容必须使用简体中文',
    );
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('不要逐句翻译');
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('避免堆砌专业名词');
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('先说用户能做什么');
    expect(chat.mock.calls[0]?.[0].messages[0]?.content).toContain('不要写成“闭环学习”');
    expect(chat.mock.calls[0]?.[0].messages[1]?.content).toContain(
      '"content":"{\\"name\\":\\"react\\",\\"scripts\\":{\\"test\\":\\"yarn test\\"}}"',
    );
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
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).toContain('未通过本地校验');
  });

  it('保留 Provider 已返回的有效速览字段，忽略额外事实字段且不重试', async () => {
    stubStorage(false);
    const chat = vi.fn<Provider['chat']>(async () => ({
      content: JSON.stringify({
        overview: {
          summary: '这是一个帮助你搭建个人 AI 助手的项目。',
          highlights: ['可以从多个入口使用', '能按需要扩展功能'],
        },
        readmeSummary: '这是一个可扩展的个人 AI 助手框架。',
        features: ['支持多种 Agent 与应用入口'],
        configuration: ['通过项目清单安装依赖'],
        stars: 999_999,
      }),
    }));
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    const result = await runtime.generateRepositoryInsights({
      requestId: 'analysis-partial',
      facts: facts(),
      signal: new AbortController().signal,
    });

    expect(result.insights).toEqual({
      overview: {
        summary: '这是一个帮助你搭建个人 AI 助手的项目。',
        highlights: ['可以从多个入口使用', '能按需要扩展功能'],
      },
      readmeSummary: '这是一个可扩展的个人 AI 助手框架。',
      features: ['支持多种 Agent 与应用入口'],
      configuration: ['通过项目清单安装依赖'],
    });
    expect(result.insights).not.toHaveProperty('stars');
    expect(chat).toHaveBeenCalledOnce();
  });

  it('Provider 返回英文自然语言字段时重试并只接受中文结果', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: 'A repository analysis helper for GitHub beginners.',
            highlights: ['Summarizes project files.'],
          },
          purpose: 'A repository analysis helper for GitHub beginners.',
          features: ['Summarizes README and project configuration.'],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '它会读取仓库里的说明和关键文件，再用中文解释项目。',
            highlights: ['先说清项目用途', '再列出值得注意的文件'],
          },
          purpose: '面向 GitHub 新手的仓库分析助手。',
          features: ['概括 README 与项目配置'],
        }),
      });
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    await expect(
      runtime.generateRepositoryInsights({
        requestId: 'analysis-chinese-retry',
        facts: facts(),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      insights: {
        overview: {
          summary: '它会读取仓库里的说明和关键文件，再用中文解释项目。',
          highlights: ['先说清项目用途', '再列出值得注意的文件'],
        },
        purpose: '面向 GitHub 新手的仓库分析助手。',
        features: ['概括 README 与项目配置'],
      },
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).toContain('均为简体中文');
  });

  it('生硬直译术语会被拒绝，并在重试时改写为新手能理解的中文', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '这是一个提供闭环学习与跨会话回溯的智能代理。',
            highlights: ['随你所在', '支持多终端后端'],
          },
          purpose: '这是一个会积累使用经验的个人 AI 助手。',
          features: ['保存并复用过去的工作经验'],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '它会记住过去的使用经验，之后处理相似任务时可以直接复用。',
            highlights: ['适合长期重复使用', '换一个入口也能继续之前的工作'],
          },
        }),
      });
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    const result = await runtime.generateRepositoryInsights({
      requestId: 'analysis-natural-chinese',
      facts: facts(),
      signal: new AbortController().signal,
    });

    expect(result.insights).toMatchObject({
      overview: {
        summary: '它会记住过去的使用经验，之后处理相似任务时可以直接复用。',
      },
      purpose: '这是一个会积累使用经验的个人 AI 助手。',
      features: ['保存并复用过去的工作经验'],
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).toContain(
      '只补充或修正以下字段：overview',
    );
  });

  it('有仓库文件证据时必须返回新手总结，缺失后只重试一次', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          purpose: '这是一个界面开发工具。',
          features: ['支持可复用组件'],
        }),
      })
      .mockResolvedValueOnce(validResponse());
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    await expect(
      runtime.generateRepositoryInsights({
        requestId: 'analysis-overview-required',
        facts: facts(),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      insights: {
        overview: {
          summary: expect.stringContaining('可复用的组件'),
        },
      },
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).toContain('总结速览');
  });

  it('总结速览过长时只重试一次并接受精简结果', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '这'.repeat(181),
            highlights: ['先理解项目用途', '再决定是否深入查看'],
          },
        }),
      })
      .mockResolvedValueOnce(validResponse());
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    const result = await runtime.generateRepositoryInsights({
      requestId: 'analysis-overview-length',
      facts: facts(),
      signal: new AbortController().signal,
    });

    expect(result.insights.overview?.summary.length).toBeLessThanOrEqual(180);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('修复 overview 时保留首轮已经可用的详细介绍字段', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '',
            highlights: [],
          },
          purpose: '这是一个会积累使用经验、帮助用户持续完成任务的个人 AI 助手。',
          readmeSummary: '项目提供记忆、定时任务、多平台消息入口和终端操作能力。',
          features: ['记住过去的对话和工作经验', '通过聊天软件或命令行继续同一项工作'],
          configuration: ['package.json: scripts.install:web'],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '它是一个能记住使用经验，并在不同设备上继续工作的个人 AI 助手。',
            highlights: ['适合长期重复使用', '可以从聊天软件或命令行使用'],
          },
        }),
      });
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    const result = await runtime.generateRepositoryInsights({
      requestId: 'analysis-overview-repair',
      facts: facts(),
      signal: new AbortController().signal,
    });

    expect(result.insights).toMatchObject({
      overview: {
        summary: '它是一个能记住使用经验，并在不同设备上继续工作的个人 AI 助手。',
      },
      purpose: '这是一个会积累使用经验、帮助用户持续完成任务的个人 AI 助手。',
      readmeSummary: '项目提供记忆、定时任务、多平台消息入口和终端操作能力。',
      features: ['记住过去的对话和工作经验', '通过聊天软件或命令行继续同一项工作'],
      configuration: ['package.json: scripts.install:web'],
    });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).toContain(
      '只补充或修正以下字段：overview',
    );
    expect(chat.mock.calls[1]?.[0].messages[1]?.content).not.toContain(
      'purpose、readmeSummary、features',
    );
  });

  it('技术字段可保留命令和包名，不会被误判为英文自然语言', async () => {
    stubStorage(false);
    const chat = vi.fn<Provider['chat']>(async () => ({
      content: JSON.stringify({
        overview: {
          summary: '这是一个能帮助开发者构建网页界面的工具。',
          highlights: ['组件可以重复使用', '适合逐步搭建复杂页面'],
        },
        configuration: ['npm install react', 'package.json: scripts.test'],
        implementationNotes: ['packages/react/src: createElement'],
      }),
    }));
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    await expect(
      runtime.generateRepositoryInsights({
        requestId: 'analysis-technical-fields',
        facts: facts(),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      insights: {
        configuration: ['npm install react', 'package.json: scripts.test'],
      },
    });
    expect(chat).toHaveBeenCalledOnce();
  });

  it('技术字段中的英文解释句仍需重写为中文', async () => {
    stubStorage(false);
    const chat = vi
      .fn<Provider['chat']>()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '这是一个能帮助开发者构建网页界面的工具。',
            highlights: ['组件可以重复使用', '适合逐步搭建复杂页面'],
          },
          configuration: ['Uses package.json to manage build and test tasks.'],
          implementationNotes: ['The core packages are organized by feature.'],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          overview: {
            summary: '这是一个能帮助开发者构建网页界面的工具。',
            highlights: ['组件可以重复使用', '适合逐步搭建复杂页面'],
          },
          configuration: ['项目通过 package.json 管理构建与测试任务。'],
          implementationNotes: ['核心代码按功能拆分到不同 package。'],
        }),
      });
    const runtime = new ProviderRuntime(
      new Map<ProviderId, Provider>([['deepseek', provider(chat, false)]]),
    );

    await expect(
      runtime.generateRepositoryInsights({
        requestId: 'analysis-technical-narrative',
        facts: facts(),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      insights: {
        configuration: ['项目通过 package.json 管理构建与测试任务。'],
      },
    });
    expect(chat).toHaveBeenCalledTimes(2);
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
