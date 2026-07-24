import {
  optionsProviderStateRequestSchema,
  optionsRunProbesRequestSchema,
  providerStateSchema,
  type ProviderRuntimeView,
} from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../lib/messaging';
import { providerSettingsStore, type ProviderSetting } from '../lib/provider-settings';
import type { ProviderId } from '../lib/types';
import { deleteCredential, writeCredential } from '../background/credential-store';

export interface OptionsServices {
  loadProviders(): Promise<ProviderRuntimeView[]>;
  saveKey(providerId: ProviderId, apiKey: string): Promise<void>;
  deleteKey(providerId: ProviderId): Promise<void>;
  saveModels(providerId: ProviderId, setting: ProviderSetting): Promise<void>;
  runProbes(providerId?: ProviderId): Promise<unknown>;
}

async function runtimeRequest(type: string, payload: unknown): Promise<unknown> {
  const request = createEnvelope(type, payload);
  const raw = (await chrome.runtime.sendMessage(request)) as {
    ok?: boolean;
    response?: unknown;
    error?: { message?: string };
  };
  if (!raw.ok) {
    throw new Error(raw.error?.message ?? `${type} 失败`);
  }
  return raw.response;
}

async function loadProviders(): Promise<ProviderRuntimeView[]> {
  const response = await runtimeRequest(
    'OPTIONS_PROVIDER_STATE',
    optionsProviderStateRequestSchema.parse({}),
  );
  return parseEnvelope(response, providerStateSchema, {
    expectedType: 'OPTIONS_PROVIDER_STATE:response',
  }).payload.providers;
}

export const defaultOptionsServices: OptionsServices = {
  loadProviders,
  saveKey: writeCredential,
  deleteKey: deleteCredential,
  saveModels: (providerId, setting) => providerSettingsStore().writeProvider(providerId, setting),
  runProbes: async (providerId) =>
    await runtimeRequest(
      'OPTIONS_RUN_PROVIDER_PROBES',
      optionsRunProbesRequestSchema.parse({ providerId }),
    ),
};
