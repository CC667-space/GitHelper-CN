import type { PageContext } from '../../lib/types';
import {
  githubSearchResultSchema,
  type GitHubSearchResult,
  type SearchTarget,
} from '../../lib/github-search';
import { GitHubApiClient, GitHubRateLimitError } from '../github-api';
import { convertNaturalLanguageSearch } from '../search-query';
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

export class GitHubSearchExecutor {
  private readonly registry: SearchToolRegistry;

  constructor(private readonly api = new GitHubApiClient()) {
    this.registry = new SearchToolRegistry({
      searchRepos: ({ query }, { signal }) => this.api.searchRepositories(query, signal),
      searchIssues: ({ query }, { signal }) => this.api.searchIssues(query, signal),
    });
  }

  async search(input: {
    naturalLanguage: string;
    target: SearchTarget;
    page?: PageContext;
    signal: AbortSignal;
    now?: Date;
  }): Promise<GitHubSearchResult> {
    const conversion = convertNaturalLanguageSearch(input.naturalLanguage, input.target, input.now);
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
      });
    } catch (error: unknown) {
      if (!(error instanceof GitHubRateLimitError)) {
        throw error;
      }
      const localItems = localSearchItems(input.page);
      return githubSearchResultSchema.parse({
        status: 'fallback',
        conversion,
        totalCount: localItems.length,
        items: [],
        localResults: localItems.length ? localItems : undefined,
        fallbackUrl: githubSearchUrl(conversion.query, conversion.target),
        notice:
          localItems.length > 0
            ? `${error.message}。当前 GitHub 搜索页已有 ${localItems.length} 条本地 DOM 结果可供参考；未重复请求 API。`
            : `${error.message}。已生成 GitHub 网页搜索链接；未重复请求 API。`,
      });
    }
  }
}
