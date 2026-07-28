import type { PageContext, ProviderId } from '../../lib/types';
import {
  githubSearchResultSchema,
  type GitHubSearchResult,
  type SearchConversion,
  type SearchTarget,
} from '../../lib/github-search';
import { GitHubApiClient, GitHubRateLimitError } from '../github-api';
import {
  compileProviderSearchIntent,
  convertNaturalLanguageSearch,
  type ProviderSearchIntent,
} from '../search-query';
import { SearchToolRegistry } from './registry';

function githubSearchUrl(query: string, target: 'repositories' | 'issues'): string {
  const url = new URL('https://github.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('type', target);
  return url.toString();
}

function localSearchItems(page?: PageContext): string[] {
  if (page?.pageType !== 'search') {
    return [];
  }
  const results = page.extracted.results;
  return Array.isArray(results)
    ? results.filter((item): item is string => typeof item === 'string').slice(0, 10)
    : [];
}

export type SearchIntentGenerator = (input: {
  naturalLanguage: string;
  requestedTarget: SearchTarget;
  manualProviderId?: ProviderId;
  requestId: string;
  signal: AbortSignal;
  now: Date;
}) => Promise<{
  intent: ProviderSearchIntent;
  providerId: ProviderId;
  providerLabel: string;
}>;

export class GitHubSearchExecutor {
  private readonly registry: SearchToolRegistry;

  constructor(
    private readonly api = new GitHubApiClient(),
    private readonly generateIntent?: SearchIntentGenerator,
  ) {
    this.registry = new SearchToolRegistry({
      searchRepos: ({ query }, { signal }) => this.api.searchRepositories(query, signal),
      searchIssues: ({ query }, { signal }) => this.api.searchIssues(query, signal),
    });
  }

  async search(input: {
    naturalLanguage: string;
    target: SearchTarget;
    page?: PageContext;
    manualProviderId?: ProviderId;
    requestId?: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<GitHubSearchResult> {
    const now = input.now ?? new Date();
    let conversionNotice: string | undefined;
    let conversion: SearchConversion;
    if (this.generateIntent) {
      try {
        const generated = await this.generateIntent({
          naturalLanguage: input.naturalLanguage,
          requestedTarget: input.target,
          manualProviderId: input.manualProviderId,
          requestId: input.requestId ?? crypto.randomUUID(),
          signal: input.signal,
          now,
        });
        conversion = compileProviderSearchIntent(
          input.naturalLanguage,
          input.target,
          generated.intent,
          now,
        );
        conversionNotice = `已由 ${generated.providerLabel} 理解中文需求，并由本地规则校验后执行；本次调用可能产生少量费用。`;
      } catch (error: unknown) {
        if (input.signal.aborted) {
          throw error;
        }
        conversion = convertNaturalLanguageSearch(input.naturalLanguage, input.target, now);
        conversionNotice = 'AI 理解暂不可用，已自动使用本地规则生成查询。';
      }
    } else {
      conversion = convertNaturalLanguageSearch(input.naturalLanguage, input.target, now);
    }
    const toolName = conversion.target === 'repositories' ? 'searchRepos' : 'searchIssues';
    try {
      const result = await this.registry.execute(
        toolName,
        { query: conversion.query },
        { signal: input.signal },
      );
      if (!result.ok) {
        throw new Error(result.error ?? 'GitHub 搜索工具执行失败');
      }
      const data = result.data as {
        totalCount: number;
        items: GitHubSearchResult['items'];
      };
      return githubSearchResultSchema.parse({
        status: 'ok',
        conversion,
        totalCount: data.totalCount,
        items: data.items,
        notice: conversionNotice,
      });
    } catch (error: unknown) {
      if (!(error instanceof GitHubRateLimitError)) {
        throw error;
      }
      const localItems = localSearchItems(input.page);
      const rateLimitNotice =
        localItems.length > 0
          ? `${error.message}。当前 GitHub 搜索页已有 ${localItems.length} 条本地 DOM 结果可供参考；未重复请求 API。`
          : `${error.message}。已生成 GitHub 网页搜索链接；未重复请求 API。`;
      return githubSearchResultSchema.parse({
        status: 'fallback',
        conversion,
        totalCount: localItems.length,
        items: [],
        localResults: localItems.length ? localItems : undefined,
        fallbackUrl: githubSearchUrl(conversion.query, conversion.target),
        notice: conversionNotice ? `${conversionNotice} ${rateLimitNotice}` : rateLimitNotice,
      });
    }
  }
}
