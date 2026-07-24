import {
  optionsProviderStateRequestSchema,
  optionsRunProbesRequestSchema,
} from '../lib/bridge-protocol';
import { MessageRouter, registerRuntimeRouter } from './router';
import type { ProviderRuntime } from './provider-runtime';
import { sanitizeUnknown } from './sanitizer';

export function registerOptionsRouter(runtime: ProviderRuntime): void {
  registerRuntimeRouter(
    new MessageRouter(
      {
        OPTIONS_PROVIDER_STATE: {
          source: 'extension',
          payloadSchema: optionsProviderStateRequestSchema,
          handler: async () => ({ providers: await runtime.views() }),
        },
        OPTIONS_RUN_PROVIDER_PROBES: {
          source: 'extension',
          payloadSchema: optionsRunProbesRequestSchema,
          handler: async () =>
            sanitizeUnknown({
              reports: await runtime.runAllConfiguredProbes(),
              providers: await runtime.views(),
            }).value,
        },
      },
      chrome.runtime.id,
    ),
  );
}
