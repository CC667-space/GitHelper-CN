import { z } from 'zod';

export const PANEL_PORT_NAME = 'git-helper-panel-v1';

export const panelMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(8_000),
  })
  .strict();

export const pageInfoRequestSchema = z.object({}).strict();

export const pageContextSchema = z
  .object({
    url: z.url(),
    pageType: z.enum(['repo', 'issue', 'pr', 'releases', 'blob', 'search', 'code', 'other']),
    repository: z.string().max(500).optional(),
    isPrivate: z.boolean(),
    issueOrPrNumber: z.number().int().positive().optional(),
    extracted: z.record(z.string(), z.unknown()),
    pageSummary: z.string().max(12_000).optional(),
    capturedAt: z.iso.datetime(),
  })
  .strict();

export const pageInfoSchema = z
  .object({
    url: z.url(),
    title: z.string().max(1_000),
    placeholder: z.boolean(),
    capturedAt: z.iso.datetime(),
    pageContext: pageContextSchema.optional(),
  })
  .strict();

export const streamEventSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    kind: z.enum(['start', 'context', 'delta', 'done', 'error']),
    text: z.string().max(16_000).optional(),
  })
  .strict();

export type PanelMessagePayload = z.infer<typeof panelMessageSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
