import { createEnvelope, parseEnvelope, type Envelope } from '../lib/messaging';
import { pageInfoRequestSchema, type PageInfo } from '../lib/bridge-protocol';
import type { PageContext } from '../lib/types';
import { parseGitHubPage } from './parsers';

export function createPageInfo(
  document: Document,
  location: Pick<Location, 'href'>,
  title: string,
  now = new Date(),
  cachedContext?: PageContext,
): PageInfo {
  const pageContext = cachedContext ?? parseGitHubPage(document, location.href, now);
  return {
    url: location.href,
    title: title.trim().slice(0, 1_000),
    placeholder: false,
    capturedAt: now.toISOString(),
    pageContext,
  };
}

export function handlePageInfoRequest(
  raw: unknown,
  document: Document,
  location: Pick<Location, 'href'>,
  title: string,
  now = new Date(),
  cachedContext?: PageContext,
): Envelope<PageInfo> {
  const request = parseEnvelope(raw, pageInfoRequestSchema, {
    expectedType: 'PAGE_INFO_REQUEST',
  });
  return createEnvelope(
    'PAGE_INFO_RESPONSE',
    createPageInfo(document, location, title, now, cachedContext),
    {
      id: request.id,
    },
  );
}
