import { describe, expect, it } from 'vitest';

import manifest from '../../manifest.config';

interface ManifestLike {
  minimum_chrome_version?: string;
  permissions?: string[];
  host_permissions?: string[];
}

describe('Phase 0 manifest', () => {
  it('声明 Chrome 114 与冻结的最小权限和五个 Host', async () => {
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
  });
});
