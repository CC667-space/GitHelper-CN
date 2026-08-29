import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderRuntime } from '../../src/background/provider-runtime';

const PROBE_KEY = 'provider:probes:v1';
const SETTINGS_KEY = 'provider:settings:v1';
const CREDENTIAL_KEY = 'credential:provider:deepseek';

function successfulSummary() {
  return {
    providerId: 'deepseek' as const,
    text: true,
    streaming: true,
    abort: true,
    vision: false,
    toolCalls: false,
    structuredOutput: true,
    usage: true,
    errorFormat: true,
    rateLimitFormat: true,
    probedAt: '2026-08-29T00:00:00.000Z',
  };
}

function probeStorage(revision: string, textModel = 'deepseek-v4-flash') {
  return {
    schemaVersion: 2,
    results: {
      deepseek: {
        summary: successfulSummary(),
        binding: {
          credentialRevision: revision,
          textModel,
        },
      },
    },
  };
}

function stubStorage() {
  const values: Record<string, unknown> = {
    [CREDENTIAL_KEY]: {
      providerId: 'deepseek',
      apiKey: 'deepseek-test-key',
      revision: 'revision-1',
    },
    [SETTINGS_KEY]: {
      schemaVersion: 2,
      providers: {
        deepseek: { textModel: 'deepseek-v4-flash' },
      },
    },
    [PROBE_KEY]: probeStorage('revision-1'),
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in values ? { [key]: values[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(values, items);
        }),
      },
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProviderRuntime probe binding', () => {
  it('只恢复与当前 Key 修订号及模型完全匹配的探针', async () => {
    const values = stubStorage();
    const matching = new ProviderRuntime();
    await expect(matching.views()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'deepseek', availability: 'available' }),
      ]),
    );

    values[CREDENTIAL_KEY] = {
      providerId: 'deepseek',
      apiKey: 'different-deepseek-key',
      revision: 'revision-2',
    };
    const changedKey = new ProviderRuntime();
    await expect(changedKey.views()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'deepseek', availability: 'pending_probe' }),
      ]),
    );

    values[CREDENTIAL_KEY] = {
      providerId: 'deepseek',
      apiKey: 'deepseek-test-key',
      revision: 'revision-1',
    };
    values[SETTINGS_KEY] = {
      schemaVersion: 2,
      providers: { deepseek: { textModel: 'deepseek-v4-pro' } },
    };
    const changedModel = new ProviderRuntime();
    await expect(changedModel.views()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'deepseek', availability: 'pending_probe' }),
      ]),
    );
  });

  it('主动失效会同时清除内存状态与已保存记录', async () => {
    const values = stubStorage();
    const runtime = new ProviderRuntime();
    await runtime.views();

    await runtime.invalidateProbeState('deepseek');

    await expect(runtime.views()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'deepseek', availability: 'pending_probe' }),
      ]),
    );
    expect(values[PROBE_KEY]).toEqual({ schemaVersion: 2, results: {} });
  });
});
