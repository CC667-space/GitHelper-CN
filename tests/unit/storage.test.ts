import { describe, expect, it } from 'vitest';

import {
  StorageCapacityError,
  StorageRepository,
  migrateVersioned,
  type StorageAreaLike,
} from '../../src/lib/storage';

class MemoryStorageArea implements StorageAreaLike {
  readonly values: Record<string, unknown> = {};
  bytes = 0;

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null || keys === undefined) {
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
    for (const key of Object.keys(this.values)) {
      delete this.values[key];
    }
  }

  async getBytesInUse(): Promise<number> {
    return this.bytes || new TextEncoder().encode(JSON.stringify(this.values)).byteLength;
  }
}

describe('StorageRepository', () => {
  it('读写带 schemaVersion 的记录并报告容量', async () => {
    const area = new MemoryStorageArea();
    const storage = new StorageRepository(area, { soft: 1_000, hard: 2_000 });
    const value = { schemaVersion: 1, name: 'demo' };

    const result = await storage.set('record', value);

    await expect(storage.get('record')).resolves.toEqual(value);
    expect(result.softLimitExceeded).toBe(false);
    expect(result.estimatedBytesAfter).toBeGreaterThan(0);
  });

  it('按版本逐步迁移并拒绝缺失迁移', () => {
    const migrated = migrateVersioned({ schemaVersion: 1, value: 'a' }, 3, {
      1: (value) => ({ ...value, schemaVersion: 2, value: `${value.value}b` }),
      2: (value) => ({ ...value, schemaVersion: 3, value: `${value.value}c` }),
    });
    expect(migrated).toEqual({ schemaVersion: 3, value: 'abc' });
    expect(() => migrateVersioned({ schemaVersion: 1 }, 2, {})).toThrow('缺少');
  });

  it('写入预计超过硬上限时不落库', async () => {
    const area = new MemoryStorageArea();
    area.bytes = 90;
    const storage = new StorageRepository(area, { soft: 95, hard: 100 });

    await expect(
      storage.set('record', { schemaVersion: 1, value: 'x'.repeat(50) }),
    ).rejects.toBeInstanceOf(StorageCapacityError);
    expect(area.values.record).toBeUndefined();
  });
});
