import type { PageContext, ProviderId } from '../lib/types';
import {
  repositoryInsightPatchSchema,
  repositoryAnalysisCardSchema,
  repositoryInsightsSchema,
  type RepositoryAnalysisCard,
  type RepositoryInsightPatch,
  type RepositoryInsights,
} from '../lib/repository-analysis';
import {
  GitHubApiClient,
  GitHubRateLimitError,
  type RepositoryApiBundle,
  type RepositoryFileSnapshot,
} from './github-api';
import { assertPublicContext } from './outbound-policy';
import {
  buildRepositoryQuickScan,
  cleanRepositoryMarkdownText,
  extractReadmeSummary,
  hasChineseNarrative,
} from './repository-quick-scan';

export interface RepositoryAnalysisFacts {
  repository: string;
  url: string;
  description?: string;
  readmeExcerpt?: string;
  topics: string[];
  primaryLanguage?: string;
  languages: Array<{ name: string; percent: number }>;
  fileSnapshot?: RepositoryFileSnapshot;
  detectedPlatforms: string[];
  installCommands: string[];
  latestRelease?: RepositoryApiBundle['latestRelease'];
  pushedAt?: string;
  updatedAt?: string;
  stars?: number;
  forks?: number;
  watchers?: number;
  archived?: boolean;
  license?: RepositoryApiBundle['details']['license'];
  combinedOpenCount?: number;
  openPullRequests?: number;
}

export interface RepositoryInsightGeneratorResult {
  insights: RepositoryInsightPatch;
  providerId: ProviderId;
}

export type RepositoryInsightGenerator = (
  facts: RepositoryAnalysisFacts,
  signal: AbortSignal,
  manualProviderId?: ProviderId,
  requestId?: string,
) => Promise<RepositoryInsightGeneratorResult>;

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function parseCompactCount(value: unknown): number | undefined {
  const text = boundedString(value, 50)?.replaceAll(',', '').toLowerCase();
  if (!text) {
    return undefined;
  }
  const match = /^([\d.]+)\s*([km])?$/u.exec(text);
  if (!match?.[1]) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return undefined;
  }
  const multiplier = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  return Math.round(amount * multiplier);
}

function languagePercentages(
  languages: Record<string, number>,
  fallback: unknown,
  primaryLanguage?: string,
): Array<{ name: string; percent: number }> {
  const entries = Object.entries(languages)
    .filter(([, bytes]) => Number.isFinite(bytes) && bytes >= 0)
    .sort((left, right) => right[1] - left[1]);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total > 0) {
    return entries.slice(0, 5).map(([name, bytes]) => ({
      name,
      percent: Math.round((bytes / total) * 1_000) / 10,
    }));
  }
  const domLanguages = Array.isArray(fallback)
    ? fallback
        .filter((item): item is string => typeof item === 'string')
        .map((item) => {
          const match = /^(.+?)\s+([\d.]+)%$/u.exec(item.trim());
          return match?.[1] && match[2]
            ? { name: match[1].trim(), percent: Number(match[2]) }
            : undefined;
        })
        .filter(
          (item): item is { name: string; percent: number } =>
            item !== undefined && Number.isFinite(item.percent),
        )
        .slice(0, 5)
    : [];
  if (domLanguages.length) {
    return domLanguages;
  }
  return primaryLanguage ? [{ name: primaryLanguage, percent: 100 }] : [];
}

function fileRole(path: string): string {
  const lower = path.toLowerCase();
  if (/(^|\/)readme(?:\.[a-z0-9_-]+)?\.(?:md|mdx|rst|txt)$/u.test(lower)) {
    return '项目说明';
  }
  if (
    /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|requirements[^/]*\.txt)$/u.test(
      lower,
    )
  ) {
    return '依赖与构建清单';
  }
  if (/(^|\/)(main|index|app|cli)\.[a-z0-9]+$/u.test(lower)) {
    return '程序入口';
  }
  if (/(^|\/)(dockerfile|compose\.ya?ml|docker-compose\.ya?ml)$/u.test(lower)) {
    return '运行环境';
  }
  if (/(^|\/)(test|tests|spec|specs)(\/|$)/u.test(lower)) {
    return '测试';
  }
  return '关键项目文件';
}

