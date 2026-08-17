import { describe, expect, it, vi } from 'vitest';

import {
  GitHubApiClient,
  GitHubRateLimitError,
  type GitHubApiDependencies,
  type GitHubRateLimitBucket,
  type GitHubRateLimitResource,
} from '../../src/background/github-api';

interface StoredLimits {
  schemaVersion: 1;
  buckets: Partial<Record<GitHubRateLimitResource, GitHubRateLimitBucket>>;
}

function repositoryResponse(headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      total_count: 1,
      items: [
        {
          id: 1,
          full_name: 'octocat/Hello-World',
          html_url: 'https://github.com/octocat/Hello-World',
          description: 'Hello',
          language: 'JavaScript',
          stargazers_count: 42,
          updated_at: '2026-07-24T00:00:00.000Z',
          archived: false,
        },
      ],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Resource': 'search',
        'X-RateLimit-Remaining': '9',
        'X-RateLimit-Reset': '1784880060',
        ...headers,
      },
    },
  );
}

function issueResponse(): Response {
  return new Response(
    JSON.stringify({
      total_count: 1,
      items: [
        {
          id: 2,
          title: 'Fix docs',
          html_url: 'https://github.com/octocat/Hello-World/issues/7',
          repository_url: 'https://api.github.com/repos/octocat/Hello-World',
          number: 7,
          state: 'open',
          labels: [{ name: 'documentation' }],
          comments: 3,
          updated_at: '2026-07-24T00:00:00.000Z',
        },
      ],
    }),
    { status: 200 },
  );
}

function dependencies(
  fetchMock: GitHubApiDependencies['fetch'],
  initial: StoredLimits = { schemaVersion: 1, buckets: {} },
  nowRef = { value: Date.parse('2026-07-24T08:00:00.000Z') },
): { dependencies: GitHubApiDependencies; stored: () => StoredLimits; nowRef: typeof nowRef } {
  let stored = initial;
  return {
    dependencies: {
      fetch: fetchMock,
      now: () => nowRef.value,
      readRateLimits: async () => stored,
      writeRateLimits: async (value) => {
        stored = value;
      },
    },
    stored: () => stored,
    nowRef,
  };
}

