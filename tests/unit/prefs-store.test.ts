import { describe, expect, it } from 'vitest';

import {
  PREFERENCES_STORAGE_KEY,
  PreferencesStore,
  defaultUserPreferences,
} from '../../src/background/prefs-store';
import type { StorageAreaLike } from '../../src/lib/storage';
import type { UserPreferences } from '../../src/lib/types';

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

describe('PreferencesStore', () => {
  it('提供安全默认值并持久化合法偏好', async () => {
    const area = new MemoryArea();
    const store = new PreferencesStore(area);
    const defaults = await store.read();
    expect(defaults.panelFontSize).toBe(16);
    expect(defaults.operationPolicy).toEqual({
      navigation: 'auto',
      search: 'auto',
      downloads: 'confirm',
      accountChanges: 'deny',
    });

    const saved = await store.write({
      ...defaults,
      technicalLevel: 'advanced',
      operatingSystem: 'Windows 11',
      explanationPreference: '先结论后依据',
      visionEnabled: false,
    });

    expect(await store.read()).toEqual(saved);
    expect(area.values[PREFERENCES_STORAGE_KEY]).toEqual(saved);
  });

  it('运行时拒绝 downloads:auto 与可配置 accountChanges', async () => {
    const store = new PreferencesStore(new MemoryArea());
    await expect(
      store.write({
        ...defaultUserPreferences(),
        operationPolicy: {
          navigation: 'auto',
          search: 'auto',
          downloads: 'auto',
          accountChanges: 'allow',
        },
      } as unknown as UserPreferences),
    ).rejects.toThrow();
  });

  it('读取旧版偏好时补入标准字号且保留已有设置', async () => {
    const area = new MemoryArea();
    const legacyPreferences: Partial<UserPreferences> = {
      ...defaultUserPreferences(),
      technicalLevel: 'advanced' as const,
      explanationPreference: '先给结论',
    };
    delete legacyPreferences.panelFontSize;
    area.values[PREFERENCES_STORAGE_KEY] = legacyPreferences;

    await expect(new PreferencesStore(area).read()).resolves.toMatchObject({
      panelFontSize: 16,
      technicalLevel: 'advanced',
      explanationPreference: '先给结论',
    });
  });
});
