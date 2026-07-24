import { describe, expect, it, vi } from 'vitest';

import { PanelBridge } from '../../src/background/panel-bridge';
import { handlePageInfoRequest } from '../../src/content/page-info';
import { createEnvelope, parseEnvelope, type Envelope } from '../../src/lib/messaging';
import { pageInfoSchema, type StreamEvent } from '../../src/lib/bridge-protocol';
import { defaultUserPreferences } from '../../src/background/prefs-store';

const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';
const panelSender = {
  id: runtimeId,
  url: `chrome-extension://${runtimeId}/src/panel/index.html`,
} as chrome.runtime.MessageSender;

describe('Panel → Background → Content → Panel', () => {
  it('经安全信封完成页面信息往返并按流式事件回推', async () => {
    const emitted: Envelope<StreamEvent>[] = [];
    const contentHandler = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      const request = createEnvelope('PAGE_INFO_REQUEST', {});
      const response = handlePageInfoRequest(
        request,
        document,
        { href: 'https://github.com/openai/openai-node' },
        'openai/openai-node',
        new Date('2026-07-24T00:00:00.000Z'),
      );
      return Promise.resolve(
        parseEnvelope(response, pageInfoSchema, {
          expectedType: 'PAGE_INFO_RESPONSE',
        }).payload,
      );
    });
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: contentHandler,
      streamAnswer: async function* () {
        yield '当前页面信息往返成功。';
      },
      abort: vi.fn(() => false),
      emit: (event) => emitted.push(event),
    });

    const response = await bridge.dispatch(
      createEnvelope('PANEL_MESSAGE', { text: '这个仓库是什么？' }, { id: 'panel-1' }),
      panelSender,
    );

    expect(contentHandler).toHaveBeenCalledOnce();
    expect(response.id).toBe('panel-1');
    expect(emitted.map((event) => event.payload.kind)).toEqual([
      'start',
      'context',
      'delta',
      'done',
    ]);
    expect(emitted[1]?.payload.text).toBe('openai/openai-node');
  });

  it('拒绝伪造扩展来源和非法消息 Schema', async () => {
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(),
      streamAnswer: vi.fn(),
      abort: vi.fn(() => false),
      emit: vi.fn(),
    });
    const valid = createEnvelope('PANEL_MESSAGE', { text: 'hello' });
    await expect(
      bridge.dispatch(valid, {
        id: 'other-extension',
        url: 'chrome-extension://other-extension/src/panel/index.html',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MESSAGE_SOURCE' });
    await expect(
      bridge.dispatch(createEnvelope('PANEL_MESSAGE', { text: '' }), panelSender),
    ).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' });
  });

  it('发送前装载有限历史，完成后持久化助手回答并刷新 Panel 会话', async () => {
    const emitSessionState = vi.fn();
    const saveAssistant = vi.fn();
    const streamAnswer = vi.fn(async function* (input: { history?: Array<{ content: string }> }) {
      expect(input.history?.[0]?.content).toBe('上一轮问题');
      yield '本轮';
      yield '回答';
    });
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/openai/openai-node',
        title: 'openai/openai-node',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: {
          url: 'https://github.com/openai/openai-node',
          pageType: 'repo' as const,
          repository: 'openai/openai-node',
          isPrivate: false,
          extracted: {},
          capturedAt: '2026-07-24T00:00:00.000Z',
        },
      })),
      prepareSession: vi.fn(async () => ({
        sessionId: 'session-1',
        history: [
          {
            id: 'history-1',
            role: 'user' as const,
            content: '上一轮问题',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
        ],
        preferences: defaultUserPreferences(),
        snapshot: {
          sessionId: 'session-1',
          messages: [
            {
              id: 'current-user',
              role: 'user' as const,
              content: '继续',
              createdAt: '2026-07-24T00:00:01.000Z',
            },
          ],
          truncated: false,
        },
      })),
      streamAnswer,
      saveAssistant,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSessionState,
    });

    await bridge.dispatch(
      createEnvelope('PANEL_MESSAGE', { text: '继续' }, { id: 'panel-session' }),
      panelSender,
    );

    expect(emitSessionState).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    expect(saveAssistant).toHaveBeenCalledWith('session-1', '本轮回答');
  });
});
