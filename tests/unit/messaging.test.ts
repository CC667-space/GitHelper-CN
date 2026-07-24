import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import {
  MessagingError,
  createEnvelope,
  parseEnvelope,
  withTimeout,
} from '../../src/lib/messaging';

describe('messaging', () => {
  it('创建并校验带版本、请求 ID 和固定类型的信封', () => {
    const envelope = createEnvelope(
      'PAGE_CONTEXT_REQUEST',
      { tabId: 42 },
      { id: 'request-1', now: new Date('2026-07-24T00:00:00.000Z') },
    );

    expect(
      parseEnvelope(envelope, z.object({ tabId: z.number() }), {
        expectedType: 'PAGE_CONTEXT_REQUEST',
      }),
    ).toEqual(envelope);
  });

  it('拒绝错误版本、错误类型和超大载荷', () => {
    const envelope = createEnvelope('EXPECTED', { value: 'ok' });
    expect(() =>
      parseEnvelope({ ...envelope, v: 2 }, z.object({ value: z.string() })),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }));
    expect(() =>
      parseEnvelope(envelope, z.object({ value: z.string() }), {
        expectedType: 'OTHER',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ENVELOPE' }));
    expect(() => createEnvelope('BIG', { value: 'x'.repeat(100) }, { maxBytes: 40 })).toThrowError(
      expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }),
    );
  });

  it('超时后返回类型化错误', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 50);
    const rejection = expect(pending).rejects.toBeInstanceOf(MessagingError);
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    vi.useRealTimers();
  });
});
