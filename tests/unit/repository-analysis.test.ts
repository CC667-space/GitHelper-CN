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
          'A library for building component-based user interfaces.',
          '',
          '## Features',
          '',
          '- Build interfaces from reusable components',
          '- Render on web and native platforms',
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
      readmeSummary: expect.stringMatching(/library.*component-based/iu),
      features: expect.arrayContaining([
        expect.stringMatching(/reusable components/iu),
        expect.stringMatching(/web and native/iu),
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
              '# real-files',
              '',
              'A toolkit for inspecting actual project files.',
              '',
              '## Features',
              '',
              '- Reads bounded configuration evidence',
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
      expect.arrayContaining([expect.stringMatching(/bounded configuration evidence/iu)]),
    );
    expect(card.languages.length).toBeLessThanOrEqual(5);
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
