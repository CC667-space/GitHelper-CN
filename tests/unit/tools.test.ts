import { describe, expect, it, vi } from 'vitest';

import { SearchToolRegistry } from '../../src/background/tools/registry';

function registry(): SearchToolRegistry {
  return new SearchToolRegistry({
    searchRepos: vi.fn(async ({ query }) => ({ query, kind: 'repositories' })),
    searchIssues: vi.fn(async ({ query }) => ({ query, kind: 'issues' })),
  });
}

describe('只读 GitHub 搜索工具白名单', () => {
  it('searchRepos/searchIssues 经严格 zod 参数校验后执行', async () => {
    const tools = registry();
    await expect(
      tools.execute(
        'searchRepos',
        { query: 'language:TypeScript' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.execute(
        'searchIssues',
        { query: 'is:issue is:open' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it('拒绝白名单外工具与多余参数', async () => {
    const tools = registry();
    await expect(
      tools.execute(
        'deleteRepository',
        { repository: 'octocat/demo' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('白名单') });
    await expect(
      tools.execute(
        'searchRepos',
        { query: 'demo', token: 'forbidden' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('参数无效') });
  });
});
