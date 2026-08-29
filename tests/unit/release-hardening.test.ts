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

  it('发布包使用固定时间戳并包含项目及生产依赖许可证', () => {
    const packageScript = readProjectFile('scripts/package-extension.ps1');
    const thirdPartyNotices = readProjectFile('THIRD_PARTY_NOTICES.txt');

    expect(packageScript).not.toContain('Compress-Archive');
    expect(packageScript).toContain('1980, 1, 1');
    expect(packageScript).toContain("'LICENSE', 'THIRD_PARTY_NOTICES.txt'");
    expect(thirdPartyNotices).toContain('react@18.3.1');
    expect(thirdPartyNotices).toContain('zod@4.4.3');
    expect(thirdPartyNotices).toContain('License texts');
  });

  it('隔离 Chrome 即使启动失败也会进入临时 profile 清理路径', () => {
    const e2eScript = readProjectFile('scripts/run-phase11-e2e.mjs');

    expect(e2eScript).toMatch(
      /let context;\s*const pageErrors = \[\];\s*try \{\s*context = await chromium\.launchPersistentContext[\s\S]*\} finally \{\s*await context\?\.close\(\);[\s\S]*await rm\(profilePath, \{ recursive: true, force: true \}\);/,
    );
  });
});
