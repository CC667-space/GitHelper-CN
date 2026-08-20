import { describe, expect, it, vi } from 'vitest';

import {
  createProviderHostAccess,
  ProviderHostPermissionDeniedError,
  type ProviderPermissionAdapter,
} from '../../src/background/provider-host-access';
import { defaultProviderSettings } from '../../src/lib/provider-settings';

function permissionAdapter(requested: boolean, contained = false): ProviderPermissionAdapter {
  return {
    contains: vi.fn(async () => contained),
    request: vi.fn(async () => requested),
    remove: vi.fn(async () => true),
  };
}

describe('Provider host access', () => {
  const settings = defaultProviderSettings();
  settings.providers.custom = {
    baseUrl: 'https://gateway.example.com/v1',
    textModel: 'account-model',
  };
  const settingsReader = { read: async () => settings };

  it('固定 Provider 逐家申请精确 Host，custom 只申请已保存 URL 的 Host', async () => {
    const adapter = permissionAdapter(true);
    const access = createProviderHostAccess(adapter, settingsReader);

    await expect(access.request('deepseek')).resolves.toBe('required');
    for (const providerId of [
      'openai',
      'anthropic',
      'gemini',
      'qwen',
      'siliconflow',
      'glm',
      'kimi',
      'grok',
      'custom',
    ] as const) {
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
    expect(adapter.request).toHaveBeenNthCalledWith(6, {
      origins: ['https://open.bigmodel.cn/*'],
    });
    expect(adapter.request).toHaveBeenNthCalledWith(7, {
      origins: ['https://api.moonshot.cn/*'],
    });
    expect(adapter.request).toHaveBeenNthCalledWith(8, {
      origins: ['https://api.x.ai/*'],
    });
    expect(adapter.request).toHaveBeenNthCalledWith(9, {
      origins: ['https://gateway.example.com/*'],
    });
  });

  it('用户拒绝 OpenAI Host 权限时返回明确错误', async () => {
    const access = createProviderHostAccess(permissionAdapter(false), settingsReader);

    await expect(access.request('openai')).rejects.toBeInstanceOf(
      ProviderHostPermissionDeniedError,
    );
  });

  it('custom 请求 URL 与已保存 Host 不一致时在读取 Key 前拒绝', async () => {
    const access = createProviderHostAccess(permissionAdapter(true, true), settingsReader);

    await expect(
      access.assertGranted('custom', 'https://other.example.com/v1/chat/completions'),
    ).rejects.toBeInstanceOf(ProviderHostPermissionDeniedError);
    await expect(
      access.assertGranted('custom', 'https://gateway.example.com/v1/chat/completions'),
    ).resolves.toBeUndefined();
  });
});
