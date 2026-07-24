import { describe, expect, it } from 'vitest';

import { findUnsafePatterns } from '../../scripts/scan-build-safety.mjs';

describe('build safety scanner', () => {
  it('拒绝 eval/new Function/远程脚本/放宽 CSP', () => {
    expect(findUnsafePatterns('bundle.js', 'eval("x")')).toContain('bundle.js: eval');
    expect(findUnsafePatterns('bundle.js', 'new Function("x")')).toContain(
      'bundle.js: new Function',
    );
    expect(
      findUnsafePatterns('index.html', '<script src="https://evil.example/x.js"></script>'),
    ).toContain('index.html: remote script');
    expect(
      findUnsafePatterns(
        'manifest.json',
        '{"content_security_policy":{"extension_pages":"script-src unsafe-eval"}}',
      ),
    ).toContain('manifest.json: unsafe CSP');
  });

  it('允许本地打包代码与严格 CSP', () => {
    expect(findUnsafePatterns('bundle.js', 'const value = 1;')).toEqual([]);
    expect(
      findUnsafePatterns(
        'manifest.json',
        '{"content_security_policy":{"extension_pages":"script-src \'self\'; object-src \'self\'"}}',
      ),
    ).toEqual([]);
  });
});
