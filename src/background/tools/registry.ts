import { z } from 'zod';

import type { ToolResult } from '../../lib/types';

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

export const searchToolSchemas = {
  searchRepos: searchReposArgsSchema,
  searchIssues: searchIssuesArgsSchema,
} as const;

export type SearchToolName = keyof typeof searchToolSchemas;

export interface SearchToolHandlerContext {
  signal: AbortSignal;
}

export type SearchToolHandlers = {
  [Name in SearchToolName]: (
    args: z.infer<(typeof searchToolSchemas)[Name]>,
    context: SearchToolHandlerContext,
  ) => Promise<unknown>;
};

export class SearchToolRegistry {
  constructor(private readonly handlers: SearchToolHandlers) {}

  async execute(
    name: string,
    args: unknown,
    context: SearchToolHandlerContext,
  ): Promise<ToolResult> {
    if (!(name in searchToolSchemas)) {
      return { name, ok: false, error: '工具不在只读搜索白名单中' };
    }
    const toolName = name as SearchToolName;
    const parsed = searchToolSchemas[toolName].safeParse(args);
    if (!parsed.success) {
      return {
        name,
        ok: false,
        error: `搜索工具参数无效：${parsed.error.issues[0]?.message ?? '未知错误'}`,
      };
    }
    const data = await this.handlers[toolName](parsed.data, context);
    return { name, ok: true, data };
  }
}
