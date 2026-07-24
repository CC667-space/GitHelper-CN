import { parseGitHubUrl } from '../../lib/github/url-parse';
import type { PageContext, PageType } from '../../lib/types';

export const MAX_EXTRACTED_TEXT = 12_000;
export const MAX_FIELD_TEXT = 4_000;

export function cleanText(value: string | null | undefined, max = MAX_FIELD_TEXT): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function firstText(
  document: ParentNode,
  selectors: readonly string[],
  max = MAX_FIELD_TEXT,
): string | undefined {
  for (const selector of selectors) {
    const value = cleanText(document.querySelector(selector)?.textContent, max);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function allTexts(
  document: ParentNode,
  selectors: readonly string[],
  limit = 20,
  maxEach = 500,
): string[] {
  const values: string[] = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const value = cleanText(element.textContent, maxEach);
      if (value && !values.includes(value)) {
        values.push(value);
      }
      if (values.length >= limit) {
        return values;
      }
    }
  }
  return values;
}

function exactTextExists(document: ParentNode, selector: string, expected: string): boolean {
  return [...document.querySelectorAll(selector)].some(
    (element) => cleanText(element.textContent, 100).toLowerCase() === expected,
  );
}

export interface AccessState {
  isPrivate: boolean;
  isRestricted: boolean;
  reason?: 'private' | 'not_found' | 'sign_in_required';
}

export function detectAccessState(document: Document): AccessState {
  const privateMeta = document.querySelector(
    'meta[name="octolytics-dimension-repository_is_private"]',
  );
  const privateMarker =
    privateMeta?.getAttribute('content') === 'true' ||
    document.querySelector('[data-private-repository="true"]') !== null ||
    exactTextExists(
      document,
      '#repository-container-header .Label, [data-testid="repository-container-header"] [data-view-component]',
      'private',
    );
  if (privateMarker) {
    return { isPrivate: true, isRestricted: true, reason: 'private' };
  }

  const bodyText = cleanText(document.body?.textContent, 8_000).toLowerCase();
  if (
    document.querySelector('[data-testid="not-found"]') ||
    /\b(?:repository not found|page not found)\b/.test(bodyText)
  ) {
    return { isPrivate: true, isRestricted: true, reason: 'not_found' };
  }
  if (
    document.querySelector('[data-testid="sign-in-required"]') ||
    /you must be signed in|sign in to view this repository/.test(bodyText)
  ) {
    return { isPrivate: true, isRestricted: true, reason: 'sign_in_required' };
  }
  return { isPrivate: false, isRestricted: false };
}

export function pageDescription(document: Document): string | undefined {
  const description =
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
    document.querySelector('meta[name="description"]')?.getAttribute('content');
  return cleanText(description, 1_500) || undefined;
}

export function createPageContext(
  document: Document,
  url: string,
  pageType: PageType,
  extracted: Record<string, unknown>,
  now = new Date(),
): PageContext {
  const parsedUrl = parseGitHubUrl(url);
  const access = detectAccessState(document);
  const summary =
    pageDescription(document) ??
    firstText(document, ['main h1', 'main [data-testid="issue-title"]'], 1_500);
  return {
    url,
    pageType,
    repository: parsedUrl.repository,
    isPrivate: access.isRestricted,
    issueOrPrNumber: parsedUrl.issueOrPrNumber,
    extracted: {
      ...extracted,
      accessState: access.reason ?? 'public',
    },
    pageSummary: summary,
    capturedAt: now.toISOString(),
  };
}

export function fallbackExtracted(document: Document, error?: unknown): Record<string, unknown> {
  return {
    title: cleanText(document.title, 1_000),
    text: cleanText(document.querySelector('main')?.textContent, MAX_EXTRACTED_TEXT),
    degraded: true,
    parseError: error instanceof Error ? error.name : undefined,
  };
}
