import type { PageContext } from '../../lib/types';
import { allTexts, createPageContext, firstText } from './common';

export function parseSearchPage(document: Document, url: string, now?: Date): PageContext {
  const searchInput = document.querySelector<HTMLInputElement>(
    'input[data-testid="search-input"], input[name="q"]',
  );
  return createPageContext(
    document,
    url,
    'search',
    {
      query: searchInput?.value || new URL(url).searchParams.get('q') || undefined,
      summary: firstText(document, [
        '[data-testid="search-results-count"]',
        '.codesearch-results h3',
        'main h1',
      ]),
      results: allTexts(
        document,
        ['[data-testid="results-list"] > *', '.code-list-item', '.repo-list-item'],
        20,
        1_000,
      ),
    },
    now,
  );
}
