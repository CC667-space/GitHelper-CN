export interface NormalizedCustomProviderUrl {
  baseUrl: string;
  apiHost: string;
  chatEndpoint: string;
  modelsEndpoint: string;
  permissionOrigin: string;
}

export class CustomProviderUrlError extends Error {
  readonly code = 'CUSTOM_PROVIDER_URL_INVALID';

  constructor() {
    super('自定 Provider URL 无效；仅允许不含凭据的公网 HTTPS 地址。');
    this.name = 'CustomProviderUrlError';
  }
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function assertPublicHostname(hostname: string): void {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (
    !normalized.includes('.') ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.lan') ||
    normalized === 'metadata.google.internal' ||
    normalized.includes(':') ||
    isBlockedIpv4(normalized)
  ) {
    throw new CustomProviderUrlError();
  }
}

export function normalizeCustomProviderUrl(value: string): NormalizedCustomProviderUrl {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) {
    throw new CustomProviderUrlError();
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CustomProviderUrlError();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new CustomProviderUrlError();
  }
  const canonicalHostname = url.hostname.replace(/\.$/u, '');
  assertPublicHostname(canonicalHostname);
  url.hostname = canonicalHostname;

  const path = url.pathname.replace(/\/+$/u, '');
  const suffix = '/chat/completions';
  const basePath = path.endsWith(suffix) ? path.slice(0, -suffix.length) : path;
  const baseUrl = `${url.origin}${basePath}`;
  return {
    baseUrl,
    apiHost: url.origin,
    chatEndpoint: `${baseUrl}${suffix}`,
    modelsEndpoint: `${baseUrl}/models`,
    permissionOrigin: `${url.origin}/*`,
  };
}
