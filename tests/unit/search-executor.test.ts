import { describe, expect, it, vi } from 'vitest';

import { GitHubSearchExecutor } from '../../src/background/tools/executors';
import { GitHubRateLimitError, type GitHubApiClient } from '../../src/background/github-api';

describe('GitHubSearchExecutor 降级', () => {
  it('优先使用一次 Provider 语义解析，再由本地编译查询', async () => {
    const searchRepositories = vi.fn(async () => ({ totalCount: 1, items: [] }));
    const generateIntent = vi.fn(async () => ({
      intent: {
        target: 'repositories' as const,
        keywords: ['AI'],
        stars: { operator: '>' as const, value: 1_000 },
        pushedWithin: { amount: 2, unit: 'months' as const },
      },
      providerId: 'deepseek' as const,
      providerLabel: 'DeepSeek',
    }));
    const executor = new GitHubSearchExecutor(
      {
        searchRepositories,
        searchIssues: vi.fn(),
      } as unknown as GitHubApiClient,
      generateIntent,
    );

    const result = await executor.search({
      naturalLanguage: '最近两个月 Star 超过 1000 的 AI 相关项目',
      target: 'auto',
      manualProviderId: 'deepseek',
      requestId: 'search-ai-1',
      signal: new AbortController().signal,
      now: new Date('2026-07-28T08:00:00.000Z'),
    });

    expect(generateIntent).toHaveBeenCalledExactlyOnceWith({
      naturalLanguage: '最近两个月 Star 超过 1000 的 AI 相关项目',
      requestedTarget: 'auto',
      manualProviderId: 'deepseek',
      requestId: 'search-ai-1',
      signal: expect.any(AbortSignal),
      now: new Date('2026-07-28T08:00:00.000Z'),
    });
    expect(searchRepositories).toHaveBeenCalledExactlyOnceWith(
      'AI stars:>1000 pushed:>=2026-05-28',
      expect.any(AbortSignal),
    );
    expect(result.conversion.query).toBe('AI stars:>1000 pushed:>=2026-05-28');
    expect(result.notice).toMatch(/DeepSeek|少量费用/u);
  });

  it('Provider 失败时不重试，自动回退本地转换后继续搜索', async () => {
    const searchRepositories = vi.fn(async () => ({ totalCount: 1, items: [] }));
    const generateIntent = vi.fn(async () => {
      throw new Error('Provider 返回非法 JSON');
    });
    const executor = new GitHubSearchExecutor(
      {
        searchRepositories,
        searchIssues: vi.fn(),
      } as unknown as GitHubApiClient,
      generateIntent,
    );

    const result = await executor.search({
      naturalLanguage: '最近两个月 Star 超过 1000 的 AI 相关项目',
      target: 'auto',
      requestId: 'search-ai-fallback',
      signal: new AbortController().signal,
      now: new Date('2026-07-28T08:00:00.000Z'),
    });

    expect(generateIntent).toHaveBeenCalledOnce();
    expect(searchRepositories).toHaveBeenCalledExactlyOnceWith(
      'AI stars:>1000 pushed:>=2026-05-28',
      expect.any(AbortSignal),
    );
    expect(result.notice).toBe('AI 理解暂不可用，已自动使用本地规则生成查询。');
  });

  it('search 桶受限时返回 GitHub 网页 URL 且不做第二次 API 请求', async () => {
    const searchRepositories = vi.fn(async () => {
      throw new GitHubRateLimitError('search', Date.parse('2026-07-24T09:00:00.000Z'));
    });
    const executor = new GitHubSearchExecutor({
      searchRepositories,
      searchIssues: vi.fn(),
    } as unknown as GitHubApiClient);
    const result = await executor.search({
      naturalLanguage: '找 Python 项目',
      target: 'repositories',
      signal: new AbortController().signal,
      now: new Date('2026-07-24T08:00:00.000Z'),
    });

    expect(result.status).toBe('fallback');
    expect(result.fallbackUrl).toMatch(/^https:\/\/github\.com\/search\?/u);
    expect(result.notice).toContain('未重复请求 API');
    expect(searchRepositories).toHaveBeenCalledOnce();
  });

  it('在 GitHub 搜索页降级时识别本地 DOM 结果数量', async () => {
    const executor = new GitHubSearchExecutor({
      searchRepositories: vi.fn(),
      searchIssues: vi.fn(async () => {
        throw new GitHubRateLimitError('search', Date.parse('2026-07-24T09:00:00.000Z'));
      }),
    } as unknown as GitHubApiClient);
    const result = await executor.search({
      naturalLanguage: '开放的 bug issue',
      target: 'auto',
      page: {
        url: 'https://github.com/search?q=bug&type=issues',
        pageType: 'search',
        isPrivate: false,
        extracted: { results: ['result one', 'result two'] },
        capturedAt: '2026-07-24T08:00:00.000Z',
      },
      signal: new AbortController().signal,
      now: new Date('2026-07-24T08:00:00.000Z'),
    });

    expect(result.status).toBe('fallback');
    expect(result.totalCount).toBe(2);
    expect(result.localResults).toEqual(['result one', 'result two']);
    expect(result.notice).toContain('2 条本地 DOM 结果');
  });
});
