import { normalizeCustomProviderUrl } from '../lib/custom-provider-config';
import { providerCatalogEntry } from '../lib/provider-catalog';
import { providerSettingsStore, type ProviderSettings } from '../lib/provider-settings';
import type { ProviderId } from '../lib/types';

export interface ProviderPermissionAdapter {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>;
}

export interface ProviderSettingsReader {
  read(): Promise<ProviderSettings>;
}

export type ProviderHostAccessState = 'required' | 'granted' | 'not_granted';

export class ProviderHostPermissionDeniedError extends Error {
  readonly code = 'PROVIDER_HOST_PERMISSION_DENIED';

  constructor(readonly providerId: ProviderId) {
    super(`未授权 ${providerCatalogEntry(providerId).label} API Host，未保存 API Key`);
    this.name = 'ProviderHostPermissionDeniedError';
  }
}

async function customBaseUrl(settings: ProviderSettingsReader): Promise<string> {
  const value = (await settings.read()).providers.custom.baseUrl;
  if (!value) {
    throw new ProviderHostPermissionDeniedError('custom');
  }
  return value;
}

function permissionFor(providerId: ProviderId, baseUrl?: string): chrome.permissions.Permissions {
  if (providerId === 'custom') {
    if (!baseUrl) {
      throw new ProviderHostPermissionDeniedError(providerId);
    }
    return { origins: [normalizeCustomProviderUrl(baseUrl).permissionOrigin] };
  }
  return { origins: [`${providerCatalogEntry(providerId).apiHost}/*`] };
}

export function createProviderHostAccess(
  adapter: ProviderPermissionAdapter,
  settings?: ProviderSettingsReader,
) {
  const settingsReader = (): ProviderSettingsReader => settings ?? providerSettingsStore();
  async function resolvedPermission(providerId: ProviderId, baseUrl?: string) {
    return permissionFor(
      providerId,
      providerId === 'custom' ? (baseUrl ?? (await customBaseUrl(settingsReader()))) : undefined,
    );
  }

  return {
    async status(providerId: ProviderId): Promise<ProviderHostAccessState> {
      const provider = providerCatalogEntry(providerId);
      if (provider.hostPermission === 'required') {
        return 'required';
      }
      try {
        return (await adapter.contains(await resolvedPermission(providerId)))
          ? 'granted'
          : 'not_granted';
      } catch {
        return 'not_granted';
      }
    },

    async request(providerId: ProviderId, baseUrl?: string): Promise<ProviderHostAccessState> {
      const provider = providerCatalogEntry(providerId);
      if (provider.hostPermission === 'required') {
        return 'required';
      }
      const permission = await resolvedPermission(providerId, baseUrl);
      if (await adapter.request(permission)) {
        return 'granted';
      }
      throw new ProviderHostPermissionDeniedError(providerId);
    },

    async assertGranted(providerId: ProviderId, requestUrl?: string): Promise<void> {
      if (providerId === 'custom') {
        const normalized = normalizeCustomProviderUrl(await customBaseUrl(settingsReader()));
        if (!requestUrl || new URL(requestUrl).origin !== normalized.apiHost) {
          throw new ProviderHostPermissionDeniedError(providerId);
        }
      }
      if ((await this.status(providerId)) === 'not_granted') {
        throw new ProviderHostPermissionDeniedError(providerId);
      }
    },

    async remove(providerId: ProviderId, baseUrl?: string): Promise<boolean> {
      const provider = providerCatalogEntry(providerId);
      if (provider.hostPermission === 'required') {
        return false;
      }
      try {
        return await adapter.remove(await resolvedPermission(providerId, baseUrl));
      } catch {
        return false;
      }
    },
  };
}

export function providerHostAccess() {
  return createProviderHostAccess(chrome.permissions);
}
