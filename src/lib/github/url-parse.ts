export function isGitHubUrl(value: string): boolean {
  try {
    return new URL(value).hostname === 'github.com';
  } catch {
    return false;
  }
}
