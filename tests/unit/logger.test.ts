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
});