function jsonFindings(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const findings: string[] = [];
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      findings.push(`项目名：${parsed.name.trim().slice(0, 120)}`);
    }
    if (parsed.scripts && typeof parsed.scripts === 'object' && !Array.isArray(parsed.scripts)) {
      const scripts = Object.keys(parsed.scripts).slice(0, 8);
      if (scripts.length) {
        findings.push(`脚本：${scripts.join('、')}`);
      }
    }
    if (
      parsed.dependencies &&
      typeof parsed.dependencies === 'object' &&
      !Array.isArray(parsed.dependencies)
    ) {
      const dependencies = Object.keys(parsed.dependencies).slice(0, 8);
      if (dependencies.length) {
        findings.push(`主要依赖：${dependencies.join('、')}`);
      }
    }
    return findings;
  } catch {
    return [];
  }
}

function sourceFindings(content: string): string[] {
  const findings: string[] = [];
  const definitions = [
    ...content.matchAll(
      /\b(?:export\s+)?(?:async\s+)?(?:function|class|def|fn)\s+([A-Za-z_$][\w$]*)/gu,
    ),
  ]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .slice(0, 6);
  if (definitions.length) {
    findings.push(`定义：${definitions.join('、')}`);
  }
  const sections = [
    ...content.matchAll(/^\s*\[([A-Za-z0-9_.-]+)\]\s*$/gmu),
    ...content.matchAll(/^\s*module\s+([^\s]+)\s*$/gmu),
  ]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .slice(0, 6);
  if (sections.length) {
    findings.push(`配置段：${sections.join('、')}`);
  }
  const nonCommentLines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('//') &&
        !line.startsWith('#') &&
        !line.startsWith('/*') &&
        !line.startsWith('*'),
    )
    .slice(0, 2)
    .map((line) => line.slice(0, 140));
  if (!findings.length && nonCommentLines.length) {
    findings.push(`内容线索：${nonCommentLines.join('；')}`);
  }
  return findings;
}

function markdownFindings(content: string): string[] {
  const headings = [...content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)]
    .map((match) => (match[1] ? cleanRepositoryMarkdownText(match[1]).slice(0, 100) : undefined))
    .filter((heading): heading is string => Boolean(heading))
    .slice(0, 6);
  const findings: string[] = [];
  if (headings.length) {
    findings.push(`章节：${headings.join('、')}`);
  }
  const intro = extractReadmeSummary(content);
  if (intro) {
    findings.push(`简介：${intro.slice(0, 140)}`);
  }
  return findings;
}

function mergeRepositoryInsights(
  local: RepositoryInsights,
  patch: RepositoryInsightPatch,
): RepositoryInsights {
  const validatedPatch = repositoryInsightPatchSchema.parse(patch);
  return repositoryInsightsSchema.parse({
    ...local,
    ...validatedPatch,
  });
}

function summarizeStructure(snapshot?: RepositoryFileSnapshot): {
  directories: string[];
  keyFiles: Array<{ path: string; role: string; findings: string[] }>;
  truncated: boolean;
} {
  if (!snapshot) {
    return { directories: [], keyFiles: [], truncated: false };
  }
  return {
    directories: snapshot.directories.slice(0, 12),
    keyFiles: snapshot.inspectedFiles.slice(0, 3).map((file) => {
      const lower = file.path.toLowerCase();
      const findings = /(^|\/)readme(?:\.[a-z0-9_-]+)?\.(?:md|mdx|rst|txt)$/u.test(lower)
        ? markdownFindings(file.content)
        : lower.endsWith('.json')
          ? jsonFindings(file.content)
          : sourceFindings(file.content);
      return {
        path: file.path,
        role: fileRole(file.path),
        findings: findings.slice(0, 4),
      };
    }),
    truncated: snapshot.truncated,
  };
}

