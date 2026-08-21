import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('GitHub Release runtime hardening', () => {
  it('正式运行时代码不再包含 Phase 0 调试入口', () => {
    const runtimeSources = [
      readProjectFile('src/background/service-worker.ts'),
      readProjectFile('src/content/content-script.ts'),
      readProjectFile('src/options/App.tsx'),
    ].join('\n');

    expect(runtimeSources).not.toMatch(/PHASE0_/);
    expect(runtimeSources).not.toContain('git-helper-phase0');
    expect(runtimeSources).not.toContain('phase0CredentialSentinel');
    expect(runtimeSources).not.toContain('本地技术验证');
    expect(runtimeSources).not.toContain('运行真实能力探针');
  });

  it('正式 package scripts 不再暴露已退役的 Phase 0 浏览器探针', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['probe:phase0']).toBeUndefined();
  });
});
