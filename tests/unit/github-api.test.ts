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
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
