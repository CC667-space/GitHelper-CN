import { createEnvelope, parseEnvelope, type Envelope } from '../lib/messaging';
import { pageInfoRequestSchema, type PageInfo } from '../lib/bridge-protocol';

export function createPlaceholderPageInfo(
  location: Pick<Location, 'href'>,
  title: string,
  now = new Date(),
): PageInfo {
  return {
    url: location.href,
    title: title.trim().slice(0, 1_000),
    placeholder: true,
    capturedAt: now.toISOString(),
  };
}

export function handlePageInfoRequest(
  raw: unknown,
  location: Pick<Location, 'href'>,
  title: string,
  now = new Date(),
): Envelope<PageInfo> {
  const request = parseEnvelope(raw, pageInfoRequestSchema, {
    expectedType: 'PAGE_INFO_REQUEST',
  });
  return createEnvelope('PAGE_INFO_RESPONSE', createPlaceholderPageInfo(location, title, now), {
    id: request.id,
  });
}
