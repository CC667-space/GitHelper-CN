import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { detectPageType } from '../../src/content/detector';
import { parseGitHubPage } from '../../src/content/parsers';
import { withPublicContext } from '../../src/background/outbound-policy';

function fixture(name: string, url: string): { document: Document; url: string } {
  const html = readFileSync(
    resolve(process.cwd(), 'tests', 'fixtures', 'github', `${name}.html`),
    'utf8',
  );
  const dom = new JSDOM(html, { url });
  return { document: dom.window.document, url };
}

describe('GitHub page parsers', () => {
  const cases = [
    {
      name: 'repo',
      url: 'https://github.com/octocat/Hello-World',
      type: 'repo',
      assert: (context: ReturnType<typeof parseGitHubPage>) => {
        expect(context.extracted.name).toBe('Hello-World');
        expect(context.extracted.defaultBranch).toBe('main');
      },
    },
    {
      name: 'issue',
      url: 'https://github.com/octocat/demo/issues/42',
      type: 'issue',
      assert: (context: ReturnType<typeof parseGitHubPage>) => {
        expect(context.issueOrPrNumber).toBe(42);
        expect(context.extracted.title).toBe('Improve documentation');
      },
    },
    {
      name: 'pr',
      url: 'https://github.com/octocat/demo/pull/7',
      type: 'pr',
      assert: (context: ReturnType<typeof parseGitHubPage>) => {
        expect(context.issueOrPrNumber).toBe(7);
        expect(context.extracted.checks).toBe('All checks have passed');
      },
    },
    {
      name: 'releases',
      url: 'https://github.com/octocat/demo/releases',
      type: 'releases',
      assert: (context: ReturnType<typeof parseGitHubPage>) => {
        expect(context.extracted.latestTitle).toBe('Version 2.0');
      },
    },
    {
      name: 'blob',
      url: 'https://github.com/octocat/demo/blob/main/src/index.ts',
      type: 'blob',
      assert: (context: ReturnType<typeof parseGitHubPage>) => {
        expect(context.extracted.language).toBe('TypeScript');
        expect(context.extracted.lines).toHaveLength(2);
      },
    },
    {
      name: 'search',
      url: 'https://github.com/search?q=parser+language%3Atypescript&type=repositories',
      type: 'search',
      assert: (context: ReturnType<typeof parseGitHubPage>) => {
        expect(context.extracted.query).toBe('parser language:typescript');
        expect(context.extracted.results).toHaveLength(2);
      },
    },
  ] as const;

  for (const testCase of cases) {
    it(`识别并解析 ${testCase.type} fixture`, () => {
      const input = fixture(testCase.name, testCase.url);
      expect(detectPageType(input.url, input.document)).toBe(testCase.type);
      const context = parseGitHubPage(input.document, input.url, new Date('2026-07-24T00:00:00Z'));
      expect(context.pageType).toBe(testCase.type);
      if (testCase.type === 'search') {
        expect(context.repository).toBeUndefined();
      } else {
        expect(context.repository).toEqual(expect.any(String));
      }
      expect(context.isPrivate).toBe(false);
      testCase.assert(context);
    });
  }

  it('私有仓库标记为零出站上下文', async () => {
    const input = fixture('private', 'https://github.com/private/repository');
    const context = parseGitHubPage(input.document, input.url);
    const outbound = vi.fn();
    expect(context.isPrivate).toBe(true);
    expect(context.extracted.accessState).toBe('private');
    await expect(withPublicContext(context, outbound)).rejects.toThrow(/零出站阻断/);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('无权限或不存在页面同样进入零出站状态', () => {
    const input = fixture('not-found', 'https://github.com/private/missing');
    const context = parseGitHubPage(input.document, input.url);
    expect(context.isPrivate).toBe(true);
    expect(context.extracted.accessState).toBe('not_found');
  });

  it('未知或残缺 DOM 降级为有限纯文本且不抛异常', () => {
    const dom = new JSDOM('<main><h1>Unknown page</h1><p>fallback text</p></main>', {
      url: 'https://github.com/octocat/demo/network/dependents',
    });
    expect(() => parseGitHubPage(dom.window.document, dom.window.location.href)).not.toThrow();
    const context = parseGitHubPage(dom.window.document, dom.window.location.href);
    expect(context.extracted.degraded).toBe(true);
    expect(context.extracted.text).toContain('fallback text');
  });
});
