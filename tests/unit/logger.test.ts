import { describe, expect, it, vi } from 'vitest';

import { createLogger, redactLogValue, redactString } from '../../src/lib/logger';

describe('logger', () => {
  it('遮蔽字符串中的 Key、GitHub Token 与 Authorization', () => {
    const source =
      'sk-abcdefghijklmnopqrstuvwxyz github_pat_abcdefghijklmnopqrstuvwxyz123456 Bearer secret-token-value-123';
    const redacted = redactString(source);

    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('github_pat_abcdefghijklmnopqrstuvwxyz123456');
    expect(redacted).not.toContain('secret-token-value-123');
  });

  it('按敏感字段名递归遮蔽且处理循环引用', () => {
    const source: Record<string, unknown> = {
      apiKey: 'plain-secret',
      nested: { password: 'password-value', safe: 'ok' },
    };
    source.self = source;

    expect(redactLogValue(source)).toEqual({
      apiKey: '‹REDACTED›',
      nested: { password: '‹REDACTED›', safe: 'ok' },
      self: '‹CIRCULAR›',
    });
  });

  it('生产级别过滤低等级日志并只把脱敏值交给 sink', () => {
    const sink = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = createLogger(sink, 'warn');
    logger.info('sk-abcdefghijklmnopqrstuvwxyz');
    logger.warn({ token: 'plain-secret', safe: 'ok' });

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith({ token: '‹REDACTED›', safe: 'ok' });
  });

  it('扩展模式同样遮蔽云密钥、JWT、URL 凭据与命名 Secret', () => {
    const source = [
      'AKIAIOSFODNN7EXAMPLE',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456',
      'https://alice:super-secret@example.com',
      'client_secret=json-secret-value',
    ].join(' ');
    const redacted = redactString(source);
    for (const secret of [
      'AKIAIOSFODNN7EXAMPLE',
      'signature123456',
      'super-secret',
      'json-secret-value',
    ]) {
      expect(redacted).not.toContain(secret);
    }
  });
});
