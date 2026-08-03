import { describe, expect, it, vi } from 'vitest';

import { createPortMessenger } from '../../src/background/port-messenger';

describe('PortMessenger', () => {
  it('显式断开后丢弃异步结果', () => {
    const postMessage = vi.fn();
    const messenger = createPortMessenger({ postMessage });

    messenger.markDisconnected();

    expect(messenger.post({ type: 'late-result' })).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('onDisconnect 事件到达前也能吸收 Chrome 的断开竞态', () => {
    const postMessage = vi.fn().mockImplementationOnce(() => {
      throw new Error('Attempting to use a disconnected port object');
    });
    const messenger = createPortMessenger({ postMessage });

    expect(messenger.post({ type: 'racing-result' })).toBe(false);
    expect(messenger.post({ type: 'later-result' })).toBe(false);
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it('不会吞掉与断开无关的编程错误', () => {
    const postMessage = vi.fn(() => {
      throw new TypeError('消息不可序列化');
    });
    const messenger = createPortMessenger({ postMessage });

    expect(() => messenger.post({ type: 'bad-result' })).toThrow('消息不可序列化');
  });
});
