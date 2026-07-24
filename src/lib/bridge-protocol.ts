import { z } from 'zod';

export const PANEL_PORT_NAME = 'git-helper-panel-v1';

export const panelMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(8_000),
  })
  .strict();

export const pageInfoRequestSchema = z.object({}).strict();

export const pageInfoSchema = z
  .object({
    url: z.url(),
    title: z.string().max(1_000),
    placeholder: z.boolean(),
    capturedAt: z.iso.datetime(),
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
