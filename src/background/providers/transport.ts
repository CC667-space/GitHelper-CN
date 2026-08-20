import type { ProviderId } from '../../lib/types';
import { injectProviderAuthorization } from '../credential-store';
import { safeFetch } from '../network';
import { providerHostAccess } from '../provider-host-access';
import type { ProviderTransport } from './base';

export interface ProviderTransportDependencies {
  hostAccess: Pick<ReturnType<typeof providerHostAccess>, 'assertGranted'>;
  injectAuthorization: typeof injectProviderAuthorization;
  fetch: typeof safeFetch;
}

export function createProviderTransport(
  dependencies?: ProviderTransportDependencies,
): ProviderTransport {
  const resolved =
    dependencies ??
    ({
      hostAccess: providerHostAccess(),
      injectAuthorization: injectProviderAuthorization,
      fetch: safeFetch,
    } satisfies ProviderTransportDependencies);
  return {
    async request(providerId: ProviderId, url, init, signal) {
      await resolved.hostAccess.assertGranted(providerId, url);
      const headers = await resolved.injectAuthorization(providerId, init.headers);
      const customOrigin = providerId === 'custom' ? new URL(url).origin : undefined;
      return resolved.fetch(
        url,
        {
          ...init,
          credentials: 'omit',
          headers,
          ...(providerId === 'custom' ? { redirect: 'error' as const } : {}),
          signal,
        },
        {
          timeoutMs: 60_000,
          maxRequestBytes: 2 * 1024 * 1024,
          ...(customOrigin ? { additionalAllowedOrigins: [customOrigin] } : {}),
        },
      );
    },
  };
}
