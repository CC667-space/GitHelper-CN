import {
  optionsProviderStateRequestSchema,
  optionsResetLocalStateRequestSchema,
  optionsRunProbesRequestSchema,
} from '../lib/bridge-protocol';
import { MAX_MESSAGE_BYTES } from '../lib/messaging';
import { MessageRouter, registerRuntimeRouter } from './router';
import type { ProviderRuntime } from './provider-runtime';
import { sanitizeUnknown } from './sanitizer';

const PROVIDER_PROBE_TIMEOUT_MS = 10 * 60 * 1000;

export function registerOptionsRouter(runtime: ProviderRuntime): void {
  registerRuntimeRouter(
    new MessageRouter(
      {
        OPTIONS_PROVIDER_STATE: {
          source: 'extension',
          payloadSchema: optionsProviderStateRequestSchema,
          handler: async () =>
            sanitizeUnknown({
              providers: await runtime.views(),
            }).value,
        },
        OPTIONS_RUN_PROVIDER_PROBES: {
          source: 'extension',
          payloadSchema: optionsRunProbesRequestSchema,
          handler: async (payload) => {
            const { providerId } = optionsRunProbesRequestSchema.parse(payload);
            await runtime.runConfiguredProbes(providerId);
            return sanitizeUnknown({
              providers: await runtime.views(),
            }).value;
          },
        },
        OPTIONS_RESET_LOCAL_STATE: {
          source: 'extension',
          payloadSchema: optionsResetLocalStateRequestSchema,
          handler: async () => {
            await runtime.resetLocalState();
            return {};
          },
        },
      },
      chrome.runtime.id,
      {
        maxPayloadBytes: MAX_MESSAGE_BYTES,
        timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
      },
    ),
  );
}
