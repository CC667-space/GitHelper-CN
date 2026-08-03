import { PROVIDER_IDS } from '../lib/provider-catalog';
import type { ProviderCredential, ProviderId } from '../lib/types';

const CREDENTIAL_PREFIX = 'credential:provider:';

export interface CredentialStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string | string[]): Promise<void>;
}

export interface OptionsCredentialStore {
  write(providerId: ProviderId, apiKey: string): Promise<void>;
  delete(providerId: ProviderId): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface BackgroundCredentialStore {
  read(providerId: ProviderId): Promise<ProviderCredential | undefined>;
  getMask(providerId: ProviderId): Promise<string | undefined>;
  injectAuthorization(providerId: ProviderId, headers?: HeadersInit): Promise<Headers>;
}

function storageKey(providerId: ProviderId): string {
  return `${CREDENTIAL_PREFIX}${providerId}`;
}

function validateApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (normalized.length < 8 || normalized.length > 8_192) {
    throw new Error('API Key 长度无效');
  }
  return normalized;
}

function maskApiKey(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}

export function createOptionsCredentialStore(area: CredentialStorageArea): OptionsCredentialStore {
  return {
    async write(providerId, apiKey) {
      const credential: ProviderCredential = {
        providerId,
        apiKey: validateApiKey(apiKey),
      };
      await area.set({ [storageKey(providerId)]: credential });
    },
    delete(providerId) {
      return area.remove(storageKey(providerId));
    },
    deleteAll() {
      return area.remove(PROVIDER_IDS.map(storageKey));
    },
  };
}

export function createBackgroundCredentialStore(
  area: CredentialStorageArea,
): BackgroundCredentialStore {
  async function read(providerId: ProviderId): Promise<ProviderCredential | undefined> {
    const result = await area.get(storageKey(providerId));
    const candidate = result[storageKey(providerId)] as ProviderCredential | undefined;
    if (!candidate) {
      return undefined;
    }
    if (candidate.providerId !== providerId || typeof candidate.apiKey !== 'string') {
      throw new Error(`Provider ${providerId} 的凭据记录损坏`);
    }
    return candidate;
  }

  return {
    read,
    async getMask(providerId) {
      const credential = await read(providerId);
      return credential ? maskApiKey(credential.apiKey) : undefined;
    },
    async injectAuthorization(providerId, headers) {
      const credential = await read(providerId);
      if (!credential) {
        throw new Error(`Provider ${providerId} 尚未配置 API Key`);
      }
      const injected = new Headers(headers);
      injected.set('Authorization', `Bearer ${credential.apiKey}`);
      return injected;
    },
  };
}

function localArea(): CredentialStorageArea {
  return chrome.storage.local;
}

// Options 唯一允许的默认入口。
export function writeCredential(providerId: ProviderId, apiKey: string): Promise<void> {
  return createOptionsCredentialStore(localArea()).write(providerId, apiKey);
}

export function deleteCredential(providerId: ProviderId): Promise<void> {
  return createOptionsCredentialStore(localArea()).delete(providerId);
}

export function deleteAllCredentials(): Promise<void> {
  return createOptionsCredentialStore(localArea()).deleteAll();
}

// Background 唯一允许的默认入口。
export function readCredential(providerId: ProviderId): Promise<ProviderCredential | undefined> {
  return createBackgroundCredentialStore(localArea()).read(providerId);
}

export function getCredentialMask(providerId: ProviderId): Promise<string | undefined> {
  return createBackgroundCredentialStore(localArea()).getMask(providerId);
}

export function injectProviderAuthorization(
  providerId: ProviderId,
  headers?: HeadersInit,
): Promise<Headers> {
  return createBackgroundCredentialStore(localArea()).injectAuthorization(providerId, headers);
}
