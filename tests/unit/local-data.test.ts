import { describe, expect, it } from 'vitest';

import {
  createOptionsCredentialStore,
  type CredentialStorageArea,
} from '../../src/background/credential-store';
import { ACTIVE_PANEL_SESSION_KEY } from '../../src/background/active-session-store';
import { PREFERENCES_STORAGE_KEY } from '../../src/background/prefs-store';
import { SESSION_STORAGE_KEY } from '../../src/background/session-store';
import type { StorageAreaLike } from '../../src/lib/storage';
import { createLocalDataManager } from '../../src/options/local-data';

class MemoryArea implements StorageAreaLike, CredentialStorageArea {
  values: Record<string, unknown> = {};
  removed: Array<string | string[]> = [];

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
    this.removed.push(keys);
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

function seededArea(): MemoryArea {
  const area = new MemoryArea();
  area.values = {
    [SESSION_STORAGE_KEY]: { schemaVersion: 1, sessions: [] },
    [PREFERENCES_STORAGE_KEY]: { schemaVersion: 1, language: 'zh-CN' },
    'credential:provider:deepseek': { providerId: 'deepseek', apiKey: 'secret-deepseek' },
    'credential:provider:uuapi': { providerId: 'uuapi', apiKey: 'secret-uuapi' },
    'provider:settings:v1': { schemaVersion: 1, marker: 'config' },
  };
  return area;
}

describe('D-033 local data clearing', () => {
  it('清除会话/偏好后 Provider Key 与普通配置完好', async () => {
    const area = seededArea();
    const sessionArea = new MemoryArea();
    sessionArea.values[ACTIVE_PANEL_SESSION_KEY] = {
      schemaVersion: 1,
      sessionId: 'active-session',
    };
    await createLocalDataManager(area, sessionArea).clearSessionsAndPreferences();

    expect(area.values[SESSION_STORAGE_KEY]).toBeUndefined();
    expect(area.values[PREFERENCES_STORAGE_KEY]).toBeUndefined();
    expect(sessionArea.values[ACTIVE_PANEL_SESSION_KEY]).toBeUndefined();
    expect(area.values['credential:provider:deepseek']).toBeDefined();
    expect(area.values['credential:provider:uuapi']).toBeDefined();
    expect(area.values['provider:settings:v1']).toBeDefined();
  });

  it('单删一个 Provider Key 后其他 Key、会话、偏好与配置完好', async () => {
    const area = seededArea();
    await createOptionsCredentialStore(area).delete('deepseek');

    expect(area.values['credential:provider:deepseek']).toBeUndefined();
    expect(area.values['credential:provider:uuapi']).toBeDefined();
    expect(area.values[SESSION_STORAGE_KEY]).toBeDefined();
    expect(area.values[PREFERENCES_STORAGE_KEY]).toBeDefined();
    expect(area.values['provider:settings:v1']).toBeDefined();
  });

  it('清除全部时经 credential-store 删除全部 Key，随后不留本地数据', async () => {
    const area = seededArea();
    const sessionArea = new MemoryArea();
    sessionArea.values[ACTIVE_PANEL_SESSION_KEY] = {
      schemaVersion: 1,
      sessionId: 'active-session',
    };
    await createLocalDataManager(area, sessionArea).clearAllLocalData();

    expect(area.values).toEqual({});
    expect(sessionArea.values).toEqual({});
    expect(area.removed).toContainEqual([
      'credential:provider:deepseek',
      'credential:provider:uuapi',
      'credential:provider:openrouter',
    ]);
  });
});
