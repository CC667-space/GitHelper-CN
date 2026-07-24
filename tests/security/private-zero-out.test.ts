import { describe, expect, it, vi } from 'vitest';

import { PanelBridge } from '../../src/background/panel-bridge';
import { createEnvelope } from '../../src/lib/messaging';
import type { PageInfo } from '../../src/lib/bridge-protocol';

const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';
const panelSender = {
  id: runtimeId,
  url: `chrome-extension://${runtimeId}/src/panel/index.html`,
} as chrome.runtime.MessageSender;

function privatePage(): PageInfo {
  return {
    url: 'https://github.com/private/repository',
    title: 'private/repository',
    placeholder: false,
    capturedAt: '2026-07-24T00:00:00.000Z',
    pageContext: {
      url: 'https://github.com/private/repository',
      pageType: 'repo',
      repository: 'private/repository',
      isPrivate: true,
      extracted: {
        readme: 'PRIVATE_SENTINEL_MUST_NOT_LEAVE',
      },
      capturedAt: '2026-07-24T00:00:00.000Z',
    },
  };
}

describe('私有仓库与无权限页面零出站', () => {
  it('普通对话在 Panel 消息入口阻断，Provider、会话与截图均为零调用', async () => {
    const prepareSession = vi.fn();
    const captureRegion = vi.fn();
    const streamAnswer = vi.fn(async function* () {
      yield '不应执行';
    });
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => privatePage()),
      prepareSession,
      captureRegion,
      streamAnswer,
      abort: vi.fn(() => false),
      emit: vi.fn(),
    });

    await expect(
      bridge.dispatch(createEnvelope('PANEL_MESSAGE', { text: '解释当前页面' }), panelSender),
    ).rejects.toMatchObject({ code: 'PRIVATE_CONTEXT_BLOCKED' });
    expect(prepareSession).not.toHaveBeenCalled();
    expect(captureRegion).not.toHaveBeenCalled();
    expect(streamAnswer).not.toHaveBeenCalled();
  });

  it('搜索与仓库分析在依赖执行前阻断并返回可读错误状态', async () => {
    const search = vi.fn();
    const analyzeRepository = vi.fn();
    const emitSearchState = vi.fn();
    const emitRepositoryAnalysisState = vi.fn();
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => privatePage()),
      streamAnswer: vi.fn(),
      search,
      analyzeRepository,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSearchState,
      emitRepositoryAnalysisState,
    });

    const searchResponse = await bridge.dispatch(
      createEnvelope(
        'PANEL_SEARCH',
        { naturalLanguage: '查找公开仓库', target: 'auto' },
        { id: 'private-search' },
      ),
      panelSender,
    );
    const analysisResponse = await bridge.dispatch(
      createEnvelope('PANEL_ANALYZE_REPOSITORY', {}, { id: 'private-analysis' }),
      panelSender,
    );

    expect(searchResponse.payload).toMatchObject({ accepted: false });
    expect(analysisResponse.payload).toMatchObject({ accepted: false });
    expect(search).not.toHaveBeenCalled();
    expect(analyzeRepository).not.toHaveBeenCalled();
    expect(emitSearchState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        error: expect.stringContaining('零出站'),
      }),
    );
    expect(emitRepositoryAnalysisState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        error: expect.stringContaining('零出站'),
      }),
    );
  });
});
