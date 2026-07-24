import { z } from 'zod';

import type { GitHubSearchItem, ResolvedSearchTarget } from '../lib/github-search';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const RATE_LIMIT_STORAGE_KEY = 'github:rate-limits:v1';
const CACHE_TTL_MS = 60_000;

export type GitHubRateLimitResource = 'core' | 'search' | 'code_search';

export interface GitHubRateLimitBucket {
  remaining?: number;
  resetAt?: number;
  blockedUntil?: number;
  updatedAt: number;
}

interface RateLimitStorage {
  schemaVersion: 1;
  buckets: Partial<Record<GitHubRateLimitResource, GitHubRateLimitBucket>>;
}

interface SearchResponse {
  totalCount: number;
  items: GitHubSearchItem[];
}

export interface GitHubApiDependencies {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  now(): number;
  readRateLimits(): Promise<RateLimitStorage | undefined>;
  writeRateLimits(value: RateLimitStorage): Promise<void>;
}

const repositorySearchResponseSchema = z
  .object({
    total_count: z.number().int().nonnegative(),
    items: z.array(
      z
        .object({
          id: z.number().int().nonnegative(),
          full_name: z.string().min(1).max(500),
          html_url: z.url(),
          description: z.string().max(2_000).nullable(),
          language: z.string().max(100).nullable(),
          stargazers_count: z.number().int().nonnegative(),
          updated_at: z.iso.datetime(),
          archived: z.boolean(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const issueSearchResponseSchema = z
  .object({
    total_count: z.number().int().nonnegative(),
    items: z.array(
      z
        .object({
          id: z.number().int().nonnegative(),
          title: z.string().min(1).max(500),
          html_url: z.url(),
          repository_url: z.url(),
          number: z.number().int().positive(),
          state: z.enum(['open', 'closed']),
          labels: z
            .array(
              z
                .object({
                  name: z.string().max(100),
                })
                .passthrough(),
            )
            .max(100),
          comments: z.number().int().nonnegative(),
          updated_at: z.iso.datetime(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function defaultDependencies(): GitHubApiDependencies {
  return {
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    readRateLimits: async () => {
      const stored = await chrome.storage.local.get(RATE_LIMIT_STORAGE_KEY);
      return stored[RATE_LIMIT_STORAGE_KEY] as RateLimitStorage | undefined;
    },
    writeRateLimits: async (value) => {
      await chrome.storage.local.set({ [RATE_LIMIT_STORAGE_KEY]: value });
    },
  };
}

function headerInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null || !/^\d+$/u.test(value.trim())) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseResource(
  headers: Headers,
  fallback: GitHubRateLimitResource,
): GitHubRateLimitResource {
  const value = headers.get('X-RateLimit-Resource');
  return value === 'core' || value === 'search' || value === 'code_search' ? value : fallback;
}

function parseRetryAfter(headers: Headers, now: number): number | undefined {
  const value = headers.get('Retry-After')?.trim();
  if (!value) {
    return undefined;
  }
  if (/^\d+$/u.test(value)) {
    return now + Number(value) * 1_000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function repositoryFromApiUrl(value: string): string {
  const url = new URL(value);
  const prefix = '/repos/';
  return url.pathname.startsWith(prefix)
    ? decodeURIComponent(url.pathname.slice(prefix.length))
    : '未知仓库';
}

async function readableApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') {
      return body.message.slice(0, 500);
    }
  } catch {
    // 非 JSON 错误响应统一使用状态码，不把响应体写入日志或消息。
  }
  return `HTTP ${response.status}`;
}

export class GitHubRateLimitError extends Error {
  readonly code = 'GITHUB_RATE_LIMITED';

  constructor(
    readonly resource: GitHubRateLimitResource,
    readonly retryAt: number,
  ) {
    super(
      `GitHub ${resource} 匿名配额暂不可用，可在 ${new Date(retryAt).toLocaleString(
        'zh-CN',
      )} 后重试`,
    );
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubApiError extends Error {
  readonly code = 'GITHUB_API_ERROR';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`GitHub API 请求失败：${message}`);
    this.name = 'GitHubApiError';
  }
}

export class GitHubApiClient {
  private readonly cache = new Map<string, { expiresAt: number; value: SearchResponse }>();

  constructor(private readonly dependencies: GitHubApiDependencies = defaultDependencies()) {}

  searchRepositories(query: string, signal: AbortSignal): Promise<SearchResponse> {
    return this.search('repositories', query, signal);
  }

  searchIssues(query: string, signal: AbortSignal): Promise<SearchResponse> {
    return this.search('issues', query, signal);
  }

  private async search(
    target: ResolvedSearchTarget,
    query: string,
    signal: AbortSignal,
  ): Promise<SearchResponse> {
    const normalized = query.trim();
    if (!normalized || normalized.length > 256) {
      throw new Error('GitHub 搜索语句长度必须为 1–256 个字符');
    }
    const cacheKey = `${target}:${normalized}`;
    const now = this.dependencies.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    await this.assertBucketAvailable('search', now);
    const url = new URL(`/search/${target}`, GITHUB_API_ORIGIN);
    url.searchParams.set('q', normalized);
    url.searchParams.set('per_page', '10');
    const response = await this.dependencies.fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal,
    });
    const resource = await this.updateRateLimitState(response, 'search', now);
    if (!response.ok) {
      const remaining = headerInteger(response.headers, 'X-RateLimit-Remaining');
      if ((response.status === 403 || response.status === 429) && remaining === 0) {
        const stored = await this.readStorage();
        const retryAt = stored.buckets[resource]?.blockedUntil ?? now + 60_000;
        throw new GitHubRateLimitError(resource, retryAt);
      }
      throw new GitHubApiError(response.status, await readableApiError(response));
    }
    const value =
      target === 'repositories'
        ? this.parseRepositories(await response.json())
        : this.parseIssues(await response.json());
    this.cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value });
    return value;
  }

  private parseRepositories(raw: unknown): SearchResponse {
    const parsed = repositorySearchResponseSchema.parse(raw);
    return {
      totalCount: parsed.total_count,
      items: parsed.items.slice(0, 10).map((item) => ({
        kind: 'repository',
        id: item.id,
        title: item.full_name,
        url: item.html_url,
        description: item.description ?? undefined,
        language: item.language ?? undefined,
        stars: item.stargazers_count,
        updatedAt: item.updated_at,
        archived: item.archived,
      })),
    };
  }

  private parseIssues(raw: unknown): SearchResponse {
    const parsed = issueSearchResponseSchema.parse(raw);
    return {
      totalCount: parsed.total_count,
      items: parsed.items.slice(0, 10).map((item) => ({
        kind: 'issue',
        id: item.id,
        title: item.title,
        url: item.html_url,
        repository: repositoryFromApiUrl(item.repository_url),
        number: item.number,
        state: item.state,
        labels: item.labels.slice(0, 20).map((label) => label.name),
        comments: item.comments,
        updatedAt: item.updated_at,
      })),
    };
  }

  private async assertBucketAvailable(
    resource: GitHubRateLimitResource,
    now: number,
  ): Promise<void> {
    const stored = await this.readStorage();
    const blockedUntil = stored.buckets[resource]?.blockedUntil;
    if (blockedUntil && blockedUntil > now) {
      throw new GitHubRateLimitError(resource, blockedUntil);
    }
    if (blockedUntil && blockedUntil <= now) {
      delete stored.buckets[resource];
      await this.dependencies.writeRateLimits(stored);
    }
  }

  private async updateRateLimitState(
    response: Response,
    fallbackResource: GitHubRateLimitResource,
    now: number,
  ): Promise<GitHubRateLimitResource> {
    const resource = parseResource(response.headers, fallbackResource);
    const remaining = headerInteger(response.headers, 'X-RateLimit-Remaining');
    const resetSeconds = headerInteger(response.headers, 'X-RateLimit-Reset');
    const resetAt = resetSeconds === undefined ? undefined : resetSeconds * 1_000;
    const retryAt = parseRetryAfter(response.headers, now);
    const limited = (response.status === 403 || response.status === 429) && remaining === 0;
    const stored = await this.readStorage();
    stored.buckets[resource] = {
      remaining,
      resetAt,
      blockedUntil: limited
        ? Math.max(retryAt ?? 0, resetAt ?? 0, now + 1_000)
        : remaining === 0 && resetAt && resetAt > now
          ? resetAt
          : undefined,
      updatedAt: now,
    };
    await this.dependencies.writeRateLimits(stored);
    return resource;
  }

  private async readStorage(): Promise<RateLimitStorage> {
    const candidate = await this.dependencies.readRateLimits();
    return candidate?.schemaVersion === 1 && candidate.buckets
      ? {
          schemaVersion: 1,
          buckets: { ...candidate.buckets },
        }
      : { schemaVersion: 1, buckets: {} };
  }
}
