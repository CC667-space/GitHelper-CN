import { z } from 'zod';

export const githubWebUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'github.com';
}, '只允许 https://github.com/* URL');

export const searchTargetSchema = z.enum(['auto', 'repositories', 'issues']);
export const resolvedSearchTargetSchema = z.enum(['repositories', 'issues']);

export const searchConversionSchema = z
  .object({
    naturalLanguage: z.string().min(1).max(500),
    target: resolvedSearchTargetSchema,
    query: z.string().min(1).max(256),
    explanation: z.string().min(1).max(1_000),
  })
  .strict();

export const githubSearchItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('repository'),
      id: z.number().int().nonnegative(),
      title: z.string().min(1).max(500),
      url: githubWebUrlSchema,
      description: z.string().max(2_000).optional(),
      language: z.string().max(100).optional(),
      stars: z.number().int().nonnegative(),
      updatedAt: z.iso.datetime(),
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('issue'),
      id: z.number().int().nonnegative(),
      title: z.string().min(1).max(500),
      url: githubWebUrlSchema,
      repository: z.string().min(1).max(500),
      number: z.number().int().positive(),
      state: z.enum(['open', 'closed']),
      labels: z.array(z.string().max(100)).max(20),
      comments: z.number().int().nonnegative(),
      updatedAt: z.iso.datetime(),
    })
    .strict(),
]);

export const githubSearchResultSchema = z
  .object({
    status: z.enum(['ok', 'fallback']),
    conversion: searchConversionSchema,
    totalCount: z.number().int().nonnegative(),
    items: z.array(githubSearchItemSchema).max(10),
    localResults: z.array(z.string().max(1_000)).max(10).optional(),
    fallbackUrl: githubWebUrlSchema.optional(),
    notice: z.string().max(1_000).optional(),
  })
  .strict();

export type SearchTarget = z.infer<typeof searchTargetSchema>;
export type ResolvedSearchTarget = z.infer<typeof resolvedSearchTargetSchema>;
export type SearchConversion = z.infer<typeof searchConversionSchema>;
export type GitHubSearchItem = z.infer<typeof githubSearchItemSchema>;
export type GitHubSearchResult = z.infer<typeof githubSearchResultSchema>;
