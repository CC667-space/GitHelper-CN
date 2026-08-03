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
    const actions = createProviderCredentialActions(credentials, hostAccess);

    await actions.save('openai', 'sk-test-openai-key');
    await actions.delete('openai');

    expect(calls).toEqual(['request', 'write', 'delete', 'remove']);
  });
});
