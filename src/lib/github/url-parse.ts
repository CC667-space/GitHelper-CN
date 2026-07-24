export function isGitHubUrl(value: string): boolean {
  try {
    return new URL(value).hostname === 'github.com';
  } catch {
    return false;
  }
}

export interface ParsedGitHubUrl {
  repository?: string;
  issueOrPrNumber?: number;
  segments: string[];
}

export function parseGitHubUrl(value: string): ParsedGitHubUrl {
  if (!isGitHubUrl(value)) {
    return { segments: [] };
  }
  const url = new URL(value);
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const repository =
    segments.length >= 2 &&
    !['search', 'settings', 'organizations', 'marketplace'].includes(segments[0]!)
      ? `${segments[0]}/${segments[1]}`
      : undefined;
  const numberIndex = segments.findIndex((segment) => segment === 'issues' || segment === 'pull');
  const maybeNumber = numberIndex >= 0 ? Number(segments[numberIndex + 1]) : Number.NaN;
  return {
    repository,
    issueOrPrNumber: Number.isSafeInteger(maybeNumber) && maybeNumber > 0 ? maybeNumber : undefined,
    segments,
  };
}
