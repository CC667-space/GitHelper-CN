import type { PageType } from '../lib/types';
import { parseGitHubUrl } from '../lib/github/url-parse';

function hasElement(document: Document, selector: string): boolean {
  return document.querySelector(selector) !== null;
}

export function detectPageType(urlValue: string, document: Document): PageType {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return 'other';
  }
  if (url.hostname !== 'github.com') {
    return 'other';
  }
  const { segments, repository } = parseGitHubUrl(urlValue);
  if (segments[0] === 'search' || url.pathname.endsWith('/search')) {
    return 'search';
  }
  if (!repository) {
    return 'other';
  }
  if (segments[2] === 'issues' && /^\d+$/.test(segments[3] ?? '')) {
    return 'issue';
  }
  if (segments[2] === 'pull' && /^\d+$/.test(segments[3] ?? '')) {
    return 'pr';
  }
  if (segments[2] === 'releases') {
    return 'releases';
  }
  if (segments[2] === 'blob') {
    return 'blob';
  }
  if (segments[2] === 'tree' || segments[2] === 'code') {
    return 'code';
  }
  if (
    segments.length === 2 ||
    hasElement(document, '#repository-container-header') ||
    hasElement(document, '[data-testid="repository-container-header"]')
  ) {
    return 'repo';
  }
  return 'other';
}
