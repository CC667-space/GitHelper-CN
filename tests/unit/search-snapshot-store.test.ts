import { describe, expect, it } from 'vitest';

import {
  SEARCH_SNAPSHOT_TTL_MS,
  SearchSnapshotStore,
} from '../../src/background/search-snapshot-store';
import type { StorageAreaLike } from '../../src/lib/storage';

class MemoryArea implements StorageAreaLike {
  values: Record<string, unknown> = {};

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === undefined || keys === null) return { ...this.values };
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in this.values).map((key) => [key, this.values[key]]),
    );
  }
  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }
  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.values[key];
  }
  async clear(): Promise<void> {
    this.values = {};
  }
  async getBytesInUse(): Promise<number> {
    return new TextEncoder().encode(JSON.stringify(this.values)).byteLength;
  }
}

function result(naturalLanguage: string) {
  return {
    status: 'ok' as const,
    conversion: {
      naturalLanguage,
      target: 'repositories' as const,
      query: naturalLanguage,
      explanation: '搜索公开仓库。',
    },
    totalCount: 0,
    items: [],
  };
}

describe('SearchSnapshotStore', () => {
  it('按标签页保存并覆盖最近搜索，且过期后不再恢复', async () => {
    let now = Date.parse('2026-08-21T10:00:00.000Z');
    const store = new SearchSnapshotStore(new MemoryArea(), () => now);

    await store.save({
      tabId: 11,
      requestId: 'search-1',
      naturalLanguage: '第一个搜索',
      target: 'auto',
      result: result('第一个搜索'),
    });
    await store.save({
      tabId: 22,
      requestId: 'search-2',
      naturalLanguage: '另一个标签页',
      target: 'repositories',
      result: result('另一个标签页'),
    });
    await store.save({
      tabId: 11,
      requestId: 'search-3',
      naturalLanguage: '覆盖后的搜索',
      target: 'issues',
      result: result('覆盖后的搜索'),
    });

    await expect(store.read(11)).resolves.toMatchObject({
      requestId: 'search-3',
      naturalLanguage: '覆盖后的搜索',
      target: 'issues',
    });
    await expect(store.read(22)).resolves.toMatchObject({ naturalLanguage: '另一个标签页' });

    now += SEARCH_SNAPSHOT_TTL_MS + 1;
    await expect(store.read(11)).resolves.toBeUndefined();
    await expect(store.read(22)).resolves.toBeUndefined();
  });
});
