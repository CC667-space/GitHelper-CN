import { z } from 'zod';
import { hasSufficientStructuredRegion } from './region';

export const PANEL_PORT_NAME = 'git-helper-panel-v1';

export const selectedElementSchema = z
  .object({
    tag: z.string().min(1).max(100),
    role: z.string().max(100).optional(),
    text: z.string().max(8_000),
    href: z.string().max(4_000).optional(),
    sourceUrl: z.url().optional(),
    attrs: z
      .record(z.string().max(200), z.string().max(1_000))
      .refine((attrs) => Object.keys(attrs).length <= 24, '元素属性最多保留 24 项'),
    nearbyContext: z.string().max(8_000),
    pageType: z.enum(['repo', 'issue', 'pr', 'releases', 'blob', 'search', 'code', 'other']),
  })
  .strict();

const finiteNumber = z.number().finite();
const nonNegativeFinite = finiteNumber.nonnegative();
const positiveFinite = finiteNumber.positive();

export const selectedRegionSchema = z
  .object({
    text: z.string().max(8_000),
    links: z.array(z.string().max(800)).max(12),
    codeBlocks: z.array(z.string().max(1_500)).max(6),
    buttons: z.array(z.string().max(500)).max(12),
    htmlOutline: z.string().max(4_000),
    nearbyContext: z.string().max(4_000),
    needsVision: z.boolean(),
    sourceUrl: z.url().optional(),
    rect: z
      .object({
        x: nonNegativeFinite,
        y: nonNegativeFinite,
        width: positiveFinite,
        height: positiveFinite,
      })
      .strict(),
    viewport: z
      .object({
        cssWidth: positiveFinite,
        cssHeight: positiveFinite,
      })
      .strict(),
    scroll: z
      .object({
        x: nonNegativeFinite,
        y: nonNegativeFinite,
      })
      .strict(),
    devicePixelRatio: positiveFinite.max(10),
    zoomFactor: positiveFinite.max(10).optional(),
  })
  .strict()
  .superRefine((region, context) => {
    const expectedNeedsVision = !hasSufficientStructuredRegion(region);
    if (region.needsVision !== expectedNeedsVision) {
      context.addIssue({
        code: 'custom',
        message: 'needsVision 与结构化内容充分性不一致',
        path: ['needsVision'],
      });
    }
  });

export const panelMessageSchema = z
  .object({
    text: z.string().trim().min(1).max(8_000),
    providerId: z.enum(['deepseek', 'uuapi', 'openrouter']).optional(),
    selectedElement: selectedElementSchema.optional(),
    selectedRegion: selectedRegionSchema.optional(),
  })
  .strict()
  .refine(
    (value) => !(value.selectedElement && value.selectedRegion),
    '单次提问不能同时携带元素选择和区域框选',
  );

export const panelAbortSchema = z
  .object({
    requestId: z.string().min(1).max(128),
  })
  .strict();

export const pageInfoRequestSchema = z.object({}).strict();
export const panelPickStartSchema = z.object({}).strict();
export const panelPickCancelSchema = z.object({}).strict();
export const contentPickStartSchema = z.object({}).strict();
export const contentPickCancelSchema = z.object({}).strict();
export const contentPickCancelResponseSchema = z.object({ cancelled: z.literal(true) }).strict();
export const panelRegionStartSchema = z.object({}).strict();
export const panelRegionCancelSchema = z.object({}).strict();
export const contentRegionStartSchema = z.object({}).strict();
export const contentRegionCancelSchema = z.object({}).strict();
export const contentRegionCancelResponseSchema = z.object({ cancelled: z.literal(true) }).strict();

export const pickOutcomeSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('selected'),
      element: selectedElementSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      reason: z.string().max(500).optional(),
    })
    .strict(),
]);

export const panelPickStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z
    .object({
      status: z.literal('selected'),
      element: selectedElementSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      reason: z.string().max(500).optional(),
    })
    .strict(),
]);

export const regionOutcomeSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('selected'),
      region: selectedRegionSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      reason: z.string().max(500).optional(),
    })
    .strict(),
]);

export const panelRegionStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z
    .object({
      status: z.literal('selected'),
      region: selectedRegionSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      reason: z.string().max(500).optional(),
    })
    .strict(),
]);

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
export type PickOutcome = z.infer<typeof pickOutcomeSchema>;
export type PanelPickState = z.infer<typeof panelPickStateSchema>;
export type SelectedElementPayload = z.infer<typeof selectedElementSchema>;
export type RegionOutcome = z.infer<typeof regionOutcomeSchema>;
export type PanelRegionState = z.infer<typeof panelRegionStateSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type ProviderRuntimeView = z.infer<typeof providerRuntimeViewSchema>;
export type ProviderState = z.infer<typeof providerStateSchema>;
export type PanelSessionState = z.infer<typeof panelSessionStateSchema>;
