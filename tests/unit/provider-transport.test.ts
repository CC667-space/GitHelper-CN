import { describe, expect, it, vi } from 'vitest';

import { createProviderTransport } from '../../src/background/providers/transport';

describe('Provider transport', () => {
  it('可选 Host 权限失效时在读取 Key 和 fetch 前停止请求', async () => {
    const permissionError = new Error('host permission missing');
    const injectAuthorization = vi.fn();
    const fetch = vi.fn();
    const transport = createProviderTransport({
      hostAccess: {
        assertGranted: vi.fn(async () => {
          throw permissionError;
        }),
      },
      injectAuthorization,
      fetch,
    });

    await expect(
      transport.request(
        'openai',
        'https://api.openai.com/v1/chat/completions',
        { method: 'POST', body: '{}' },
        new AbortController().signal,
      ),
    ).rejects.toBe(permissionError);
    expect(injectAuthorization).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
