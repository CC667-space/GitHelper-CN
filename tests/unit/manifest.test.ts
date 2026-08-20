import { describe, expect, it } from 'vitest';

import manifest from '../../manifest.config';

interface ManifestLike {
  minimum_chrome_version?: string;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: Array<{ matches?: string[] }>;
  externally_connectable?: unknown;
  web_accessible_resources?: unknown[];
  content_security_policy?: {
    extension_pages?: string;
  };
}

describe('Phase 0 manifest', () => {
  it('保留既有最小权限，并把新增 Provider 声明为逐家按需 Host', async () => {
    expect(typeof manifest).not.toBe('function');
    const resolved = await (manifest as ManifestLike | Promise<ManifestLike>);
    expect(resolved.minimum_chrome_version).toBe('114');
    expect(resolved.permissions).toEqual(['sidePanel', 'storage', 'activeTab']);
    expect(resolved.permissions).not.toContain('tabs');
    expect(resolved.permissions).not.toContain('scripting');
    expect(resolved.host_permissions).toEqual([
      'https://github.com/*',
      'https://api.github.com/*',
      'https://api.deepseek.com/*',
      'https://uuapi.net/*',
      'https://openrouter.ai/*',
    ]);
    expect(resolved.optional_permissions).toBeUndefined();
    expect(resolved.optional_host_permissions).toEqual([
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://dashscope.aliyuncs.com/*',
      'https://api.siliconflow.cn/*',
      'https://open.bigmodel.cn/*',
      'https://api.moonshot.cn/*',
      'https://api.x.ai/*',
      'https://*/*',
    ]);
    expect(resolved.externally_connectable).toBeUndefined();
    expect(resolved.web_accessible_resources).toBeUndefined();
    expect(resolved.content_scripts).toEqual([
      expect.objectContaining({ matches: ['https://github.com/*'] }),
    ]);
    expect(JSON.stringify(resolved)).not.toContain('<all_urls>');
    expect(resolved.content_security_policy?.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });
});
