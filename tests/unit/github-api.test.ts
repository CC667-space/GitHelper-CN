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
});
