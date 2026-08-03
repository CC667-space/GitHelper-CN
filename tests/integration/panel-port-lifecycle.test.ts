import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerPanelPortBridge } from '../../src/background/panel-bridge';
import type { ProviderRuntime } from '../../src/background/provider-runtime';
import { PANEL_PORT_NAME } from '../../src/lib/bridge-protocol';

describe('Panel Port 生命周期', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Port 已断开时不再发送异步初始化结果', async () => {
    let connectListener: ((port: chrome.runtime.Port) => void) | undefined;
    const disconnectListeners: Array<() => void> = [];
    const disconnectedPosts: unknown[] = [];
    let disconnected = false;

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'abcdefghijklmnopabcdefghijklmnop',
        onConnect: {
          addListener(listener: (port: chrome.runtime.Port) => void) {
            connectListener = listener;
          },
        },
      },
      tabs: {
        query: vi.fn(async () => []),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
          getBytesInUse: vi.fn(async () => 0),
        },
      },
    });

    const runtime = {
      views: vi.fn(async () => []),
      abort: vi.fn(() => false),
    } as unknown as ProviderRuntime;
    registerPanelPortBridge(runtime);

    const port = {
      name: PANEL_PORT_NAME,
      sender: {
        id: chrome.runtime.id,
        url: `chrome-extension://${chrome.runtime.id}/src/panel/index.html`,
      },
      onDisconnect: {
        addListener(listener: () => void) {
          disconnectListeners.push(listener);
        },
      },
      onMessage: {
        addListener: vi.fn(),
      },
      postMessage(message: unknown) {
        if (disconnected) {
          disconnectedPosts.push(message);
        }
      },
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port;

    connectListener?.(port);
    disconnected = true;
    for (const listener of disconnectListeners) {
      listener();
    }
    await vi.waitFor(() => {
      expect(runtime.views).toHaveBeenCalledOnce();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(disconnectedPosts).toEqual([]);
  });
});
