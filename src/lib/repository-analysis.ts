import { z } from 'zod';

import { githubWebUrlSchema } from './github-search';

export const repositoryInsightsSchema = z
  .object({
    overview: z
      .object({
        summary: z.string().min(1).max(180),
        highlights: z.array(z.string().min(1).max(60)).min(1).max(3),
      })
      .strict(),
    purpose: z.string().min(1).max(1_000),
    readmeSummary: z.string().min(1).max(1_000).optional(),
    features: z.array(z.string().min(1).max(300)).max(6).optional(),
    configuration: z.array(z.string().min(1).max(300)).max(6).optional(),
    implementationNotes: z.array(z.string().min(1).max(300)).max(6).optional(),
    platforms: z.array(z.string().min(1).max(100)).max(8),
    installation: z.array(z.string().min(1).max(500)).max(8),
    difficulty: z
      .object({
        level: z.enum(['入门', '中等', '进阶', '未知']),
        reason: z.string().min(1).max(500),
      })
      .strict(),
    risks: z.array(z.string().min(1).max(500)).max(8),
    nextSteps: z.array(z.string().min(1).max(500)).max(8),
  })
  .strict();

export const repositoryInsightPatchSchema = repositoryInsightsSchema
  .partial()
  .strip()
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少需要一个仓库分析字段',
  });

export const repositoryAnalysisCardSchema = z
  .object({
    repository: z.string().min(1).max(500),
    url: githubWebUrlSchema,
    overview: z
      .object({
        summary: z.string().min(1).max(180),
        highlights: z.array(z.string().min(1).max(60)).min(1).max(3),
        source: z.enum(['provider', 'local']),
      })
      .strict(),
    purpose: z.string().min(1).max(1_000),
    details: z
      .object({
        readmeSummary: z.string().min(1).max(1_000).optional(),
        features: z.array(z.string().min(1).max(300)).max(6),
        configuration: z.array(z.string().min(1).max(300)).max(6),
        implementation: z.array(z.string().min(1).max(300)).max(6),
      })
      .strict(),
    sourceSummary: z
      .object({
        readmeSummary: z.string().min(1).max(1_000),
        features: z.array(z.string().min(1).max(300)).max(6),
        configuration: z.array(z.string().min(1).max(300)).max(6),
        implementation: z.array(z.string().min(1).max(300)).max(6),
        source: z.enum(['readme', 'description', 'limited']),
      })
      .strict(),
    languages: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            percent: z.number().min(0).max(100),
          })
          .strict(),
      )
      .max(5),
    structure: z
      .object({
        directories: z.array(z.string().min(1).max(300)).max(12),
        keyFiles: z
          .array(
            z
              .object({
                path: z.string().min(1).max(500),
                role: z.string().min(1).max(100),
                findings: z.array(z.string().min(1).max(300)).max(4),
              })
              .strict(),
          )
          .max(3),
        truncated: z.boolean(),
      })
      .strict(),
    platforms: z.array(z.string().min(1).max(100)).max(8),
    installation: z
      .object({
        steps: z.array(z.string().min(1).max(500)).max(8),
        source: z.enum(['readme', 'provider', 'unknown']),
      })
      .strict(),
    release: z
      .object({
        name: z.string().min(1).max(300),
        tag: z.string().min(1).max(200),
        publishedAt: z.iso.datetime().optional(),
        url: githubWebUrlSchema.optional(),
      })
      .strict()
      .nullable(),
    activity: z
      .object({
        pushedAt: z.iso.datetime().optional(),
        updatedAt: z.iso.datetime().optional(),
      })
      .strict(),
    popularity: z
      .object({
        stars: z.number().int().nonnegative().optional(),
        forks: z.number().int().nonnegative().optional(),
        watchers: z.number().int().nonnegative().optional(),
      })
      .strict(),
    archived: z.boolean().nullable(),
    license: z
      .object({
        name: z.string().min(1).max(300),
        spdxId: z.string().min(1).max(100).optional(),
        url: githubWebUrlSchema.optional(),
      })
      .strict()
      .nullable(),
    issuesAndPullRequests: z
      .object({
        openIssues: z.number().int().nonnegative().optional(),
        openPullRequests: z.number().int().nonnegative().optional(),
        combinedOpenCount: z.number().int().nonnegative().optional(),
      })
      .strict(),
    difficulty: z
      .object({
        level: z.enum(['入门', '中等', '进阶', '未知']),
        reason: z.string().min(1).max(500),
      })
      .strict(),
    risks: z.array(z.string().min(1).max(500)).max(8),
    nextSteps: z.array(z.string().min(1).max(500)).max(8),
    generatedAt: z.iso.datetime(),
    sources: z
      .object({
        dom: z.boolean(),
        githubApi: z.boolean(),
        provider: z.boolean(),
      })
      .strict(),
    degradedNotice: z.string().max(1_000).optional(),
  })
  .strict();

export type RepositoryInsights = z.infer<typeof repositoryInsightsSchema>;
export type RepositoryInsightPatch = z.infer<typeof repositoryInsightPatchSchema>;
export type RepositoryAnalysisCard = z.infer<typeof repositoryAnalysisCardSchema>;
