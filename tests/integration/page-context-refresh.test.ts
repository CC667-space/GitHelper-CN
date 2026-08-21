import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMinimalContext } from '../../src/background/context-builder';
import { handlePageInfoRequest } from '../../src/content/page-info';
import { parseGitHubPage } from '../../src/content/parsers';
import { SpaRefreshCoordinator, type SpaWatcherClock } from '../../src/content/spa-watcher';
import { pageInfoSchema } from '../../src/lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../../src/lib/messaging';
import type { PageContext } from '../../src/lib/types';

const REPOSITORY_URL = 'https://github.com/CC667-space/GitHelper-CN';
const DESCRIPTION = '面向中文 GitHub 新手的本地 Side Panel 助手。';
const README =
  'README_SENTINEL：GitHelper-CN 安装说明。通过 Chrome 开发者模式加载；使用前配置文本 Provider。License：MIT。';

function pageInfo(document: Document, now: Date) {
  const response = handlePageInfoRequest(
    createEnvelope('PAGE_INFO_REQUEST', {}),
    document,
    { href: REPOSITORY_URL },
    'CC667-space/GitHelper-CN',
    now,
  );
  return parseEnvelope(response, pageInfoSchema, {
    expectedType: 'PAGE_INFO_RESPONSE',
  }).payload;
}

describe('同一仓库延迟加载 README 后的普通问答上下文', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('下次提问应读取延迟出现的 README，而不是复用同 URL 的旧缓存', () => {
    vi.useFakeTimers();
    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head>
          <title>CC667-space/GitHelper-CN</title>
          <meta name="octolytics-dimension-repository_is_private" content="false" />
          <meta property="og:description" content="${DESCRIPTION}" />
        </head>
        <body>
          <header id="repository-container-header">
            <strong itemprop="name"><a>GitHelper-CN</a></strong>
          </header>
          <main>
            <p data-testid="repository-about">${DESCRIPTION}</p>
            <button data-testid="anchor-button"><span>main</span></button>
          </main>
        </body>
      </html>`,
      { url: REPOSITORY_URL },
    );
    let currentPageContext: PageContext | undefined;
    const clock: SpaWatcherClock = {
      set: (callback, delay) => setTimeout(callback, delay),
      clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    };
    const watcher = new SpaRefreshCoordinator(
      () => REPOSITORY_URL,
      {
        onInvalidate: () => {
          currentPageContext = undefined;
        },
        onRefresh: () => {
          currentPageContext = parseGitHubPage(
            dom.window.document,
            REPOSITORY_URL,
            new Date('2026-08-21T10:00:00.000Z'),
          );
        },
      },
      300,
      clock,
    );

    watcher.start();
    vi.advanceTimersByTime(300);
    const initial = pageInfo(dom.window.document, new Date('2026-08-21T10:00:01.000Z'));

    const readmeContainer = dom.window.document.createElement('div');
    readmeContainer.id = 'readme';
    readmeContainer.innerHTML = `<article>${README}</article>`;
    dom.window.document.querySelector('main')?.append(readmeContainer);
    watcher.signal('mutation');
    vi.advanceTimersByTime(300);

    const domAfterHydration = parseGitHubPage(
      dom.window.document,
      REPOSITORY_URL,
      new Date('2026-08-21T10:00:02.000Z'),
    );
    const reasked = pageInfo(dom.window.document, new Date('2026-08-21T10:00:03.000Z'));
    const providerMessages = buildMinimalContext('这个仓库有 README 吗？', reasked.pageContext!);

    expect(initial.pageContext?.extracted.readme).toBeUndefined();
    expect(initial.pageContext?.pageSummary).toBe(DESCRIPTION);
    expect(currentPageContext?.extracted.readme).toBeUndefined();
    expect(domAfterHydration.extracted.readme).toContain('README_SENTINEL');
    expect(reasked.pageContext?.extracted.readme).toContain('README_SENTINEL');
    expect(reasked.pageContext?.capturedAt).toBe('2026-08-21T10:00:03.000Z');
    expect(providerMessages.messages[1]?.content).toContain('README_SENTINEL');

    watcher.stop();
  });

  it('应识别固定仓库当前使用的 article.markdown-body README 容器', () => {
    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head>
          <title>CC667-space/GitHelper-CN</title>
          <meta name="octolytics-dimension-repository_is_private" content="false" />
          <meta property="og:description" content="${DESCRIPTION}" />
        </head>
        <body>
          <header id="repository-container-header">
            <strong itemprop="name"><a>GitHelper-CN</a></strong>
          </header>
          <main>
            <div class="OverviewRepoFiles-module__Box_2__zsLGk">
              <nav>Repository files navigation README MIT license Security</nav>
              <div class="DirectoryRichtextContent-module__SharedMarkdownContent__hHXUL">
                <article class="markdown-body entry-content container-lg">${README}</article>
              </div>
            </div>
          </main>
        </body>
      </html>`,
      { url: REPOSITORY_URL },
    );

    const context = parseGitHubPage(
      dom.window.document,
      REPOSITORY_URL,
      new Date('2026-08-21T10:10:00.000Z'),
    );

    expect(context.pageSummary).toBe(DESCRIPTION);
    expect(context.extracted.readme).toContain('README_SENTINEL');
  });

  it('记录普通问答的 README 8,000 字与整体 32KB 边界', () => {
    const earlyEvidence = '安装：加载已解压扩展；License：MIT。';
    const lateEvidence = 'LATE_LICENSE_SENTINEL';
    const dom = new JSDOM(
      `<!doctype html><html><head>
        <meta name="octolytics-dimension-repository_is_private" content="false" />
      </head><body>
        <header id="repository-container-header"><strong itemprop="name">GitHelper-CN</strong></header>
        <main><div id="readme"><article>${earlyEvidence}${'文'.repeat(8_100)}${lateEvidence}</article></div></main>
      </body></html>`,
      { url: REPOSITORY_URL },
    );
    const parsed = parseGitHubPage(dom.window.document, REPOSITORY_URL);
    const readme = String(parsed.extracted.readme ?? '');
    const withoutHistory = buildMinimalContext('如何安装，许可证是什么？', parsed);
    const withHistory = buildMinimalContext('如何安装，许可证是什么？', parsed, {
      historySummary: '此前内容'.repeat(2_000),
    });

    expect(readme).toHaveLength(8_000);
    expect(readme).toContain('License：MIT');
    expect(readme).not.toContain(lateEvidence);
    expect(withoutHistory.truncated).toBe(false);
    expect(withoutHistory.messages[1]?.content).toContain('License：MIT');
    expect(withHistory.truncated).toBe(true);
  });
});
