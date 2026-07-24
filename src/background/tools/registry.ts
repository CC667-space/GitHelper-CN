import { z } from 'zod';

import { githubWebUrlSchema } from '../../lib/github-search';
import type { ToolResult } from '../../lib/types';

const repositoryNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u, '仓库名必须为 owner/repository');

const elementKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/u, '元素标识只能使用安全字符');

export const searchReposArgsSchema = z
  .object({
    query: z.string().trim().min(1).max(256),
  })
  .strict();

export const searchIssuesArgsSchema = z
  .object({
    query: z.string().trim().min(1).max(256),
  })
  .strict();

export const openGitHubPageArgsSchema = z
  .object({
    url: githubWebUrlSchema,
  })
  .strict();

export const openExternalLinkArgsSchema = z
  .object({
    url: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname !== 'github.com' &&
        url.username === '' &&
        url.password === ''
      );
    }, '外部链接只允许不含凭据的 GitHub 之外 HTTPS URL'),
  })
  .strict();

export const toolSchemas = {
  openGitHubPage: openGitHubPageArgsSchema,
  openReleases: z.object({ repository: repositoryNameSchema }).strict(),
  openIssues: z.object({ repository: repositoryNameSchema }).strict(),
  searchRepos: searchReposArgsSchema,
  searchIssues: searchIssuesArgsSchema,
  highlightElement: z.object({ elementKey: elementKeySchema }).strict(),
  scrollToElement: z.object({ elementKey: elementKeySchema }).strict(),
  extractPageInfo: z.object({}).strict(),
  openExternalLink: openExternalLinkArgsSchema,
} as const;

export const searchToolSchemas = {
  searchRepos: searchReposArgsSchema,
  searchIssues: searchIssuesArgsSchema,
} as const;

export type ToolName = keyof typeof toolSchemas;
export type SearchToolName = keyof typeof searchToolSchemas;

export interface ToolHandlerContext {
  signal: AbortSignal;
  confirmedExternal?: true;
}

type ToolArgs<Name extends ToolName> = z.infer<(typeof toolSchemas)[Name]>;

export type ToolHandlers = {
  [Name in ToolName]?: (args: ToolArgs<Name>, context: ToolHandlerContext) => Promise<unknown>;
};

export const TOOL_SECURITY = {
  openGitHubPage: 'navigation',
  openReleases: 'navigation',
  openIssues: 'navigation',
  searchRepos: 'search',
  searchIssues: 'search',
  highlightElement: 'local-read',
  scrollToElement: 'local-read',
  extractPageInfo: 'local-read',
  openExternalLink: 'external-confirm',
} as const satisfies Record<ToolName, string>;

export class ToolRegistry {
  constructor(
    private readonly handlers: ToolHandlers,
    private readonly allowedNames: ReadonlySet<ToolName> = new Set(
      Object.keys(toolSchemas) as ToolName[],
    ),
  ) {}

  async execute(name: string, args: unknown, context: ToolHandlerContext): Promise<ToolResult> {
    if (!(name in toolSchemas) || !this.allowedNames.has(name as ToolName)) {
      return { name, ok: false, error: '工具不在只读白名单中' };
    }
    const toolName = name as ToolName;
    const parsed = toolSchemas[toolName].safeParse(args);
    if (!parsed.success) {
      return {
        name,
        ok: false,
        error: `工具参数无效：${parsed.error.issues[0]?.message ?? '未知错误'}`,
      };
    }
    if (toolName === 'openExternalLink' && context.confirmedExternal !== true) {
      return {
        name,
        ok: false,
        error: 'REQUIRES_CONFIRMATION：外部链接必须逐次确认',
      };
    }
    const handler = this.handlers[toolName] as
      | ((validatedArgs: unknown, handlerContext: ToolHandlerContext) => Promise<unknown>)
      | undefined;
    if (!handler) {
      return { name, ok: false, error: '工具已列入白名单但当前执行器未注册' };
    }
    const data = await handler(parsed.data, context);
    return { name, ok: true, data };
  }
}

export class SearchToolRegistry extends ToolRegistry {
  constructor(handlers: Pick<ToolHandlers, SearchToolName>) {
    super(handlers, new Set<SearchToolName>(['searchRepos', 'searchIssues']));
  }
}
