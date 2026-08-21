import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerPanelPortBridge } from '../../src/background/panel-bridge';
import { SEARCH_SNAPSHOT_STORAGE_KEY } from '../../src/background/search-snapshot-store';
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
        session: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
          clear: vi.fn(async () => undefined),
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

  it('重开 Panel 时只从 session 恢复当前标签页搜索，不重新调用搜索能力', async () => {
    let connectListener: ((port: chrome.runtime.Port) => void) | undefined;
    const posted: Array<{ type?: string; payload?: unknown }> = [];
    const sessionValues: Record<string, unknown> = {
      [SEARCH_SNAPSHOT_STORAGE_KEY]: {
        schemaVersion: 1,
        items: [
          {
            tabId: 42,
            requestId: 'saved-search',
            naturalLanguage: '声音克隆项目',
            target: 'repositories',
            result: {
              status: 'ok',
              conversion: {
                naturalLanguage: '声音克隆项目',
                target: 'repositories',
                query: '声音克隆',
                explanation: '搜索公开仓库。',
              },
              totalCount: 0,
              items: [],
            },
            savedAt: new Date().toISOString(),
          },
        ],
      },
    };
    const searchIntent = vi.fn();
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
        query: vi.fn(async () => [{ id: 42, url: 'https://github.com/explore' }]),
        sendMessage: vi.fn(async () => {
          throw new Error('Content 尚未就绪');
        }),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
          clear: vi.fn(async () => undefined),
          getBytesInUse: vi.fn(async () => 0),
        },
        session: {
          get: vi.fn(async (key: string) =>
            key in sessionValues ? { [key]: sessionValues[key] } : {},
          ),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(sessionValues, items)),
          remove: vi.fn(async (key: string | string[]) => {
            for (const item of Array.isArray(key) ? key : [key]) delete sessionValues[item];
          }),
          clear: vi.fn(async () => undefined),
          getBytesInUse: vi.fn(async () => 0),
        },
      },
    });
    const runtime = {
      views: vi.fn(async () => []),
      abort: vi.fn(() => false),
      generateSearchIntent: searchIntent,
    } as unknown as ProviderRuntime;
    registerPanelPortBridge(runtime);

    const port = {
      name: PANEL_PORT_NAME,
      sender: {
        id: chrome.runtime.id,
        url: `chrome-extension://${chrome.runtime.id}/src/panel/index.html`,
      },
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      postMessage: (message: { type?: string; payload?: unknown }) => posted.push(message),
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port;
    connectListener?.(port);

    await vi.waitFor(() => {
      expect(posted.some((message) => message.type === 'SEARCH_STATE')).toBe(true);
    });
    expect(posted.find((message) => message.type === 'SEARCH_STATE')?.payload).toMatchObject({
      status: 'done',
      naturalLanguage: '声音克隆项目',
      target: 'repositories',
      restored: true,
    });
    expect(searchIntent).not.toHaveBeenCalled();
  });
});
