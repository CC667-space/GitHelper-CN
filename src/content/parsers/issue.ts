import type { PageContext } from '../../lib/types';
import { allTexts, createPageContext, firstText } from './common';

export function parseIssuePage(document: Document, url: string, now?: Date): PageContext {
  return createPageContext(
    document,
    url,
    'issue',
    {
      title: firstText(document, [
        '[data-testid="issue-title"]',
        'bdi.markdown-title',
        '.js-issue-title',
      ]),
      state: firstText(document, [
        '[data-testid="header-state"]',
        '[data-testid="issue-state"]',
        '.State',
      ]),
      author: firstText(document, [
        '[data-testid="issue-viewer"] a[data-hovercard-type="user"]',
        '.timeline-comment-header a.author',
      ]),
      body: firstText(
        document,
        [
          '[data-testid="issue-body"] .markdown-body',
          '[data-testid="comment-body"]',
          '.js-comment-body',
        ],
        8_000,
      ),
      labels: allTexts(document, [
        '[data-testid="issue-labels"] a',
        '.js-issue-labels a',
        '[data-name="Label"]',
      ]),
    },
    now,
  );
}
