import type { PageContext } from '../../lib/types';
import { allTexts, createPageContext, firstText } from './common';

export function parseReleasesPage(document: Document, url: string, now?: Date): PageContext {
  return createPageContext(
    document,
    url,
    'releases',
    {
      latestTitle: firstText(document, [
        '[data-testid="release-header"] h2',
        'section h2 a[href*="/releases/tag/"]',
        '.release-header h1',
      ]),
      tags: allTexts(document, ['a[href*="/releases/tag/"]', '[data-testid="release-tag"]'], 20),
      releaseNotes: firstText(document, ['[data-testid="release-body"]', '.markdown-body'], 8_000),
    },
    now,
  );
}
