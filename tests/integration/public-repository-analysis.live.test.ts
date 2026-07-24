import { describe, expect, it } from 'vitest';

import { GitHubApiClient, type GitHubApiDependencies } from '../../src/background/github-api';
import { RepositoryAnalysisExecutor } from '../../src/background/repository-analysis';

const LIVE = process.env.GITHUB_LIVE_TEST === '1';

describe('真实公开仓库匿名分析', () => {
  it.runIf(LIVE)(
    'react/react、microsoft/vscode、rust-lang/rust 均生成固定卡片',
    async () => {
      let rateLimits: Awaited<ReturnType<GitHubApiDependencies['readRateLimits']>>;
      const api = new GitHubApiClient({
        fetch: (input, init) => fetch(input, init),
        now: () => Date.now(),
        readRateLimits: async () => rateLimits,
        writeRateLimits: async (value) => {
          rateLimits = value;
        },
      });
      const analyzer = new RepositoryAnalysisExecutor(api);
      const cases = [
        {
          repository: 'react/react',
          description: 'The library for web and native user interfaces.',
          readme: 'npm install react\nSupports web browser and native interfaces.',
        },
        {
          repository: 'microsoft/vscode',
          description: 'Visual Studio Code.',
          readme:
            'git clone https://github.com/microsoft/vscode\nRuns on Windows, macOS and Linux.',
        },
        {
          repository: 'rust-lang/rust',
          description: 'The Rust programming language.',
          readme: 'Supports Windows, macOS and Linux.',
        },
      ];

      for (const item of cases) {
        const card = await analyzer.analyze({
          page: {
            url: `https://github.com/${item.repository}`,
            pageType: 'repo',
            repository: item.repository,
            isPrivate: false,
            extracted: {
              description: item.description,
              readme: item.readme,
              languages: [],
              stats: {},
            },
            capturedAt: new Date().toISOString(),
          },
          signal: new AbortController().signal,
        });

        expect(card.repository).toBe(item.repository);
        expect(card.url).toBe(`https://github.com/${card.repository}`);
        expect(card.sources.githubApi).toBe(true);
        expect(card.popularity.stars).toEqual(expect.any(Number));
        expect(card.languages.length).toBeGreaterThan(0);
        expect(card.nextSteps.length).toBeGreaterThan(0);
        expect(card.archived).not.toBeNull();
      }
    },
    90_000,
  );
});
