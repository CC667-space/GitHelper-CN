import { describe, expect, it, vi } from 'vitest';

import { GitHubSearchExecutor } from '../../src/background/tools/executors';
import { GitHubRateLimitError, type GitHubApiClient } from '../../src/background/github-api';

describe('GitHubSearchExecutor 降级', () => {
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