function extractInstallCommands(readme: string): string[] {
  const commandPattern =
    /^(?:\s*(?:\$|>)\s*)?((?:npm|pnpm|yarn|bun|pipx?|uv|poetry|cargo|go|brew|docker|git)\s+(?:install|add|run|clone|pull|compose|build|up)\b[^\r\n]{0,400})$/gimu;
  const commands: string[] = [];
  for (const match of readme.matchAll(commandPattern)) {
    const command = match[1]?.trim();
    if (command && !commands.includes(command)) {
      commands.push(command);
    }
    if (commands.length >= 8) {
      break;
    }
  }
  return commands;
}

function detectPlatforms(text: string, topics: string[]): string[] {
  const haystack = `${text} ${topics.join(' ')}`.toLowerCase();
  const candidates: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bwindows\b/u, 'Windows'],
    [/\bmacos\b|\bmac os\b|\bosx\b/u, 'macOS'],
    [/\blinux\b|\bubuntu\b/u, 'Linux'],
    [/\bnode(?:\.js)?\b/u, 'Node.js'],
    [/\bbrowser\b|\bchrome\b|\bfirefox\b|\bweb\b/u, 'Web/Browser'],
    [/\bdocker\b|\bcontainer\b/u, 'Docker'],
    [/\bandroid\b/u, 'Android'],
    [/\bios\b|\biphone\b|\bipad\b/u, 'iOS'],
    [/\bcli\b|command.line/u, 'CLI'],
  ];
  return candidates
    .filter(([pattern]) => pattern.test(haystack))
    .map(([, label]) => label)
    .slice(0, 8);
}

function localPurpose(facts: RepositoryAnalysisFacts): string {
  const description = facts.description
    ? cleanRepositoryMarkdownText(facts.description)
    : undefined;
  const readmeSummary = facts.readmeExcerpt ? extractReadmeSummary(facts.readmeExcerpt) : undefined;
  const source = [description, readmeSummary].find(
    (candidate): candidate is string =>
      Boolean(candidate) && hasChineseNarrative(candidate ?? '', 4),
  );
  if (!source) {
    if (description || readmeSummary) {
      return '仓库公开说明主要为外文，当前未获得可用的中文用途概括。';
    }
    return '公开信息不足，暂时无法可靠判断该仓库的主要用途。';
  }
  const firstSentence = source.split(/(?<=[。！？.!?])\s*/u)[0]?.trim();
  return (firstSentence || source).slice(0, 1_000);
}

function localDifficulty(facts: RepositoryAnalysisFacts): RepositoryInsights['difficulty'] {
  if (!facts.installCommands.length) {
    return {
      level: '未知',
      reason: 'README 中未提取到明确安装命令，需要先核对项目文档。',
    };
  }
  if (
    facts.installCommands.some((command) => /\bdocker\b|\bcompose\b/iu.test(command)) ||
    facts.languages.length >= 4
  ) {
    return {
      level: '进阶',
      reason: '安装涉及容器或多语言技术栈，建议先确认运行环境与依赖。',
    };
  }
  return {
    level: facts.installCommands.length <= 2 ? '入门' : '中等',
    reason: `README 中提取到 ${facts.installCommands.length} 条安装/启动命令。`,
  };
}

function factualRisks(facts: RepositoryAnalysisFacts, now: Date): string[] {
  const risks: string[] = [];
  if (facts.archived) {
    risks.push('仓库已归档，通常不再接受维护更新。');
  }
  if (!facts.license) {
    risks.push('未从 GitHub API 获取到明确许可证，使用前需核对授权条件。');
  }
  if (!facts.latestRelease) {
    risks.push('未找到正式 Release，版本稳定性与安装方式需从 README 核对。');
  }
  if (facts.pushedAt) {
    const inactiveDays = Math.floor((now.getTime() - Date.parse(facts.pushedAt)) / 86_400_000);
    if (Number.isFinite(inactiveDays) && inactiveDays > 365) {
      risks.push(`最后代码推送距今约 ${inactiveDays} 天，维护活跃度可能偏低。`);
    }
  }
  return risks.slice(0, 8);
}

