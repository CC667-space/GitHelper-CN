import { describe, expect, it, vi } from 'vitest';

import {
  OutboundPolicyError,
  RequestPayloadError,
  RequestTimeoutError,
  assertAllowedOutboundUrl,
  safeFetch,
} from '../../src/background/network';

describe('network outbound policy', () => {
  it('只允许 GitHub 与目录内 Provider 的精确 HTTPS Origin', () => {
    expect(assertAllowedOutboundUrl('https://api.deepseek.com/v1/chat/completions').origin).toBe(
      'https://api.deepseek.com',
    );
    expect(assertAllowedOutboundUrl('https://api.openai.com/v1/chat/completions').origin).toBe(
      'https://api.openai.com',
    );
    for (const value of [
      'https://evil.example/v1',
      'https://sub.api.deepseek.com/v1',
      'https://api.deepseek.com:8443/v1',
      'http://api.deepseek.com/v1',
      'https://user:pass@api.deepseek.com/v1',
      'file:///etc/passwd',
    ]) {
      expect(() => assertAllowedOutboundUrl(value)).toThrow(OutboundPolicyError);
    }
  });

  it('白名单外请求在 fetch 前被拒，超大负载也不出站', async () => {
    const fetchImpl = vi.fn();
    await expect(safeFetch('https://evil.example', {}, { fetchImpl })).rejects.toBeInstanceOf(
      OutboundPolicyError,
    );
    await expect(
      safeFetch(
        'https://api.deepseek.com/v1/chat/completions',
        { body: 'x'.repeat(100) },
        { fetchImpl, maxRequestBytes: 20 },
      ),
    ).rejects.toBeInstanceOf(RequestPayloadError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('只在调用方提供精确动态 Origin 时允许 custom Host', async () => {
    expect(() => assertAllowedOutboundUrl('https://gateway.example.com/v1')).toThrow(
      OutboundPolicyError,
    );
    expect(
      assertAllowedOutboundUrl('https://gateway.example.com/v1', ['https://gateway.example.com'])
        .origin,
    ).toBe('https://gateway.example.com');
    expect(() =>
      assertAllowedOutboundUrl('https://other.example.com/v1', ['https://gateway.example.com']),
    ).toThrow(OutboundPolicyError);
  });

  it('支持调用方取消与超时', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const request = safeFetch(
      'https://api.github.com/repos/openai/openai-node',
      {},
      { fetchImpl, timeoutMs: 50 },
    );
    const rejection = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    vi.useRealTimers();
  });
});
