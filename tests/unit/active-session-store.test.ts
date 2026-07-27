import { describe, expect, it } from 'vitest';

import {
  ACTIVE_PANEL_SESSION_KEY,
  ActivePanelSessionStore,
} from '../../src/background/active-session-store';
import type { StorageAreaLike } from '../../src/lib/storage';

class MemoryArea implements StorageAreaLike {
  values: Record<string, unknown> = {};

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === undefined || keys === null) {
      return { ...this.values };
    }
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in this.values).map((key) => [key, this.values[key]]),
    );
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.values[key];
    }
  }

  async clear(): Promise<void> {
    this.values = {};
  }

  async getBytesInUse(): Promise<number> {
    return new TextEncoder().encode(JSON.stringify(this.values)).byteLength;
  }
}

describe('ActivePanelSessionStore', () => {
  it('在浏览器会话存储中保存、恢复并清除当前 Session 指针', async () => {
    const area = new MemoryArea();
    const store = new ActivePanelSessionStore(area);

    await store.write('session-active');
    expect(await store.read()).toBe('session-active');
    expect(area.values[ACTIVE_PANEL_SESSION_KEY]).toEqual({
      schemaVersion: 1,
      sessionId: 'session-active',
    });

    await store.clear();
    expect(await store.read()).toBeUndefined();
  });
});
