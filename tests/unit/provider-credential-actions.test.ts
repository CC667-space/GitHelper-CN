import { describe, expect, it, vi } from 'vitest';

import { createProviderCredentialActions } from '../../src/options/provider-credential-actions';

describe('Provider credential actions', () => {
  it('OpenAI 保存前先取得 Host 权限，拒绝时不写入 Key', async () => {
    const write = vi.fn(async () => undefined);
    const credentials = { write, delete: vi.fn(async () => undefined) };
    const denial = new Error('permission denied');
    const hostAccess = {
      request: vi.fn(async () => {
        throw denial;
      }),
      remove: vi.fn(async () => true),
    };
    const actions = createProviderCredentialActions(credentials, hostAccess);

    await expect(actions.save('openai', 'sk-test-openai-key')).rejects.toBe(denial);
    expect(hostAccess.request).toHaveBeenCalledWith('openai');
    expect(write).not.toHaveBeenCalled();
  });

  it('授权后保存 Key，删除 Key 后释放可选 Host 权限', async () => {
    const calls: string[] = [];
    const credentials = {
      write: vi.fn(async () => {
        calls.push('write');
      }),
      delete: vi.fn(async () => {
        calls.push('delete');
      }),
    };
    const hostAccess = {
      request: vi.fn(async () => {
        calls.push('request');
        return 'granted' as const;
      }),
      remove: vi.fn(async () => {
        calls.push('remove');
        return true;
      }),
    };
    const invalidate = vi.fn(async () => {
      calls.push('invalidate');
    });
    const actions = createProviderCredentialActions(credentials, hostAccess, invalidate);

    await actions.save('openai', 'sk-test-openai-key');
    await actions.delete('openai');

    expect(calls).toEqual(['request', 'write', 'invalidate', 'delete', 'invalidate', 'remove']);
    expect(invalidate).toHaveBeenNthCalledWith(1, 'openai');
    expect(invalidate).toHaveBeenNthCalledWith(2, 'openai');
  });

  it('custom 保存 Key 时把已保存 URL 直接交给本次权限请求', async () => {
    const credentials = { write: vi.fn(async () => undefined), delete: vi.fn() };
    const hostAccess = {
      request: vi.fn(async () => 'granted' as const),
      remove: vi.fn(async () => true),
    };
    const actions = createProviderCredentialActions(credentials, hostAccess);

    await actions.save('custom', 'sk-custom-test', 'https://gateway.example.com/v1');

    expect(hostAccess.request).toHaveBeenCalledWith('custom', 'https://gateway.example.com/v1');
    expect(credentials.write).toHaveBeenCalledWith('custom', 'sk-custom-test');
  });
});
