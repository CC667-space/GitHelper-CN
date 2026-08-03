import { describe, expect, it, vi } from 'vitest';

import {
  createProviderHostAccess,
  ProviderHostPermissionDeniedError,
  type ProviderPermissionAdapter,
} from '../../src/background/provider-host-access';

function permissionAdapter(requested: boolean, contained = false): ProviderPermissionAdapter {
  return {
    contains: vi.fn(async () => contained),
    request: vi.fn(async () => requested),
    remove: vi.fn(async () => true),
  };
}

describe('Provider host access', () => {
  it('既有 Provider 无需提示，新增 Provider 逐家只申请自身精确 Host', async () => {
    const adapter = permissionAdapter(true);
    const access = createProviderHostAccess(adapter);

    await expect(access.request('deepseek')).resolves.toBe('required');
    for (const providerId of ['openai', 'anthropic', 'gemini', 'qwen', 'siliconflow'] as const) {
      await expect(access.request(providerId)).resolves.toBe('granted');
    }

    expect(adapter.request).toHaveBeenNthCalledWith(1, { origins: ['https://api.openai.com/*'] });
    expect(adapter.request).toHaveBeenNthCalledWith(2, {
      origins: ['https://api.anthropic.com/*'],
    });
    expect(adapter.request).toHaveBeenNthCalledWith(3, {
      origins: ['https://generativelanguage.googleapis.com/*'],
    });
    expect(adapter.request).toHaveBeenNthCalledWith(4, {
      origins: ['https://dashscope.aliyuncs.com/*'],
    });
    expect(adapter.request).toHaveBeenNthCalledWith(5, {
      origins: ['https://api.siliconflow.cn/*'],
    });
  });

  it('用户拒绝 OpenAI Host 权限时返回明确错误', async () => {
    const access = createProviderHostAccess(permissionAdapter(false));

    await expect(access.request('openai')).rejects.toBeInstanceOf(
      ProviderHostPermissionDeniedError,
    );
  });
});
