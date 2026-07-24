import type { PageContext } from '../../lib/types';
import { allTexts, createPageContext, firstText } from './common';

export function parsePullRequestPage(document: Document, url: string, now?: Date): PageContext {
  return createPageContext(
    document,
    url,
    'pr',
    {
      title: firstText(document, [
        '[data-testid="issue-title"]',
        'bdi.markdown-title',
        '.js-issue-title',
      ]),
      state: firstText(document, [
        '[data-testid="header-state"]',
        '[data-testid="pull-request-state"]',
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
      branches: allTexts(document, ['[data-testid="pull-request-branch"]', '.commit-ref'], 4),
      checks: firstText(
        document,
        ['[data-testid="checks-summary"]', '#partial-pull-merging'],
        2_000,
      ),
    },
    now,
  );
}
