import type { ProviderId } from '../../lib/types';
import { injectProviderAuthorization } from '../credential-store';
import { safeFetch } from '../network';
import type { ProviderTransport } from './base';

export function createProviderTransport(): ProviderTransport {
  return {
    async request(providerId: ProviderId, url, init, signal) {
      const headers = await injectProviderAuthorization(providerId, init.headers);
      return safeFetch(
        url,
        {
          ...init,
          headers,
          signal,
        },
        {
          timeoutMs: 60_000,
          maxRequestBytes: 2 * 1024 * 1024,
        },
      );
    },
  };
}
