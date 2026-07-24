import type { PageContext } from '../../lib/types';
import { detectPageType } from '../detector';
import { parseBlobPage } from './blob';
import { createPageContext, fallbackExtracted } from './common';
import { parseIssuePage } from './issue';
import { parsePullRequestPage } from './pr';
import { parseReleasesPage } from './releases';
import { parseRepoPage } from './repo';
import { parseSearchPage } from './search';

export function parseGitHubPage(document: Document, url: string, now = new Date()): PageContext {
  const pageType = detectPageType(url, document);
  try {
    switch (pageType) {
      case 'repo':
        return parseRepoPage(document, url, now);
      case 'issue':
        return parseIssuePage(document, url, now);
      case 'pr':
        return parsePullRequestPage(document, url, now);
      case 'releases':
        return parseReleasesPage(document, url, now);
      case 'blob':
        return parseBlobPage(document, url, now);
      case 'search':
        return parseSearchPage(document, url, now);
      default:
        return createPageContext(document, url, pageType, fallbackExtracted(document), now);
    }
  } catch (error: unknown) {
    return createPageContext(document, url, pageType, fallbackExtracted(document, error), now);
  }
}
