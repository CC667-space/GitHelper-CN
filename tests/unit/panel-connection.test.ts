import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectPanel } from '../../src/panel/connection';

interface FakePort {
  disconnectFromBackground(): void;
  port: chrome.runtime.Port;
  postMessage: ReturnType<typeof vi.fn>;
}

function createFakePort(): FakePort {
  const disconnectListeners: Array<() => void> = [];
  const postMessage = vi.fn();
  const disconnectFromBackground = (): void => {
    for (const listener of disconnectListeners) {
      listener();
    }
  };
  return {
    disconnectFromBackground,
    postMessage,
    port: {
      name: 'git-helper-panel-v1',
      disconnect: vi.fn(disconnectFromBackground),
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => disconnectListeners.push(listener)),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      postMessage,
      sender: undefined,
    } as unknown as chrome.runtime.Port,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Panel connection lifecycle', () => {
  it('完成一轮后 Background port 断开时自动重连并允许第二轮发送', async () => {
    const ports: FakePort[] = [];
    const runtimeConnect = vi.fn(() => {
      const next = createFakePort();
      ports.push(next);
      return next.port;
    });
    vi.stubGlobal('chrome', {
      runtime: {
        connect: runtimeConnect,
      },
    });
    const onConnectionChange = vi.fn();
    const connection = connectPanel(vi.fn(), vi.fn(), onConnectionChange);
    connection.send('第一轮', 'deepseek');
    expect(ports[0]?.postMessage).toHaveBeenCalledOnce();

    ports[0]?.disconnectFromBackground();
    expect(onConnectionChange).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(250);
    expect(runtimeConnect).toHaveBeenCalledTimes(2);
    expect(onConnectionChange).toHaveBeenLastCalledWith(true);

    connection.send('第二轮', 'deepseek');
    expect(ports[1]?.postMessage).toHaveBeenCalledOnce();

    connection.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runtimeConnect).toHaveBeenCalledTimes(2);
  });
});
