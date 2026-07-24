import { z } from 'zod';

export const PANEL_PORT_NAME = 'git-helper-panel-v1';

export const panelMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(8_000),
    providerId: z.enum(['deepseek', 'uuapi', 'openrouter']).optional(),
  })
  .strict();

export const panelAbortSchema = z
  .object({
    requestId: z.string().min(1).max(128),
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

export const providerCapabilitiesSchema = z
  .object({
    supportsStreaming: z.boolean(),
    supportsVision: z.boolean(),
    supportsToolCalls: z.boolean(),
    supportsStructuredOutput: z.boolean(),
    supportsUsage: z.boolean(),
    supportsAbort: z.boolean(),
    imageInputFormat: z.enum(['openai_image_url', 'none']),
    toolCallStreamingFormat: z.enum(['openai_delta', 'none']),
    errorResponseFormat: z.enum(['openai', 'custom']),
    probedAt: z.iso.datetime().optional(),
  })
  .strict();

export const providerRuntimeViewSchema = z
  .object({
    id: z.enum(['deepseek', 'uuapi', 'openrouter']),
    label: z.string().min(1).max(100),
    apiHost: z.url(),
    textModel: z.string().max(300),
    visionModel: z.string().max(300).optional(),
    intermediary: z.boolean(),
    keyMask: z.string().max(100).optional(),
    availability: z.enum(['needs_key', 'pending_probe', 'available', 'disabled']),
    disabledReason: z.string().max(2_000).optional(),
    visionFailureReason: z.string().max(2_000).optional(),
    capabilities: providerCapabilitiesSchema,
  })
  .strict();

export const providerStateSchema = z
  .object({
    providers: z.array(providerRuntimeViewSchema).length(3),
  })
  .strict();

export const panelSessionStateSchema = z
  .object({
    sessionId: z.string().min(1).max(128).optional(),
    messages: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            role: z.enum(['user', 'assistant']),
            content: z.string().max(16 * 1024),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(40),
    truncated: z.boolean(),
  })
  .strict();

export const optionsProviderStateRequestSchema = z.object({}).strict();
export const optionsResetLocalStateRequestSchema = z.object({}).strict();
export const optionsRunProbesRequestSchema = z
  .object({
    providerId: z.enum(['deepseek', 'uuapi', 'openrouter']).optional(),
  })
  .strict();

export type PanelMessagePayload = z.infer<typeof panelMessageSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type ProviderRuntimeView = z.infer<typeof providerRuntimeViewSchema>;
export type ProviderState = z.infer<typeof providerStateSchema>;
export type PanelSessionState = z.infer<typeof panelSessionStateSchema>;
