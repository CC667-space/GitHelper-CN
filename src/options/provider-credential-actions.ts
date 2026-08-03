import type { ProviderId } from '../lib/types';

export interface ProviderCredentialWriter {
  write(providerId: ProviderId, apiKey: string): Promise<void>;
  delete(providerId: ProviderId): Promise<void>;
}

export interface ProviderHostAccessWriter {
  request(providerId: ProviderId): Promise<unknown>;
  remove(providerId: ProviderId): Promise<boolean>;
}

export function createProviderCredentialActions(
  credentials: ProviderCredentialWriter,
  hostAccess: ProviderHostAccessWriter,
) {
  return {
    async save(providerId: ProviderId, apiKey: string): Promise<void> {
      await hostAccess.request(providerId);
      await credentials.write(providerId, apiKey);
    },

    async delete(providerId: ProviderId): Promise<void> {
      await credentials.delete(providerId);
      await hostAccess.remove(providerId);
    },
  };
}
