import { describe, expect, it, vi } from 'vitest';

import { PanelBridge } from '../../src/background/panel-bridge';
import { handlePageInfoRequest } from '../../src/content/page-info';
import { createEnvelope, parseEnvelope, type Envelope } from '../../src/lib/messaging';
import { pageInfoSchema, type StreamEvent } from '../../src/lib/bridge-protocol';

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
});
