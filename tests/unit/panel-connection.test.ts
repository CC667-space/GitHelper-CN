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

  it('发送显式会话选择、新建、删除和带会话身份的问题', () => {
    const fake = createFakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => fake.port),
      },
    });
    const connection = connectPanel(vi.fn(), vi.fn(), vi.fn());

    connection.selectSession?.('session-2');
    connection.newSession?.();
    connection.deleteTurn?.('session-2', 'question-1');
    connection.deleteSession?.('session-2');
    connection.send('继续这个主题', 'deepseek', undefined, undefined, 'session-2', false);

    expect(fake.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'PANEL_SESSION_SELECT',
      'PANEL_SESSION_NEW',
      'PANEL_TURN_DELETE',
      'PANEL_SESSION_DELETE',
      'PANEL_MESSAGE',
    ]);
    expect(fake.postMessage.mock.calls[2]?.[0].payload).toEqual({
      sessionId: 'session-2',
      userMessageId: 'question-1',
    });
    expect(fake.postMessage.mock.calls[3]?.[0].payload).toEqual({
      sessionId: 'session-2',
    });
    expect(fake.postMessage.mock.calls[4]?.[0].payload).toEqual({
      text: '继续这个主题',
      providerId: 'deepseek',
      selectedElement: undefined,
      selectedRegion: undefined,
      sessionId: 'session-2',
      startNewSession: false,
    });
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

  it('收发区域框选协议消息', () => {
    const fake = createFakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => fake.port),
      },
    });
    const onRegionState = vi.fn();
    const connection = connectPanel(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), onRegionState);
    connection.startRegion?.();
    connection.cancelRegion?.();
    expect(fake.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'PANEL_REGION_START',
      'PANEL_REGION_CANCEL',
    ]);

    fake.emitMessage(
      createEnvelope('REGION_STATE', {
        status: 'selected',
        region: {
          text: '结构化内容',
          links: [],
          codeBlocks: ['pnpm install'],
          buttons: [],
          htmlOutline: '<p>',
          nearbyContext: 'README',
          needsVision: false,
          sourceUrl: 'https://github.com/openai/openai-node',
          rect: { x: 10, y: 20, width: 200, height: 100 },
          viewport: { cssWidth: 800, cssHeight: 600 },
          scroll: { x: 0, y: 0 },
          devicePixelRatio: 1,
          zoomFactor: 1,
        },
      }),
    );
    expect(onRegionState).toHaveBeenCalledWith(expect.objectContaining({ status: 'selected' }));
    connection.disconnect();
  });

  it('收发 GitHub 搜索与安全打开协议消息', () => {
    const fake = createFakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => fake.port),
      },
    });
    const onSearchState = vi.fn();
    const connection = connectPanel(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      onSearchState,
    );
    connection.search?.('开放的 bug issue', 'auto', 'deepseek');
    connection.openGitHubPage?.('https://github.com/search?q=bug&type=issues');
    connection.openGitHubPage?.('https://github.com/search?q=bug&type=issues', 'background');
    connection.clearSearch?.();
    expect(fake.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'PANEL_SEARCH',
      'PANEL_OPEN_GITHUB_PAGE',
      'PANEL_OPEN_GITHUB_PAGE',
      'PANEL_SEARCH_CLEAR',
    ]);
    expect(fake.postMessage.mock.calls[0]?.[0].payload).toEqual({
      naturalLanguage: '开放的 bug issue',
      target: 'auto',
      providerId: 'deepseek',
    });
    expect(fake.postMessage.mock.calls[1]?.[0].payload).toEqual({
      url: 'https://github.com/search?q=bug&type=issues',
      disposition: 'foreground',
    });
    expect(fake.postMessage.mock.calls[2]?.[0].payload).toEqual({
      url: 'https://github.com/search?q=bug&type=issues',
      disposition: 'background',
    });

    fake.emitMessage(
      createEnvelope('SEARCH_STATE', {
        status: 'done',
        requestId: 'search-1',
        result: {
          status: 'ok',
          conversion: {
            naturalLanguage: '开放的 bug issue',
            target: 'issues',
            query: 'is:issue is:open label:bug',
            explanation: '搜索公开 Issue。',
          },
          totalCount: 0,
          items: [],
        },
      }),
    );
    expect(onSearchState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', requestId: 'search-1' }),
    );
    connection.disconnect();
  });

  it('收发仓库一键分析协议消息', () => {
    const fake = createFakePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => fake.port),
      },
    });
    const onAnalysisState = vi.fn();
    const connection = connectPanel(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      onAnalysisState,
    );
    connection.analyzeRepository?.('deepseek');
    expect(fake.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      'PANEL_ANALYZE_REPOSITORY',
    ]);
    expect(fake.postMessage.mock.calls[0]?.[0].payload).toEqual({
      providerId: 'deepseek',
    });

    fake.emitMessage(
      createEnvelope('REPOSITORY_ANALYSIS_STATE', {
        status: 'error',
        requestId: 'analysis-1',
        error: '当前页面不是仓库',
      }),
    );
    expect(onAnalysisState).toHaveBeenCalledWith({
      status: 'error',
      requestId: 'analysis-1',
      error: '当前页面不是仓库',
    });
    connection.disconnect();
  });
});
