import { providerCatalogEntry } from '../lib/provider-catalog';
import type { ProviderId } from '../lib/types';

export interface ProviderPermissionAdapter {
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
  request(permissions: chrome.permissions.Permissions): Promise<boolean>;
  remove(permissions: chrome.permissions.Permissions): Promise<boolean>;
}

export type ProviderHostAccessState = 'required' | 'granted' | 'not_granted';

export class ProviderHostPermissionDeniedError extends Error {
  readonly code = 'PROVIDER_HOST_PERMISSION_DENIED';

  constructor(readonly providerId: ProviderId) {
    super(`未授权 ${providerCatalogEntry(providerId).label} API Host，未保存 API Key`);
    this.name = 'ProviderHostPermissionDeniedError';
  }
}

function permissionFor(providerId: ProviderId): chrome.permissions.Permissions {
  return { origins: [`${providerCatalogEntry(providerId).apiHost}/*`] };
}

export function createProviderHostAccess(adapter: ProviderPermissionAdapter) {
  return {
    async status(providerId: ProviderId): Promise<ProviderHostAccessState> {
      const provider = providerCatalogEntry(providerId);
      if (provider.hostPermission === 'required') {
        return 'required';
      }
      return (await adapter.contains(permissionFor(providerId))) ? 'granted' : 'not_granted';
    },

    async request(providerId: ProviderId): Promise<ProviderHostAccessState> {
      const provider = providerCatalogEntry(providerId);
      if (provider.hostPermission === 'required') {
        return 'required';
      }
      const permission = permissionFor(providerId);
      if ((await adapter.contains(permission)) || (await adapter.request(permission))) {
        return 'granted';
      }
      throw new ProviderHostPermissionDeniedError(providerId);
    },

    async assertGranted(providerId: ProviderId): Promise<void> {
      if ((await this.status(providerId)) === 'not_granted') {
        throw new ProviderHostPermissionDeniedError(providerId);
      }
    },

    async remove(providerId: ProviderId): Promise<boolean> {
      const provider = providerCatalogEntry(providerId);
      return provider.hostPermission === 'optional'
        ? await adapter.remove(permissionFor(providerId))
        : false;
    },
  };
}

export function providerHostAccess() {
  return createProviderHostAccess(chrome.permissions);
}
