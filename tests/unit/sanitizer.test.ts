import { describe, expect, it } from 'vitest';

import { sanitizeText, sanitizeUnknown } from '../../src/background/sanitizer';

describe('sanitizer', () => {
  it('遮蔽凭据、私钥、env、Cookie、PII 并报告数量', () => {
    const source = [
      'sk-abcdefghijklmnopqrstuvwxyz',
      'github_pat_abcdefghijklmnopqrstuvwxyz123456',
      'API_TOKEN=plain-secret-value',
      'Set-Cookie: session=secret-cookie',
      'mail@example.com',
      '13800138000',
      '-----BEGIN RSA PRIVATE KEY-----',
      'secret',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const result = sanitizeText(source);

    for (const secret of [
      'sk-abcdefghijklmnopqrstuvwxyz',
      'github_pat_abcdefghijklmnopqrstuvwxyz123456',
      'plain-secret-value',
      'secret-cookie',
      'mail@example.com',
      '13800138000',
    ]) {
      expect(result.value).not.toContain(secret);
    }
    expect(result.redactedCount).toBe(7);
  });

  it('保留普通技术文字并递归处理对象', () => {
    expect(sanitizeText('monkey=banana tokenization GitHub').value).toBe(
      'monkey=banana tokenization GitHub',
    );
    const result = sanitizeUnknown({
      safe: 'hello',
      nested: ['sk-abcdefghijklmnopqrstuvwxyz'],
    });
    expect(result.value).toEqual({
      safe: 'hello',
      nested: ['‹REDACTED:API_KEY›'],
    });
  });
});