function fallbackInsights(facts: RepositoryAnalysisFacts, now: Date): RepositoryInsights {
  return {
    purpose: localPurpose(facts),
    platforms: facts.detectedPlatforms,
    installation: facts.installCommands,
    difficulty: localDifficulty(facts),
    risks: factualRisks(facts, now),
    nextSteps: [
      '先阅读 README 的安装与快速开始章节。',
      '检查最新 Release、许可证和未解决 Issue 是否符合使用要求。',
      '在隔离环境中完成最小安装或运行验证。',
    ],
  };
}

function uniqueLimited(primary: string[], secondary: string[], limit = 8): string[] {
  return [...new Set([...primary, ...secondary].map((item) => item.trim()).filter(Boolean))].slice(
    0,
    limit,
  );
}

function domFacts(page: PageContext): {
  description?: string;
  readme?: string;
  primaryLanguage?: string;
  stats: { stars?: number; forks?: number; watchers?: number };
} {
  const stats =
    page.extracted.stats && typeof page.extracted.stats === 'object'
      ? (page.extracted.stats as Record<string, unknown>)
      : {};
  const languages = Array.isArray(page.extracted.languages)
    ? page.extracted.languages.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    description: boundedString(page.extracted.description, 2_000),
    readme: boundedString(page.extracted.readme, 8_000),
    primaryLanguage: languages[0]?.split(/\s+\d/)[0]?.trim(),
    stats: {
      stars: parseCompactCount(stats.stars),
      forks: parseCompactCount(stats.forks),
      watchers: parseCompactCount(stats.watchers),
    },
  };
}

export class RepositoryAnalysisExecutor {
  constructor(
    private readonly api = new GitHubApiClient(),
    private readonly generateInsights?: RepositoryInsightGenerator,
  ) {}