describe('GitHubApiClient', () => {
  it('匿名搜索仓库与 Issue，并把远端字段投影为有限结果', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(repositoryResponse())
      .mockResolvedValueOnce(issueResponse());
    const setup = dependencies(fetchMock);
    const client = new GitHubApiClient(setup.dependencies);
    const signal = new AbortController().signal;

    const repositories = await client.searchRepositories('parser language:JavaScript', signal);
    const issues = await client.searchIssues('repo:octocat/Hello-World is:issue', signal);

    expect(repositories.items[0]).toMatchObject({
      kind: 'repository',
      title: 'octocat/Hello-World',
      stars: 42,
    });
    expect(issues.items[0]).toMatchObject({
      kind: 'issue',
      repository: 'octocat/Hello-World',
      number: 7,
    });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain('/search/repositories?');
    expect(urls[1]).toContain('/search/issues?');
  });

  it('远端仓库 description 异常超长时丢弃描述但保留搜索结果', async () => {
    const longDescription = 'x'.repeat(55_700);
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            total_count: 2,
            items: [1, 2].map((id) => ({
              id,
              full_name: `example/repository-${id}`,
              html_url: `https://github.com/example/repository-${id}`,
              description: longDescription,
              language: 'TypeScript',
              stargazers_count: id,
              updated_at: '2026-08-17T00:00:00.000Z',
              archived: false,
            })),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Resource': 'search',
              'X-RateLimit-Remaining': '9',
              'X-RateLimit-Reset': '1786928400',
            },
          },
        ),
    );
    const client = new GitHubApiClient(dependencies(fetchMock).dependencies);

    const result = await client.searchRepositories('找一些声音克隆', new AbortController().signal);

    expect(result.totalCount).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      kind: 'repository',
      title: 'example/repository-1',
    });
    expect(result.items[0]?.kind === 'repository' && result.items[0].description).toBeUndefined();
    expect(result.items[1]?.kind === 'repository' && result.items[1].description).toBeUndefined();
  });

  it('命中 search 限流后不重试，同桶请求直接拒绝，到点后恢复一次请求', async () => {
    const resetSeconds = Math.floor(Date.parse('2026-07-24T08:01:00.000Z') / 1_000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Resource': 'search',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(resetSeconds),
            'Retry-After': '30',
          },
        }),
      )
      .mockResolvedValueOnce(repositoryResponse());
    const setup = dependencies(fetchMock);
    const client = new GitHubApiClient(setup.dependencies);

    await expect(
      client.searchRepositories('first', new AbortController().signal),
    ).rejects.toBeInstanceOf(GitHubRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(
      client.searchRepositories('second', new AbortController().signal),
    ).rejects.toBeInstanceOf(GitHubRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setup.nowRef.value = resetSeconds * 1_000 + 1;
    await expect(
      client.searchRepositories('second', new AbortController().signal),
    ).resolves.toMatchObject({ totalCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('core 与 code_search 桶被阻断时不影响独立 search 桶', async () => {
    const future = Date.parse('2026-07-24T09:00:00.000Z');
    const fetchMock = vi.fn(async () => repositoryResponse());
    const setup = dependencies(fetchMock, {
      schemaVersion: 1,
      buckets: {
        core: { blockedUntil: future, updatedAt: future - 1_000 },
        code_search: { blockedUntil: future, updatedAt: future - 1_000 },
      },
    });
    const client = new GitHubApiClient(setup.dependencies);

    await expect(
      client.searchRepositories('independent buckets', new AbortController().signal),
    ).resolves.toMatchObject({ totalCount: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(setup.stored().buckets.core?.blockedUntil).toBe(future);
    expect(setup.stored().buckets.code_search?.blockedUntil).toBe(future);
  });

  it('60 秒内相同查询命中内存缓存，不重复消耗匿名配额', async () => {
    const fetchMock = vi.fn(async () => repositoryResponse());
    const setup = dependencies(fetchMock);
    const client = new GitHubApiClient(setup.dependencies);
    const signal = new AbortController().signal;
    await client.searchRepositories('cached', signal);
    await client.searchRepositories('cached', signal);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('聚合仓库详情、语言、最新 Release 与开放 PR，并缓存五分钟', async () => {
    const coreHeaders = {
      'Content-Type': 'application/json',
      'X-RateLimit-Resource': 'core',
      'X-RateLimit-Remaining': '55',
      'X-RateLimit-Reset': '1784883600',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            full_name: 'react/react',
            html_url: 'https://github.com/react/react',
            description: 'The library for web and native user interfaces.',
            topics: ['react', 'javascript', 'ui'],
            default_branch: 'main',
            language: 'JavaScript',
            stargazers_count: 240_000,
            forks_count: 49_000,
            subscribers_count: 6_600,
            watchers_count: 240_000,
            open_issues_count: 1_100,
            archived: false,
            license: { name: 'MIT License', spdx_id: 'MIT' },
            pushed_at: '2026-07-23T00:00:00.000Z',
            updated_at: '2026-07-24T00:00:00.000Z',
          }),
          { status: 200, headers: coreHeaders },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ JavaScript: 900, TypeScript: 100 }), {
          status: 200,
          headers: coreHeaders,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'React 19.1',
            tag_name: 'v19.1.0',
            published_at: '2026-07-20T00:00:00.000Z',
            html_url: 'https://github.com/react/react/releases/tag/v19.1.0',
          }),
          { status: 200, headers: coreHeaders },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: {
            ...coreHeaders,
            Link: '<https://api.github.com/repositories/10270250/pulls?state=open&per_page=1&page=75>; rel="last"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: coreHeaders,
        }),
      );
    const setup = dependencies(fetchMock);
    const client = new GitHubApiClient(setup.dependencies);
    const first = await client.getRepositoryBundle('react/react', new AbortController().signal);
    const second = await client.getRepositoryBundle('react/react', new AbortController().signal);

    expect(first).toMatchObject({
      details: {
        fullName: 'react/react',
        stars: 240_000,
        license: { spdxId: 'MIT' },
      },
      languages: { JavaScript: 900, TypeScript: 100 },
      latestRelease: { tag: 'v19.1.0' },
      openPullRequests: 75,
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('从固定 GitHub contents 路径读取根目录、受限源码目录与最多三个高信号文件内容', async () => {
    const coreHeaders = {
      'Content-Type': 'application/json',
      'X-RateLimit-Resource': 'core',
      'X-RateLimit-Remaining': '50',
    };
    const details = {
      full_name: 'example/real-files',
      html_url: 'https://github.com/example/real-files',
      description: 'A real project',
      topics: [],
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 10,
      forks_count: 2,
      watchers_count: 3,
      open_issues_count: 1,
      archived: false,
      license: { name: 'MIT License', spdx_id: 'MIT' },
      pushed_at: '2026-07-23T00:00:00.000Z',
      updated_at: '2026-07-24T00:00:00.000Z',
    };
    const packageJson = JSON.stringify({
      name: 'real-files',
      scripts: { build: 'vite build', test: 'vitest run' },
    });
    const readme = [
      '# Real Files',
      '',
      'A small server toolkit with 中文能力 ✅.',
      '',
      '## Features',
      '',
      '- Starts an HTTP server',
      '- Validates configuration',
    ].join('\n');
    const mainSource = 'export function startServer() { return createServer(); }';
    const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(details), { status: 200, headers: coreHeaders }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ TypeScript: 100 }), { status: 200, headers: coreHeaders }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 404, headers: coreHeaders }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200, headers: coreHeaders }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: 'hermes_cli',
              path: 'hermes_cli',
              type: 'dir',
              size: 0,
              sha: 'dir-sha',
            },
            {
              name: 'README.es.md',
              path: 'README.es.md',
              type: 'file',
              size: 512,
              sha: 'readme-es-sha',
            },
            {
              name: 'README.md',
              path: 'README.md',
              type: 'file',
              size: readme.length,
              sha: 'readme-sha',
            },
            {
              name: 'README.ur-pk.md',
              path: 'README.ur-pk.md',
              type: 'file',
              size: 512,
              sha: 'readme-ur-sha',
            },
            {
              name: 'package.json',
              path: 'package.json',
              type: 'file',
              size: packageJson.length,
              sha: 'package-sha',
            },
            {
              name: 'pnpm-lock.yaml',
              path: 'pnpm-lock.yaml',
              type: 'file',
              size: 20_000,
              sha: 'lock-sha',
            },
            {
              name: 'escape.ts',
              path: '../issues',
              type: 'file',
              size: 20,
              sha: 'escape-sha',
            },
          ]),
          { status: 200, headers: coreHeaders },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: 'server.ts',
              path: 'hermes_cli/server.ts',
              type: 'file',
              size: mainSource.length,
              sha: 'server-sha',
            },
          ]),
          { status: 200, headers: coreHeaders },
        ),
      )
      .mockImplementation(async (input) => {
        const url = String(input);
        const candidates = [
          ['README.es.md', '# Hermes Agent\n\nDocumentación en español.'],
          ['README.md', readme],
          ['README.ur-pk.md', '# Hermes Agent\n\nاردو دستاویز'],
          ['package.json', packageJson],
          ['hermes_cli/server.ts', mainSource],
        ] as const;
        const match = candidates.find(
          ([path]) =>
            url.includes(`/contents/${path.replaceAll('/', '%2F')}`) ||
            url.includes(`/contents/${path}`),
        );
        if (!match) {
          return new Response('{}', { status: 404, headers: coreHeaders });
        }
        return new Response(
          JSON.stringify({
            type: 'file',
            path: match[0],
            size: match[1].length,
            encoding: 'base64',
            content: base64(match[1]),
          }),
          { status: 200, headers: coreHeaders },
        );
      });
    const setup = dependencies(fetchMock);
    const client = new GitHubApiClient(setup.dependencies);

    const result = await client.getRepositoryBundle(
      'example/real-files',
      new AbortController().signal,
    );

    expect(result.fileSnapshot).toEqual({
      directories: ['hermes_cli'],
      inspectedFiles: [
        { path: 'README.md', content: readme },
        { path: 'package.json', content: packageJson },
        { path: 'hermes_cli/server.ts', content: mainSource },
      ],
      truncated: true,
    });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('https://api.github.com/repos/example/real-files/contents?ref=main');
    expect(urls).toContain(
      'https://api.github.com/repos/example/real-files/contents/README.md?ref=main',
    );
    expect(urls).toContain(
      'https://api.github.com/repos/example/real-files/contents/package.json?ref=main',
    );
    expect(urls).toContain(
      'https://api.github.com/repos/example/real-files/contents/hermes_cli?ref=main',
    );
    expect(urls).toContain(
      'https://api.github.com/repos/example/real-files/contents/hermes_cli/server.ts?ref=main',
    );
    expect(urls.some((url) => url.includes('pnpm-lock.yaml'))).toBe(false);
    expect(urls.some((url) => url.includes('../issues'))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('根目录本地化 README 优先，并在多个清单文件存在时为实现文件保留取样槽位', async () => {
    const coreHeaders = {
      'Content-Type': 'application/json',
      'X-RateLimit-Resource': 'core',
      'X-RateLimit-Remaining': '50',
    };
    const localizedReadme = '# 中文说明\n\n这是根目录中的项目说明与使用概览。';
    const canonicalReadme = '# English README\n\nThis is the default English project overview.';
    const nestedReadme = '# src internals\n\nThis only documents the source directory.';
    const packageJson = '{"name":"localized-root","scripts":{"build":"vite build"}}';
    const pyproject = '[project]\nname = "localized-root"';
    const mainSource = 'export function startApp() { return true; }';
    const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    const fileResponse = (path: string, content: string, size = Buffer.byteLength(content)) =>
      new Response(
        JSON.stringify({
          type: 'file',
          path,
          size,
          encoding: 'base64',
          content: base64(content),
        }),
        { status: 200, headers: coreHeaders },
      );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/languages')) {
        return new Response('{}', { status: 200, headers: coreHeaders });
      }
      if (url.endsWith('/releases/latest')) {
        return new Response('{}', { status: 404, headers: coreHeaders });
      }
      if (url.includes('/pulls?')) {
        return new Response('[]', { status: 200, headers: coreHeaders });
      }
      if (url.endsWith('/contents?ref=main')) {
        return new Response(
          JSON.stringify([
            { name: 'src', path: 'src', type: 'dir', size: 0, sha: 'src-dir' },
            {
              name: 'README.md',
              path: 'README.md',
              type: 'file',
              size: Buffer.byteLength(canonicalReadme),
              sha: 'canonical-readme',
            },
            {
              name: 'README.zh-CN.md',
              path: 'README.zh-CN.md',
              type: 'file',
              size: Buffer.byteLength(localizedReadme),
              sha: 'root-readme',
            },
            {
              name: 'package.json',
              path: 'package.json',
              type: 'file',
              size: Buffer.byteLength(packageJson),
              sha: 'package-json',
            },
            {
              name: 'pyproject.toml',
              path: 'pyproject.toml',
              type: 'file',
              size: Buffer.byteLength(pyproject),
              sha: 'pyproject',
            },
          ]),
          { status: 200, headers: coreHeaders },
        );
      }
      if (url.endsWith('/contents/src?ref=main')) {
        return new Response(
          JSON.stringify([
            {
              name: 'README.md',
              path: 'src/README.md',
              type: 'file',
              size: Buffer.byteLength(nestedReadme),
              sha: 'nested-readme',
            },
            {
              name: 'main.ts',
              path: 'src/main.ts',
              type: 'file',
              size: Buffer.byteLength(mainSource),
              sha: 'main-source',
            },
          ]),
          { status: 200, headers: coreHeaders },
        );
      }
      if (url.includes('/contents/README.zh-CN.md?')) {
        return fileResponse('README.zh-CN.md', localizedReadme);
      }
      if (url.includes('/contents/README.md?')) {
        return fileResponse('README.md', canonicalReadme);
      }
      if (url.includes('/contents/src/README.md?')) {
        return fileResponse('src/README.md', nestedReadme);
      }
      if (url.includes('/contents/package.json?')) {
        return fileResponse('package.json', packageJson);
      }
      if (url.includes('/contents/pyproject.toml?')) {
        return fileResponse('pyproject.toml', pyproject);
      }
      if (url.includes('/contents/src/main.ts?')) {
        return fileResponse('src/main.ts', mainSource, 24 * 1024 + 1);
      }
      return new Response(
        JSON.stringify({
          full_name: 'example/localized-root',
          html_url: 'https://github.com/example/localized-root',
          description: 'Localized root README fixture',
          topics: [],
          default_branch: 'main',
          language: 'TypeScript',
          stargazers_count: 1,
          forks_count: 0,
          watchers_count: 1,
          open_issues_count: 0,
          archived: false,
          license: null,
          pushed_at: '2026-07-28T00:00:00.000Z',
          updated_at: '2026-07-28T00:00:00.000Z',
        }),
        { status: 200, headers: coreHeaders },
      );
    });
    const client = new GitHubApiClient(dependencies(fetchMock).dependencies);

    const result = await client.getRepositoryBundle(
      'example/localized-root',
      new AbortController().signal,
    );

    expect(result.fileSnapshot?.inspectedFiles).toEqual([
      { path: 'README.zh-CN.md', content: localizedReadme },
      { path: 'package.json', content: packageJson },
    ]);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/contents/src/README.md?'))).toBe(false);
    expect(urls.some((url) => url.includes('/contents/README.md?'))).toBe(false);
    expect(urls.some((url) => url.includes('/contents/src/main.ts?'))).toBe(true);
    expect(urls.some((url) => url.includes('/contents/pyproject.toml?'))).toBe(false);
  });

  it('仓库没有 Release 时返回缺字段而非失败', async () => {
    const details = {
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      description: null,
      topics: [],
      default_branch: 'master',
      language: null,
      stargazers_count: 1,
      forks_count: 1,
      watchers_count: 1,
      open_issues_count: 0,
      archived: false,
      license: null,
      pushed_at: null,
      updated_at: '2026-07-24T00:00:00.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(details), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const setup = dependencies(fetchMock);
    const client = new GitHubApiClient(setup.dependencies);

    await expect(
      client.getRepositoryBundle('octocat/Hello-World', new AbortController().signal),
    ).resolves.toMatchObject({
      details: { fullName: 'octocat/Hello-World' },
      languages: {},
      openPullRequests: 0,
    });
  });
});
