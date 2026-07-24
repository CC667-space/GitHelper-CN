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

  it('遮蔽云密钥、Authorization、JWT、URL 凭据与 JSON 命名字段', () => {
    const values = [
      'AKIAIOSFODNN7EXAMPLE',
      'AIzaSyA12345678901234567890123456789012',
      'Authorization: Bearer bearer-secret-value-123',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456',
      'https://alice:super-secret@example.com/path',
      '"client_secret":"json-secret-value"',
      'password=plain-password-value',
    ];
    const result = sanitizeText(values.join('\n'));
    for (const value of [
      'AKIAIOSFODNN7EXAMPLE',
      'AIzaSyA12345678901234567890123456789012',
      'bearer-secret-value-123',
      'signature123456',
      'super-secret',
      'json-secret-value',
      'plain-password-value',
    ]) {
      expect(result.value).not.toContain(value);
    }
    expect(result.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(['CLOUD_KEY', 'AUTH_HEADER', 'JWT', 'URL_CREDENTIAL', 'NAMED_SECRET']),
    );
  });

  it('普通限定词不误报，并安全处理循环对象', () => {
    expect(sanitizeText('tokenization passwordless monkey api-keyword').redactedCount).toBe(0);
    const cyclic: Record<string, unknown> = { safe: 'ok' };
    cyclic.self = cyclic;
    expect(sanitizeUnknown(cyclic).value).toEqual({
      safe: 'ok',
      self: '‹CIRCULAR›',
    });
  });

  it('结构化对象的敏感键名会触发整值遮蔽', () => {
    const result = sanitizeUnknown({
      apiKey: 'opaque-value-without-key-prefix',
      nested: {
        client_secret: 'another-opaque-value',
        title: '公开标题',
      },
    });

    expect(result.value).toEqual({
      apiKey: '‹REDACTED:NAMED_SECRET›',
      nested: {
        client_secret: '‹REDACTED:NAMED_SECRET›',
        title: '公开标题',
      },
    });
    expect(result.findings).toContainEqual({ kind: 'NAMED_SECRET', count: 2 });
  });
});
