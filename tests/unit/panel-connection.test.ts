import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEnvelope } from '../../src/lib/messaging';
import { connectPanel } from '../../src/panel/connection';

interface FakePort {
  disconnectFromBackground(): void;
  emitMessage(message: unknown): void;
  port: chrome.runtime.Port;
  postMessage: ReturnType<typeof vi.fn>;
}

function createFakePort(): FakePort {
  const disconnectListeners: Array<() => void> = [];
  const messageListeners: Array<(message: unknown) => void> = [];
  const postMessage = vi.fn();
  const disconnectFromBackground = (): void => {
    for (const listener of disconnectListeners) {
      listener();
    }
  };
  return {
    disconnectFromBackground,
    emitMessage: (message) => {
      for (const listener of messageListeners) {
        listener(message);
      }
    },
    postMessage,
    port: {
      name: 'git-helper-panel-v1',
      disconnect: vi.fn(disconnectFromBackground),
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => disconnectListeners.push(listener)),
      },
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) =>
          messageListeners.push(listener),
        ),
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

  it('接收并校验会话恢复信封', () => {
    const fake = createFakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => fake.port),
      },
    });
    const onSessionState = vi.fn();
    const connection = connectPanel(vi.fn(), vi.fn(), vi.fn(), onSessionState);

    fake.emitMessage(
      createEnvelope('SESSION_STATE', {
        sessionId: 'session-1',
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            content: '已恢复',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
        ],
        truncated: false,
      }),
    );

    expect(onSessionState).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    connection.disconnect();
  });

  it('收发点击选择协议消息', () => {
    const fake = createFakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => fake.port),
      },
    });
    const onPickState = vi.fn();
    const connection = connectPanel(vi.fn(), vi.fn(), vi.fn(), vi.fn(), onPickState);
    connection.startPick?.();
    connection.cancelPick?.();

    expect(fake.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'PANEL_PICK_START',
      'PANEL_PICK_CANCEL',
    ]);

    fake.emitMessage(
      createEnvelope('PICK_STATE', {
        status: 'selected',
        element: {
          tag: 'button',
          role: 'button',
          text: 'Star',
          attrs: {},
          nearbyContext: 'Repository actions',
          pageType: 'repo',
        },
      }),
    );
    expect(onPickState).toHaveBeenCalledWith(expect.objectContaining({ status: 'selected' }));
    connection.disconnect();
  });
});