  async analyze(input: {
    page: PageContext;
    signal: AbortSignal;
    manualProviderId?: ProviderId;
    requestId?: string;
    now?: Date;
  }): Promise<RepositoryAnalysisCard> {
    assertPublicContext(input.page);
    const repository = input.page.repository;
    if (!repository) {
      throw new Error('当前 GitHub 页面不属于可识别的公开仓库');
    }
    const now = input.now ?? new Date();
    const dom = domFacts(input.page);
    let api: RepositoryApiBundle | undefined;
    let degradedNotice: string | undefined;
    try {
      api = await this.api.getRepositoryBundle(repository, input.signal);
      degradedNotice = api.degradedNotice;
    } catch (error: unknown) {
      degradedNotice =
        error instanceof GitHubRateLimitError
          ? `${error.message}；本次使用当前页面 DOM 生成降级分析，未重复请求 API。`
          : `GitHub API 暂不可用，本次使用当前页面 DOM 生成降级分析：${
              error instanceof Error ? error.message : String(error)
            }`;
    }
    const canonicalRepository = api?.details.fullName ?? repository;
    const description = api?.details.description ?? dom.description;
    const inspectedFiles = api?.fileSnapshot?.inspectedFiles ?? [];
    const inspectedReadme =
      inspectedFiles.find((file) => /(^|\/)readme\.(?:md|mdx|rst|txt)$/iu.test(file.path))
        ?.content ??
      inspectedFiles.find((file) =>
        /(^|\/)readme\.[a-z0-9_-]+\.(?:md|mdx|rst|txt)$/iu.test(file.path),
      )?.content;
    const readme = inspectedReadme ?? dom.readme;
    const primaryLanguage = api?.details.primaryLanguage ?? dom.primaryLanguage;
    const topics = api?.details.topics ?? [];
    const languages = languagePercentages(
      api?.languages ?? {},
      input.page.extracted.languages,
      primaryLanguage,
    );
    const installCommands = extractInstallCommands(readme ?? '');
    const facts: RepositoryAnalysisFacts = {
      repository: canonicalRepository,
      url: api?.details.url ?? `https://github.com/${repository}`,
      description,
      readmeExcerpt: readme?.slice(0, 4_000),
      topics,
      primaryLanguage,
      languages,
      fileSnapshot: api?.fileSnapshot,
      detectedPlatforms: detectPlatforms(`${description ?? ''}\n${readme ?? ''}`, topics),
      installCommands,
      latestRelease: api?.latestRelease,
      pushedAt: api?.details.pushedAt,
      updatedAt: api?.details.updatedAt,
      stars: api?.details.stars ?? dom.stats.stars,
      forks: api?.details.forks ?? dom.stats.forks,
      watchers: api?.details.watchers ?? dom.stats.watchers,
      archived: api?.details.archived,
      license: api?.details.license,
      combinedOpenCount: api?.details.combinedOpenCount,
      openPullRequests: api?.openPullRequests,
    };
    const local = fallbackInsights(facts, now);
    let insights = local;
    let providerUsed = false;
    if (this.generateInsights) {
      try {
        const generated = await this.generateInsights(
          facts,
          input.signal,
          input.manualProviderId,
          input.requestId,
        );
        insights = mergeRepositoryInsights(local, generated.insights);
        providerUsed = true;
      } catch (error: unknown) {
        degradedNotice = [
          degradedNotice,
          `Provider 结构化解释不可用，已使用本地确定性说明：${
            error instanceof Error ? error.message : String(error)
          }`,
        ]
          .filter(Boolean)
          .join(' ');
      }
    }
    const factual = factualRisks(facts, now);
    const structure = summarizeStructure(facts.fileSnapshot);
    const openIssues =
      facts.combinedOpenCount !== undefined && facts.openPullRequests !== undefined
        ? Math.max(0, facts.combinedOpenCount - facts.openPullRequests)
        : undefined;
    return repositoryAnalysisCardSchema.parse({
      repository: facts.repository,
      url: facts.url,
      purpose: hasChineseNarrative(insights.purpose, 4) ? insights.purpose : local.purpose,
      quickScan: buildRepositoryQuickScan({
        readme,
        description,
        installCommands,
        structure,
        insights,
        providerUsed,
      }),
      languages,
      structure,
      platforms: uniqueLimited(facts.detectedPlatforms, insights.platforms),
      installation: {
        steps: installCommands.length ? installCommands : insights.installation,
        source: installCommands.length
          ? 'readme'
          : insights.installation.length
            ? 'provider'
            : 'unknown',
      },
      release: facts.latestRelease
        ? {
            name: facts.latestRelease.name,
            tag: facts.latestRelease.tag,
            publishedAt: facts.latestRelease.publishedAt,
            url: facts.latestRelease.url,
          }
        : null,
      activity: {
        pushedAt: facts.pushedAt,
        updatedAt: facts.updatedAt,
      },
      popularity: {
        stars: facts.stars,
        forks: facts.forks,
        watchers: facts.watchers,
      },
      archived: facts.archived ?? null,
      license: facts.license
        ? {
            name: facts.license.name,
            spdxId: facts.license.spdxId,
          }
        : null,
      issuesAndPullRequests: {
        openIssues,
        openPullRequests: facts.openPullRequests,
        combinedOpenCount: facts.combinedOpenCount,
      },
      difficulty: insights.difficulty,
      risks: uniqueLimited(factual, insights.risks),
      nextSteps: insights.nextSteps,
      generatedAt: now.toISOString(),
      sources: {
        dom: true,
        githubApi: Boolean(api),
        provider: providerUsed,
      },
      degradedNotice: degradedNotice?.slice(0, 1_000),
    });
  }
}
