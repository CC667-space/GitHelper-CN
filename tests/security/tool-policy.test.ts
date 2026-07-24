import { describe, expect, it, vi } from 'vitest';

import { TOOL_SECURITY, ToolRegistry, toolSchemas } from '../../src/background/tools/registry';

function registry() {
  const openGitHubPage = vi.fn(async ({ url }: { url: string }) => url);
  const openExternalLink = vi.fn(async ({ url }: { url: string }) => url);
  return {
    openGitHubPage,
    openExternalLink,
    tools: new ToolRegistry({
      openGitHubPage,
      openExternalLink,
    }),
  };
}

describe('工具白名单与导航限域', () => {
  it('白名单只有冻结只读工具，不含写操作、账号操作或下载', () => {
    expect(Object.keys(toolSchemas).sort()).toEqual(
      [
        'extractPageInfo',
        'highlightElement',
        'openExternalLink',
        'openGitHubPage',
        'openIssues',
        'openReleases',
        'scrollToElement',
        'searchIssues',
        'searchRepos',
      ].sort(),
    );
    expect(TOOL_SECURITY.openExternalLink).toBe('external-confirm');
    for (const forbidden of [
      'createIssue',
      'starRepository',
      'mergePullRequest',
      'deleteRepository',
      'changeAccount',
      'downloadFile',
    ]) {
      expect(forbidden in toolSchemas).toBe(false);
    }
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/secret.txt',
    'chrome://settings',
    'chrome-extension://abcdefghijklmnop/page.html',
    'blob:https://github.com/id',
    'vbscript:msgbox(1)',
    'http://github.com/octocat/demo',
    'https://github.com.evil.example/octocat/demo',
    'https://github.com@evil.example/octocat/demo',
  ])('openGitHubPage 拒绝越权 URL：%s', async (url) => {
    const { tools, openGitHubPage } = registry();
    await expect(
      tools.execute('openGitHubPage', { url }, { signal: new AbortController().signal }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('参数无效') });
    expect(openGitHubPage).not.toHaveBeenCalled();
  });

  it('openGitHubPage 只执行 GitHub HTTPS，且严格拒绝多余参数', async () => {
    const { tools, openGitHubPage } = registry();
    await expect(
      tools.execute(
        'openGitHubPage',
        { url: 'https://github.com/octocat/Hello-World' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.execute(
        'openGitHubPage',
        { url: 'https://github.com/octocat/Hello-World', script: 'alert(1)' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(openGitHubPage).toHaveBeenCalledOnce();
  });

  it('外部 HTTPS 链接必须逐次确认，不存在 alwaysAllow 状态', async () => {
    const { tools, openExternalLink } = registry();
    const signal = new AbortController().signal;
    await expect(
      tools.execute('openExternalLink', { url: 'https://example.com/docs' }, { signal }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('REQUIRES_CONFIRMATION'),
    });
    expect(openExternalLink).not.toHaveBeenCalled();
    await expect(
      tools.execute(
        'openExternalLink',
        { url: 'https://example.com/docs' },
        { signal, confirmedExternal: true },
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(openExternalLink).toHaveBeenCalledOnce();
    expect(JSON.stringify({ signal, confirmedExternal: true })).not.toContain('always');
  });

  it('外部链接即使已确认也拒绝 URL 内嵌用户名或密码', async () => {
    const { tools, openExternalLink } = registry();
    await expect(
      tools.execute(
        'openExternalLink',
        { url: 'https://alice:secret@example.com/docs' },
        {
          signal: new AbortController().signal,
          confirmedExternal: true,
        },
      ),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('参数无效') });
    expect(openExternalLink).not.toHaveBeenCalled();
  });

  it('白名单外工具和危险仓库/元素参数不会到达执行器', async () => {
    const tools = new ToolRegistry({
      openIssues: vi.fn(),
      highlightElement: vi.fn(),
    });
    const context = { signal: new AbortController().signal };
    await expect(
      tools.execute('createIssue', { repository: 'octocat/demo' }, context),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('白名单') });
    await expect(
      tools.execute('openIssues', { repository: '../../etc/passwd' }, context),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      tools.execute('highlightElement', { elementKey: 'x]; script()' }, context),
    ).resolves.toMatchObject({ ok: false });
  });
});
