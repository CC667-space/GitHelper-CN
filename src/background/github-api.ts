import { z } from 'zod';

import type { GitHubSearchItem, ResolvedSearchTarget } from '../lib/github-search';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const RATE_LIMIT_STORAGE_KEY = 'github:rate-limits:v1';
const CACHE_TTL_MS = 60_000;
const REPOSITORY_CACHE_TTL_MS = 5 * 60_000;

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

export interface RepositoryApiDetails {
  fullName: string;
  url: string;
  description?: string;
  topics: string[];
  defaultBranch: string;
  primaryLanguage?: string;
  stars: number;
  forks: number;
  watchers: number;
  combinedOpenCount: number;
  archived: boolean;
  license?: {
    name: string;
    spdxId?: string;
  };
  pushedAt?: string;
  updatedAt?: string;
}

export interface RepositoryApiRelease {
  name: string;
  tag: string;
  publishedAt?: string;
  url?: string;
}

export interface RepositoryApiBundle {
  details: RepositoryApiDetails;
  languages: Record<string, number>;
  fileSnapshot?: RepositoryFileSnapshot;
  latestRelease?: RepositoryApiRelease;
  openPullRequests?: number;
  degradedNotice?: string;
}

export interface RepositoryFileSnapshot {
  directories: string[];
  inspectedFiles: Array<{
    path: string;
    content: string;
  }>;
  truncated: boolean;
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

const repositoryDetailsSchema = z
  .object({
    full_name: z.string().min(1).max(500),
    html_url: z.url(),
    description: z.string().max(2_000).nullable(),
    topics: z.array(z.string().max(100)).max(100).default([]),
    default_branch: z.string().min(1).max(300),
    language: z.string().max(100).nullable(),
    stargazers_count: z.number().int().nonnegative(),
    forks_count: z.number().int().nonnegative(),
    subscribers_count: z.number().int().nonnegative().optional(),
    watchers_count: z.number().int().nonnegative(),
    open_issues_count: z.number().int().nonnegative(),
    archived: z.boolean(),
    license: z
      .object({
        name: z.string().min(1).max(300),
        spdx_id: z.string().max(100).nullable(),
      })
      .passthrough()
      .nullable(),
    pushed_at: z.iso.datetime().nullable(),
    updated_at: z.iso.datetime().nullable(),
  })
  .passthrough();

const repositoryLanguagesSchema = z.record(
  z.string().min(1).max(100),
  z.number().int().nonnegative(),
);

const repositoryReleaseSchema = z
  .object({
    name: z.string().max(300).nullable(),
    tag_name: z.string().min(1).max(200),
    published_at: z.iso.datetime().nullable(),
    html_url: z.url(),
  })
  .passthrough();

const repositoryPullsSchema = z.array(z.object({ id: z.number().int() }).passthrough()).max(100);
const repositoryContentsSchema = z
  .array(
    z
      .object({
        name: z.string().min(1).max(500),
        path: z.string().min(1).max(1_000),
        type: z.enum(['file', 'dir']),
        size: z.number().int().nonnegative(),
        sha: z.string().min(1).max(100),
      })
      .passthrough(),
  )
  .max(1_000);
const repositoryFileContentSchema = z
  .object({
    type: z.literal('file'),
    path: z.string().min(1).max(1_000),
    size: z.number().int().nonnegative(),
    encoding: z.literal('base64'),
    content: z.string().max(64 * 1024),
  })
  .passthrough();

const MAX_INSPECTED_REPOSITORY_FILES = 3;
const MAX_INSPECTED_FILE_SIZE = 24 * 1024;
const MAX_INSPECTED_FILE_TEXT = 4 * 1024;

function isSafeRepositoryContentPath(path: string): boolean {
  const segments = path.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function encodeRepositoryContentPath(path: string): string {
  if (!isSafeRepositoryContentPath(path)) {
    throw new Error('GitHub Contents 返回了不安全的文件路径');
  }
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function repositoryFilePriority(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.split('/').at(-1) ?? lower;
  if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml)$/u.test(name)) {
    return 100;
  }
  if (/^(requirements[^/]*\.txt|setup\.py|build\.gradle(?:\.kts)?)$/u.test(name)) {
    return 95;
  }
  if (/^(dockerfile|compose\.ya?ml|docker-compose\.ya?ml)$/u.test(name)) {
    return 90;
  }
  if (/^(?:__main__|main|index|app|cli|server)\.[a-z0-9]+$/u.test(name)) {
    return 85;
  }
  if (
    /^(vite|webpack|rollup|next|nuxt|tsconfig|eslint)[^/]*\.(?:json|js|mjs|cjs|ts)$/u.test(name)
  ) {
    return 70;
  }
  if (
    /\.(?:py|ts|tsx|js|jsx|mjs|cjs|rs|go|java|kt|kts|c|cc|cpp|h|hpp|cs|rb|php|swift|sh|ps1)$/u.test(
      name,
    ) &&
    !/(?:^|[._-])(?:test|spec)(?:[._-]|$)/u.test(name)
  ) {
    return 60;
  }
  return 0;
}

function selectRepositoryDirectories(
  entries: z.infer<typeof repositoryContentsSchema>,
  repository: string,
): Array<z.infer<typeof repositoryContentsSchema>[number]> {
  const repositoryName = repository
    .split('/')
    .at(-1)
    ?.replaceAll(/[^a-z0-9]/giu, '')
    .toLowerCase();
  const ignored = /^(?:\.github|docs?|tests?|specs?|examples?|assets?|vendor|node_modules)$/iu;
  return entries
    .filter(
      (entry) =>
        entry.type === 'dir' &&
        isSafeRepositoryContentPath(entry.path) &&
        !ignored.test(entry.name),
    )
    .map((entry) => {
      const normalized = entry.name.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
      const lower = entry.name.toLowerCase();
      const priority =
        lower === 'src'
          ? 100
          : lower === 'app'
            ? 95
            : /^(?:lib|packages|cmd|pkg|internal)$/u.test(lower)
              ? 90
              : repositoryName && normalized === repositoryName
                ? 85
                : /(?:^|[._-])(?:agent|cli|core|server|client|sdk|api)(?:[._-]|$)/u.test(lower)
                  ? 80
                  : 10;
      return { entry, priority };
    })
    .sort(
      (left, right) =>
        right.priority - left.priority || left.entry.path.localeCompare(right.entry.path),
    )
    .slice(0, 2)
    .map(({ entry }) => entry);
}

function selectRepositoryFiles(
  entries: z.infer<typeof repositoryContentsSchema>,
): Array<z.infer<typeof repositoryContentsSchema>[number]> {
  return entries
    .filter(
      (entry) =>
        entry.type === 'file' &&
        isSafeRepositoryContentPath(entry.path) &&
        entry.size > 0 &&
        entry.size <= MAX_INSPECTED_FILE_SIZE &&
        !/(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/iu.test(entry.path),
    )
    .map((entry) => ({ entry, priority: repositoryFilePriority(entry.path) }))
    .filter(({ priority }) => priority > 0)
    .sort(
      (left, right) =>
        right.priority - left.priority || left.entry.path.localeCompare(right.entry.path),
    )
    .slice(0, MAX_INSPECTED_REPOSITORY_FILES)
    .map(({ entry }) => entry);
}

function decodeRepositoryFile(content: string): string {
  const binary = atob(content.replace(/\s+/gu, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes).slice(0, MAX_INSPECTED_FILE_TEXT);
}

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

function repositoryPath(repository: string): string {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u.exec(repository.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error('仓库名必须为 owner/repository');
  }
  return `${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
}

function linkLastPage(linkHeader: string | null): number | undefined {
  if (!linkHeader) {
    return undefined;
  }
  for (const part of linkHeader.split(',')) {
    if (!/rel="last"/u.test(part)) {
      continue;
    }
    const urlMatch = /<([^>]+)>/u.exec(part)?.[1];
    if (!urlMatch) {
      continue;
    }
    const page = Number(new URL(urlMatch).searchParams.get('page'));
    if (Number.isSafeInteger(page) && page >= 0) {
      return page;
    }
  }
  return undefined;
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
  private readonly repositoryCache = new Map<
    string,
    { expiresAt: number; value: RepositoryApiBundle }
  >();

  constructor(private readonly dependencies: GitHubApiDependencies = defaultDependencies()) {}

  searchRepositories(query: string, signal: AbortSignal): Promise<SearchResponse> {
    return this.search('repositories', query, signal);
  }

  searchIssues(query: string, signal: AbortSignal): Promise<SearchResponse> {
    return this.search('issues', query, signal);
  }

  async getRepositoryBundle(repository: string, signal: AbortSignal): Promise<RepositoryApiBundle> {
    const path = repositoryPath(repository);
    const cacheKey = repository.toLowerCase();
    const now = this.dependencies.now();
    const cached = this.repositoryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    const detailsResult = await this.requestCore(`/repos/${path}`, repositoryDetailsSchema, signal);
    const detailsData = detailsResult.data;
    const details: RepositoryApiDetails = {
      fullName: detailsData.full_name,
      url: detailsData.html_url,
      description: detailsData.description ?? undefined,
      topics: detailsData.topics.slice(0, 20),
      defaultBranch: detailsData.default_branch,
      primaryLanguage: detailsData.language ?? undefined,
      stars: detailsData.stargazers_count,
      forks: detailsData.forks_count,
      watchers: detailsData.subscribers_count ?? detailsData.watchers_count,
      combinedOpenCount: detailsData.open_issues_count,
      archived: detailsData.archived,
      license: detailsData.license
        ? {
            name: detailsData.license.name,
            spdxId: detailsData.license.spdx_id ?? undefined,
          }
        : undefined,
      pushedAt: detailsData.pushed_at ?? undefined,
      updatedAt: detailsData.updated_at ?? undefined,
    };
    let languages: Record<string, number> = {};
    let fileSnapshot: RepositoryFileSnapshot | undefined;
    let latestRelease: RepositoryApiRelease | undefined;
    let openPullRequests: number | undefined;
    let degradedNotice: string | undefined;
    let cacheExpiresAt = now + REPOSITORY_CACHE_TTL_MS;
    try {
      languages = (
        await this.requestCore(`/repos/${path}/languages`, repositoryLanguagesSchema, signal)
      ).data;
      const release = await this.requestCore(
        `/repos/${path}/releases/latest`,
        repositoryReleaseSchema,
        signal,
        true,
      );
      if (release.data) {
        latestRelease = {
          name: release.data.name?.trim() || release.data.tag_name,
          tag: release.data.tag_name,
          publishedAt: release.data.published_at ?? undefined,
          url: release.data.html_url,
        };
      }
      const pulls = await this.requestCore(
        `/repos/${path}/pulls?state=open&per_page=1`,
        repositoryPullsSchema,
        signal,
      );
      openPullRequests = linkLastPage(pulls.headers.get('Link')) ?? pulls.data.length;
      const root = (
        await this.requestCore(
          `/repos/${path}/contents?ref=${encodeURIComponent(details.defaultBranch)}`,
          repositoryContentsSchema,
          signal,
        )
      ).data;
      const directories = root
        .filter((entry) => entry.type === 'dir')
        .map((entry) => entry.path)
        .slice(0, 12);
      const selectedDirectories = selectRepositoryDirectories(root, details.fullName);
      const nestedEntries: z.infer<typeof repositoryContentsSchema> = [];
      let fileReadFailed = false;
      for (const directory of selectedDirectories) {
        try {
          const encodedDirectory = encodeRepositoryContentPath(directory.path);
          const result = await this.requestCore(
            `/repos/${path}/contents/${encodedDirectory}?ref=${encodeURIComponent(
              details.defaultBranch,
            )}`,
            repositoryContentsSchema,
            signal,
            true,
          );
          if (result.data) {
            nestedEntries.push(...result.data);
          }
        } catch (error: unknown) {
          if (error instanceof GitHubRateLimitError) {
            throw error;
          }
          fileReadFailed = true;
        }
      }
      const selectedFiles = selectRepositoryFiles([...root, ...nestedEntries]);
      const inspectedFiles: RepositoryFileSnapshot['inspectedFiles'] = [];
      for (const file of selectedFiles) {
        try {
          const encodedPath = encodeRepositoryContentPath(file.path);
          const result = await this.requestCore(
            `/repos/${path}/contents/${encodedPath}?ref=${encodeURIComponent(
              details.defaultBranch,
            )}`,
            repositoryFileContentSchema,
            signal,
            true,
          );
          if (result.data?.path === file.path) {
            inspectedFiles.push({
              path: result.data.path,
              content: decodeRepositoryFile(result.data.content),
            });
          }
        } catch (error: unknown) {
          if (error instanceof GitHubRateLimitError) {
            throw error;
          }
          fileReadFailed = true;
        }
      }
      fileSnapshot = {
        directories,
        inspectedFiles,
        truncated:
          root.length >= 1_000 ||
          selectedFiles.length >= MAX_INSPECTED_REPOSITORY_FILES ||
          root.some((entry) => entry.type === 'dir') ||
          nestedEntries.some((entry) => entry.type === 'dir') ||
          fileReadFailed,
      };
    } catch (error: unknown) {
      degradedNotice =
        error instanceof GitHubRateLimitError
          ? `${error.message}；已保留此前取得的仓库事实并停止后续 core 请求。`
          : `部分 GitHub API 字段不可用：${error instanceof Error ? error.message : String(error)}`;
      cacheExpiresAt =
        error instanceof GitHubRateLimitError
          ? Math.min(cacheExpiresAt, Math.max(now + 1_000, error.retryAt))
          : Math.min(cacheExpiresAt, now + 60_000);
    }
    const bundle = {
      details,
      languages,
      fileSnapshot,
      latestRelease,
      openPullRequests,
      degradedNotice,
    };
    this.repositoryCache.set(cacheKey, {
      expiresAt: cacheExpiresAt,
      value: bundle,
    });
    return bundle;
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

  private requestCore<Output>(
    path: string,
    schema: z.ZodType<Output>,
    signal: AbortSignal,
  ): Promise<{ data: Output; headers: Headers }>;
  private requestCore<Output>(
    path: string,
    schema: z.ZodType<Output>,
    signal: AbortSignal,
    allowNotFound: true,
  ): Promise<{ data: Output | undefined; headers: Headers }>;
  private async requestCore<Output>(
    path: string,
    schema: z.ZodType<Output>,
    signal: AbortSignal,
    allowNotFound = false,
  ): Promise<{ data: Output; headers: Headers } | { data: undefined; headers: Headers }> {
    const now = this.dependencies.now();
    await this.assertBucketAvailable('core', now);
    const url = new URL(path, GITHUB_API_ORIGIN);
    if (url.origin !== GITHUB_API_ORIGIN) {
      throw new Error('GitHub API 路径越出固定 Host');
    }
    const response = await this.dependencies.fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal,
    });
    const resource = await this.updateRateLimitState(response, 'core', now);
    if (allowNotFound && response.status === 404) {
      return { data: undefined, headers: response.headers };
    }
    if (!response.ok) {
      const remaining = headerInteger(response.headers, 'X-RateLimit-Remaining');
      if ((response.status === 403 || response.status === 429) && remaining === 0) {
        const stored = await this.readStorage();
        const retryAt = stored.buckets[resource]?.blockedUntil ?? now + 60_000;
        throw new GitHubRateLimitError(resource, retryAt);
      }
      throw new GitHubApiError(response.status, await readableApiError(response));
    }
    return {
      data: schema.parse(await response.json()),
      headers: response.headers,
    };
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
