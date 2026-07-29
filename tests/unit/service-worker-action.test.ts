import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/background/panel-bridge', () => ({
  registerPanelPortBridge: vi.fn(),
}));
vi.mock('../../src/background/options-router', () => ({
  registerOptionsRouter: vi.fn(),
}));
vi.mock('../../src/background/provider-runtime', () => ({
  ProviderRuntime: class ProviderRuntime {},
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('Extension action', () => {
  it('单击扩展图标直接打开，并在切换标签页时关闭当前 Side Panel', async () => {
    let actionListener: ((tab: chrome.tabs.Tab) => void) | undefined;
    let activatedListener: ((activeInfo: { tabId: number; windowId: number }) => void) | undefined;
    const open = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const setOptions = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      action: {
        onClicked: {
          addListener: vi.fn((listener: (tab: chrome.tabs.Tab) => void) => {
            actionListener = listener;
          }),
        },
      },
      commands: {
        onCommand: { addListener: vi.fn() },
      },
      runtime: {
        id: 'abcdefghijklmnopabcdefghijklmnop',
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
      },
      sidePanel: { close, open, setOptions },
      storage: {
        local: {
          remove: vi.fn(async () => undefined),
          set: vi.fn(async () => undefined),
          setAccessLevel: vi.fn(async () => undefined),
        },
      },
      tabs: {
        onActivated: {
          addListener: vi.fn(
            (listener: (activeInfo: { tabId: number; windowId: number }) => void) => {
              activatedListener = listener;
            },
          ),
        },
        captureVisibleTab: vi.fn(),
        getZoom: vi.fn(async () => 1),
        query: vi.fn(async () => []),
        sendMessage: vi.fn(async () => {
          throw new Error('stop phase0 probe');
        }),
      },
    });

    await import('../../src/background/service-worker');
    expect(actionListener).toBeTypeOf('function');
    expect(activatedListener).toBeTypeOf('function');

    actionListener!({
      id: 17,
      windowId: 23,
      url: 'https://github.com/openai/openai-node',
    } as chrome.tabs.Tab);

    await vi.waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith({ tabId: 17 }));
    expect(setOptions).not.toHaveBeenCalled();

    activatedListener!({ tabId: 29, windowId: 23 });
    await vi.waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith({ windowId: 23 }));

    delete (
      chrome.sidePanel as unknown as {
        close?: (options: { windowId: number }) => Promise<void>;
      }
    ).close;
    expect(() => activatedListener!({ tabId: 31, windowId: 23 })).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
