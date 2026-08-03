import { PROVIDER_CATALOG, type ProviderId } from '../lib/provider-catalog';

export const PROVIDER_API_ORIGINS = Object.fromEntries(
  PROVIDER_CATALOG.map((provider) => [provider.id, provider.apiHost]),
) as Record<ProviderId, string>;

export const ALLOWED_OUTBOUND_ORIGINS = new Set([
  'https://github.com',
  'https://api.github.com',
  ...Object.values(PROVIDER_API_ORIGINS),
]);

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class OutboundPolicyError extends Error {
  readonly code = 'OUTBOUND_HOST_DENIED';

  constructor(message: string) {
    super(message);
    this.name = 'OutboundPolicyError';
  }
}

export class RequestPayloadError extends Error {
  readonly code = 'REQUEST_PAYLOAD_TOO_LARGE';

  constructor(
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(`请求负载 ${bytes} bytes 超过上限 ${limit} bytes`);
    this.name = 'RequestPayloadError';
  }
}

export class RequestTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';

  constructor(readonly timeoutMs: number) {
    super(`请求超过 ${timeoutMs}ms`);
    this.name = 'RequestTimeoutError';
  }
}

export function assertAllowedOutboundUrl(value: string | URL): URL {
  const url = value instanceof URL ? new URL(value.href) : new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !ALLOWED_OUTBOUND_ORIGINS.has(url.origin)
  ) {
    throw new OutboundPolicyError(`拒绝访问未授权端点：${url.origin}`);
  }
  return url;
}

async function requestBodyBytes(body: BodyInit | null | undefined): Promise<number> {
  if (body === undefined || body === null) {
    return 0;
  }
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).byteLength;
  }
  if (body instanceof URLSearchParams) {
    return new TextEncoder().encode(body.toString()).byteLength;
  }
  if (body instanceof Blob) {
    return body.size;
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  throw new RequestPayloadError(Number.POSITIVE_INFINITY, DEFAULT_MAX_REQUEST_BYTES);
}

export interface SafeFetchOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRequestBytes?: number;
}

export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const url = assertAllowedOutboundUrl(input);
  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const bytes = await requestBodyBytes(init.body);
  if (bytes > maxRequestBytes) {
    throw new RequestPayloadError(bytes, maxRequestBytes);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new RequestTimeoutError(timeoutMs));
  }, timeoutMs);
  const onAbort = (): void => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    return await (options.fetchImpl ?? fetch)(url.href, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (timedOut) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', onAbort);
  }
}
