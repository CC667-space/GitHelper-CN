import type { PageContext } from '../../lib/types';
import { allTexts, createPageContext, firstText } from './common';

export function parseBlobPage(document: Document, url: string, now?: Date): PageContext {
  return createPageContext(
    document,
    url,
    'blob',
    {
      path: firstText(
        document,
        ['[data-testid="breadcrumbs"]', '.js-path-segment', '[aria-label="Breadcrumbs"]'],
        2_000,
      ),
      language: firstText(document, ['[data-testid="file-language"]', '.file-info']),
      lines: allTexts(
        document,
        ['[data-testid="code-cell"]', '.react-file-line', 'table.highlight td.blob-code'],
        300,
        2_000,
      ),
    },
    now,
  );
}
