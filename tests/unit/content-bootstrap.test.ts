import { describe, expect, it, vi } from 'vitest';

import { initializeOnce } from '../../src/content/bootstrap';

describe('content script bootstrap', () => {
  it('相同 isolated world 只初始化一次', () => {
    const registry: Record<string, unknown> = {};
    const initialize = vi.fn();
    expect(initializeOnce(registry, 'content-v1', initialize)).toBe(true);
    expect(initializeOnce(registry, 'content-v1', initialize)).toBe(false);
    expect(initialize).toHaveBeenCalledOnce();
  });

  it('初始化失败时释放标记以允许下一次重试', () => {
    const registry: Record<string, unknown> = {};
    expect(() =>
      initializeOnce(registry, 'content-v1', () => {
        throw new Error('failed');
      }),
    ).toThrow('failed');
    expect(registry['content-v1']).toBeUndefined();
  });
});
