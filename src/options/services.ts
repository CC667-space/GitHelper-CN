import {
  optionsProviderStateRequestSchema,
  optionsResetLocalStateRequestSchema,
  optionsRunProbesRequestSchema,
  providerStateSchema,
  type ProviderRuntimeView,
} from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../lib/messaging';
import { providerSettingsStore, type ProviderSetting } from '../lib/provider-settings';
import {
  STORAGE_HARD_LIMIT_BYTES,
  STORAGE_SOFT_LIMIT_BYTES,
  StorageRepository,
} from '../lib/storage';
import type { ProviderId, UserPreferences } from '../lib/types';
import { deleteCredential, writeCredential } from '../background/credential-store';
import { providerHostAccess } from '../background/provider-host-access';
import { preferencesStore } from '../background/prefs-store';
import { clearAllLocalData, clearSessionsAndPreferences } from './local-data';
import { createProviderCredentialActions } from './provider-credential-actions';

export interface StorageUsage {
  bytes: number;
  softLimitBytes: number;
  hardLimitBytes: number;
}

export interface OptionsServices {
  loadProviders(): Promise<ProviderRuntimeView[]>;
  saveKey(providerId: ProviderId, apiKey: string): Promise<void>;
  deleteKey(providerId: ProviderId): Promise<void>;
  saveModels(providerId: ProviderId, setting: ProviderSetting): Promise<void>;
  importProviderSettings(source: string): Promise<void>;
  exportProviderSettings(): Promise<string>;
  runProbes(providerId?: ProviderId): Promise<unknown>;
  loadPreferences(): Promise<UserPreferences>;
  savePreferences(preferences: UserPreferences): Promise<UserPreferences>;
  getStorageUsage(): Promise<StorageUsage>;
  clearSessionsAndPreferences(): Promise<void>;
  clearAllLocalData(): Promise<void>;
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
  saveKey: (providerId, apiKey) =>
    createProviderCredentialActions(
      { write: writeCredential, delete: deleteCredential },
      providerHostAccess(),
    ).save(providerId, apiKey),
  deleteKey: (providerId) =>
    createProviderCredentialActions(
      { write: writeCredential, delete: deleteCredential },
      providerHostAccess(),
    ).delete(providerId),
  saveModels: (providerId, setting) => providerSettingsStore().writeProvider(providerId, setting),
  importProviderSettings: async (source) => {
    await providerSettingsStore().importJson(source);
  },
  exportProviderSettings: () => providerSettingsStore().exportJson(),
  runProbes: async (providerId) =>
    await runtimeRequest(
      'OPTIONS_RUN_PROVIDER_PROBES',
      optionsRunProbesRequestSchema.parse({ providerId }),
    ),
  loadPreferences: () => preferencesStore().read(),
  savePreferences: (preferences) => preferencesStore().write(preferences),
  getStorageUsage: async () => ({
    bytes: await new StorageRepository().getBytesInUse(null),
    softLimitBytes: STORAGE_SOFT_LIMIT_BYTES,
    hardLimitBytes: STORAGE_HARD_LIMIT_BYTES,
  }),
  clearSessionsAndPreferences,
  clearAllLocalData: async () => {
    await clearAllLocalData();
    await runtimeRequest(
      'OPTIONS_RESET_LOCAL_STATE',
      optionsResetLocalStateRequestSchema.parse({}),
    );
  },
};
