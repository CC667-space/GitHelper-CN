import { describe, expect, it, vi } from 'vitest';

import {
  RepositoryAnalysisExecutor,
  type RepositoryInsightGenerator,
} from '../../src/background/repository-analysis';
import {
  GitHubRateLimitError,
  type GitHubApiClient,
  type RepositoryApiBundle,
} from '../../src/background/github-api';

function page(repository: string, readme: string) {
  return {
    url: `https://github.com/${repository}`,
    pageType: 'repo' as const,
    repository,
    isPrivate: false,
    extracted: {
      description: `${repository} public repository`,
      languages: ['TypeScript 80%', 'JavaScript 20%'],
      stats: { stars: '1.2k', forks: '100', watchers: '50' },
      readme,
    },
    capturedAt: '2026-07-24T00:00:00.000Z',
  };
}

function bundle(
  repository: string,
  overrides: Partial<RepositoryApiBundle> = {},
): RepositoryApiBundle {
  return {
    details: {
      fullName: repository,
      url: `https://github.com/${repository}`,
      description: `${repository} description`,
      topics: ['developer-tools', 'cli'],
      defaultBranch: 'main',
      primaryLanguage: 'TypeScript',
      stars: 12_345,
      forks: 1_234,
      watchers: 321,
      combinedOpenCount: 50,
      archived: false,
      license: { name: 'MIT License', spdxId: 'MIT' },
      pushedAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
    languages: { TypeScript: 800, JavaScript: 200 },
    latestRelease: {
      name: 'Version 1',
      tag: 'v1.0.0',
      publishedAt: '2026-07-01T00:00:00.000Z',
      url: `https://github.com/${repository}/releases/tag/v1.0.0`,
    },
    openPullRequests: 10,
    ...overrides,
  };
}

const generator: RepositoryInsightGenerator = vi.fn<RepositoryInsightGenerator>(async (facts) => ({
  providerId: 'deepseek' as const,
  insights: {
    purpose: `用于解释 ${facts.repository} 的主要用途。`,
    platforms: ['CLI'],
    installation: ['provider install suggestion'],
    difficulty: { level: '中等', reason: '需要 Node.js 环境。' },
    risks: ['需核对运行时版本。'],
    nextSteps: ['先运行最小示例。'],
  },
}));

describe('RepositoryAnalysisExecutor', () => {
  it.each([
    ['react/react', 'npm install react'],
    ['microsoft/vscode', 'git clone https://github.com/microsoft/vscode'],
    ['rust-lang/rust', 'cargo install x'],
  ])('为真实公开仓库 %s 生成完整固定 Schema 卡片', async (repository, command) => {
    const getRepositoryBundle = vi.fn(async () => bundle(repository));
    const executor = new RepositoryAnalysisExecutor(
      { getRepositoryBundle } as unknown as GitHubApiClient,
      generator,
    );

    const card = await executor.analyze({
      page: page(repository, `# Install\n\n${command}\n\nSupports Linux and Windows CLI.`),
      signal: new AbortController().signal,
      requestId: `analysis:${repository}`,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(card).toMatchObject({
      repository,
      popularity: { stars: 12_345, forks: 1_234, watchers: 321 },
      issuesAndPullRequests: {
        openIssues: 40,
        openPullRequests: 10,
        combinedOpenCount: 50,
      },
      archived: false,
      license: { spdxId: 'MIT' },
      sources: { dom: true, githubApi: true, provider: true },
    });
    expect(card.installation).toEqual({ steps: [command], source: 'readme' });
    expect(card.languages).toEqual([
      { name: 'TypeScript', percent: 80 },
      { name: 'JavaScript', percent: 20 },
    ]);
    expect(card.platforms).toEqual(expect.arrayContaining(['Windows', 'Linux', 'CLI']));
  });

  it('Release、许可证和语言缺失时保留固定字段并给出风险', async () => {
    const incomplete = bundle('octocat/Hello-World', {
      languages: {},
      latestRelease: undefined,
      details: {
        ...bundle('octocat/Hello-World').details,
        primaryLanguage: undefined,
        license: undefined,
      },
    });
    const executor = new RepositoryAnalysisExecutor({
      getRepositoryBundle: vi.fn(async () => incomplete),
    } as unknown as GitHubApiClient);
    const card = await executor.analyze({
      page: page('octocat/Hello-World', 'No installation section.'),
      signal: new AbortController().signal,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(card.release).toBeNull();
    expect(card.license).toBeNull();
    expect(card.languages).toEqual([
      { name: 'TypeScript', percent: 80 },
      { name: 'JavaScript', percent: 20 },
    ]);
    expect(card.risks.join(' ')).toMatch(/许可证/);
    expect(card.risks.join(' ')).toMatch(/Release/);
    expect(card.installation.source).toBe('unknown');
  });

  it('core 桶已限流时只调用一次 API 并使用 DOM 降级', async () => {
    const getRepositoryBundle = vi.fn(async () => {
      throw new GitHubRateLimitError('core', Date.parse('2026-07-24T01:00:00.000Z'));
    });
    const executor = new RepositoryAnalysisExecutor({
      getRepositoryBundle,
    } as unknown as GitHubApiClient);
    const card = await executor.analyze({
      page: page('octocat/Hello-World', 'npm install hello-world'),
      signal: new AbortController().signal,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(getRepositoryBundle).toHaveBeenCalledOnce();
    expect(card.sources).toEqual({ dom: true, githubApi: false, provider: false });
    expect(card.popularity.stars).toBe(1_200);
    expect(card.degradedNotice).toMatch(/未重复请求 API/);
  });

  it('Provider 失败时保留 API 事实并降级为本地解释', async () => {
    const executor = new RepositoryAnalysisExecutor(
      {
        getRepositoryBundle: vi.fn(async () => bundle('react/react')),
      } as unknown as GitHubApiClient,
      vi.fn(async () => {
        throw new Error('invalid JSON');
      }),
    );
    const card = await executor.analyze({
      page: page(
        'react/react',
        [
          '# React',
          '',
          '一个用于构建组件化用户界面的开发库。',
          '',
          '## 主要功能',
          '',
          '- 使用可复用组件构建界面',
          '- 支持 Web 和原生平台',
          '',
          '## Installation',
          '',
          'npm install react',
        ].join('\n'),
      ),
      signal: new AbortController().signal,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(card.popularity.stars).toBe(12_345);
    expect(card.sources.provider).toBe(false);
    expect(card.quickScan).toMatchObject({
      source: 'readme',
      readmeSummary: expect.stringMatching(/组件化用户界面/u),
      features: expect.arrayContaining([
        expect.stringMatching(/可复用组件/u),
        expect.stringMatching(/Web 和原生平台/u),
      ]),
    });
    expect(card.quickScan.configuration).toEqual(
      expect.arrayContaining([expect.stringMatching(/npm install react/iu)]),
    );
    expect(card.degradedNotice).toContain('本地确定性说明');
  });

  it('仓库重定向后采用 GitHub API 返回的 canonical 名称与 URL', async () => {
    const redirected = bundle('react/react');
    const executor = new RepositoryAnalysisExecutor({
      getRepositoryBundle: vi.fn(async () => redirected),
    } as unknown as GitHubApiClient);
    const card = await executor.analyze({
      page: page('facebook/react', 'npm install react'),
      signal: new AbortController().signal,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(card.repository).toBe('react/react');
    expect(card.url).toBe('https://github.com/react/react');
  });

  it('读取实际关键文件并把项目结构与内容证据放进分析卡，而不是只返回语言比例', async () => {
    const repository = 'example/real-files';
    const withFiles = {
      ...bundle(repository),
      fileSnapshot: {
        directories: ['src', 'tests', 'scripts'],
        truncated: false,
        inspectedFiles: [
          {
            path: 'README.md',
            content: [
              '<p align="center"><img src="assets/banner.png" alt="real-files"></p>',
              '',
              '# real-files �',
              '',
              'A toolkit for inspecting actual project files.',
              '',
              '<table>',
              '<tr><td><b>受限证据</b></td><td>读取受限的配置文件证据。</td></tr>',
              '<tr><td><b>安全概括</b></td><td>根据已检查文件生成简练结论。</td></tr>',
              '</table>',
            ].join('\n'),
          },
          {
            path: 'package.json',
            content: JSON.stringify({
              name: 'real-files',
              scripts: { build: 'vite build', test: 'vitest run' },
              dependencies: { react: '18.3.1', zod: '4.4.3' },
            }),
          },
          {
            path: 'src/main.ts',
            content: 'export function startApp() { return createServer(); }',
          },
        ],
      },
    } as RepositoryApiBundle;
    const executor = new RepositoryAnalysisExecutor({
      getRepositoryBundle: vi.fn(async () => withFiles),
    } as unknown as GitHubApiClient);

    const card = await executor.analyze({
      page: page(repository, '# real-files'),
      signal: new AbortController().signal,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });
    const structure = (
      card as unknown as {
        structure?: {
          directories: string[];
          keyFiles: Array<{ path: string; role: string; findings: string[] }>;
        };
      }
    ).structure;

    expect(structure?.directories).toEqual(['src', 'tests', 'scripts']);
    expect(structure?.keyFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'package.json',
          findings: expect.arrayContaining([
            expect.stringMatching(/build.*test/u),
            expect.stringMatching(/react.*zod/u),
          ]),
        }),
        expect.objectContaining({
          path: 'src/main.ts',
          findings: expect.arrayContaining([expect.stringMatching(/startApp/u)]),
        }),
      ]),
    );
    expect(card.quickScan.configuration).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/package\.json.*build.*test/iu),
        expect.stringMatching(/package\.json.*react.*zod/iu),
      ]),
    );
    expect(card.quickScan.implementation).toEqual(
      expect.arrayContaining([expect.stringMatching(/src\/main\.ts.*startApp/iu)]),
    );
    expect(card.quickScan.features).toEqual(
      expect.arrayContaining([expect.stringMatching(/受限的配置文件证据/u)]),
    );
    expect(JSON.stringify(card)).not.toMatch(/<img|\uFFFD/iu);
    expect(card.languages.length).toBeLessThanOrEqual(5);
  });

  it('Provider 只返回有用的速览字段时与本地完整降级结果合并', async () => {
    const repository = 'example/partial-provider';
    const partialGenerator = vi.fn(async () => ({
      providerId: 'deepseek' as const,
      insights: {
        purpose: '用于读取实际仓库文件并生成中文速览。',
        readmeSummary: '这是一个读取实际项目文件并生成仓库速览的工具。',
        features: ['识别项目配置与入口文件'],
      },
    })) as unknown as RepositoryInsightGenerator;
    const executor = new RepositoryAnalysisExecutor(
      {
        getRepositoryBundle: vi.fn(async () =>
          bundle(repository, {
            fileSnapshot: {
              directories: ['src'],
              truncated: false,
              inspectedFiles: [
                {
                  path: 'README.md',
                  content: [
                    '# Partial Provider',
                    '',
                    'A tool that inspects real repository files.',
                    '',
                    '## Features',
                    '',
                    '- Inspect repository configuration and entry files',
                  ].join('\n'),
                },
                {
                  path: 'package.json',
                  content: '{"scripts":{"build":"vite build"}}',
                },
              ],
            },
          }),
        ),
      } as unknown as GitHubApiClient,
      partialGenerator,
    );

    const card = await executor.analyze({
      page: page(repository, '# Partial Provider'),
      signal: new AbortController().signal,
      now: new Date('2026-07-24T00:00:00.000Z'),
    });

    expect(card.sources.provider).toBe(true);
    expect(card.quickScan.readmeSummary).toContain('实际项目文件');
    expect(card.quickScan.features[0]).toBe('识别项目配置与入口文件');
    expect(card.quickScan.features.join(' ')).not.toContain('Inspect repository');
    expect(card.purpose).toContain('中文速览');
    expect(card.difficulty.level).toBe('未知');
    expect(card.nextSteps.length).toBeGreaterThan(0);
  });

  it('英文仓库简介不能覆盖根目录中文 README 的用途、概括与功能说明', async () => {
    const repository = 'example/localized-readme';
    const localizedReadme = [
      '# 中文项目说明',
      '',
      '这是一个读取仓库文件并生成中文项目速览的开发工具。',
      '',
      '## 主要功能',
      '',
      '- 识别项目配置和入口文件',
      '- 概括 README 中的核心用途',
    ].join('\n');
    const partialGenerator = vi.fn(async () => ({
      providerId: 'deepseek' as const,
      insights: {
        configuration: ['通过 package.json 管理构建脚本'],
      },
    })) as unknown as RepositoryInsightGenerator;
    const localizedBundle = bundle(repository, {
      details: {
        ...bundle(repository).details,
        description: 'An English description that must not become the Chinese-facing purpose.',
      },
      fileSnapshot: {
        directories: ['src'],
        truncated: false,
        inspectedFiles: [{ path: 'README.zh-CN.md', content: localizedReadme }],
      },
    });
    const executor = new RepositoryAnalysisExecutor(
      {
        getRepositoryBundle: vi.fn(async () => localizedBundle),
      } as unknown as GitHubApiClient,
      partialGenerator,
    );

    const card = await executor.analyze({
      page: page(repository, '# English DOM README\n\nEnglish fallback content.'),
      signal: new AbortController().signal,
      now: new Date('2026-07-28T00:00:00.000Z'),
    });

    expect(card.purpose).toMatch(/中文项目速览/u);
    expect(card.quickScan.readmeSummary).toMatch(/读取仓库文件/u);
    expect(card.quickScan.features).toEqual(['识别项目配置和入口文件', '概括 README 中的核心用途']);
    expect(
      [card.purpose, card.quickScan.readmeSummary, ...card.quickScan.features].join(' '),
    ).not.toMatch(/English description|English fallback/u);
  });

  it('私有页面在 API 与 Provider 前零出站', async () => {
    const getRepositoryBundle = vi.fn();
    const generate = vi.fn();
    const executor = new RepositoryAnalysisExecutor(
      { getRepositoryBundle } as unknown as GitHubApiClient,
      generate,
    );
    await expect(
      executor.analyze({
        page: { ...page('private/repo', ''), isPrivate: true },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/零出站阻断/);
    expect(getRepositoryBundle).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
