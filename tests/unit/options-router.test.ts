import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerOptionsRouter } from '../../src/background/options-router';
import type { ProviderRuntime } from '../../src/background/provider-runtime';
import { createEnvelope } from '../../src/lib/messaging';

const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Options Provider router', () => {
  it('真实探针详情超过 64KB 时仍只返回紧凑 Provider 状态', async () => {
    let listener:
      | ((
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean)
      | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        id: runtimeId,
        onMessage: {
          addListener: vi.fn(
            (
              next: (
                message: unknown,
                sender: chrome.runtime.MessageSender,
                sendResponse: (response: unknown) => void,
              ) => boolean,
            ) => {
              listener = next;
            },
          ),
        },
      },
    });
    const runtime = {
      runConfiguredProbes: vi.fn(async () =>
        Array.from({ length: 80 }, (_, index) => ({
          providerId: 'deepseek',
          checks: {
            [`check-${index}`]: {
              detail: 'x'.repeat(2_000),
              passed: true,
            },
          },
        })),
      ),
      views: vi.fn(async () => []),
    } as unknown as ProviderRuntime;
    registerOptionsRouter(runtime);
    expect(listener).toBeTypeOf('function');

    const response = await new Promise<{
      ok?: boolean;
      error?: { message?: string };
      response?: { payload?: { providers?: unknown[] } };
    }>((resolve) => {
      listener!(
        createEnvelope('OPTIONS_RUN_PROVIDER_PROBES', {}),
        {
          id: runtimeId,
          url: `chrome-extension://${runtimeId}/src/options/index.html`,
        },
        (value) => resolve(value as Parameters<typeof resolve>[0]),
      );
    });

    expect(response.error?.message ?? '').not.toMatch(/消息大小 .* 超过上限/);
    expect(response.ok).toBe(true);
    expect(response.response?.payload?.providers).toEqual([]);
  });

  it('单 Provider 复测只把明确目标交给 runtime', async () => {
    let listener:
      | ((
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean)
      | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        id: runtimeId,
        onMessage: {
          addListener: vi.fn(
            (
              next: (
                message: unknown,
                sender: chrome.runtime.MessageSender,
                sendResponse: (response: unknown) => void,
              ) => boolean,
            ) => {
              listener = next;
            },
          ),
        },
      },
    });
    const runConfiguredProbes = vi.fn(async () => []);
    const runtime = {
      runConfiguredProbes,
      views: vi.fn(async () => []),
    } as unknown as ProviderRuntime;
    registerOptionsRouter(runtime);

    const response = await new Promise<{ ok?: boolean }>((resolve) => {
      listener!(
        createEnvelope('OPTIONS_RUN_PROVIDER_PROBES', { providerId: 'deepseek' }),
        {
          id: runtimeId,
          url: `chrome-extension://${runtimeId}/src/options/index.html`,
        },
        (value) => resolve(value as { ok?: boolean }),
      );
    });

    expect(response.ok).toBe(true);
    expect(runConfiguredProbes).toHaveBeenCalledExactlyOnceWith('deepseek');
  });

  it('全清完成通知会复位 Background 内存能力状态', async () => {
    let listener:
      | ((
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean)
      | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        id: runtimeId,
        onMessage: {
          addListener: vi.fn(
            (
              next: (
                message: unknown,
                sender: chrome.runtime.MessageSender,
                sendResponse: (response: unknown) => void,
              ) => boolean,
            ) => {
              listener = next;
            },
          ),
        },
      },
    });
    const resetLocalState = vi.fn();
    const runtime = {
      resetLocalState,
    } as unknown as ProviderRuntime;
    registerOptionsRouter(runtime);

    const response = await new Promise<{ ok?: boolean }>((resolve) => {
      listener!(
        createEnvelope('OPTIONS_RESET_LOCAL_STATE', {}),
        {
          id: runtimeId,
          url: `chrome-extension://${runtimeId}/src/options/index.html`,
        },
        (value) => resolve(value as { ok?: boolean }),
      );
    });

    expect(response.ok).toBe(true);
    expect(resetLocalState).toHaveBeenCalledOnce();
  });
});
