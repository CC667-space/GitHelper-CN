import { describe, expect, it, vi } from 'vitest';

import { PanelBridge } from '../../src/background/panel-bridge';
import { handlePageInfoRequest } from '../../src/content/page-info';
import { createEnvelope, parseEnvelope, type Envelope } from '../../src/lib/messaging';
import { pageInfoSchema, type StreamEvent } from '../../src/lib/bridge-protocol';
import { defaultUserPreferences } from '../../src/background/prefs-store';
import { githubSearchResultSchema } from '../../src/lib/github-search';

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
    const streamAnswer = vi.fn(async function* (input: {
      history?: Array<{ content: string }>;
      selectedElement?: { text: string };
    }) {
      expect(input.history?.[0]?.content).toBe('上一轮问题');
      expect(input.selectedElement?.text).toBe('Issues');
      yield '本轮';
      yield '回答';
    });
    const prepareSession = vi.fn(async () => ({
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
    }));
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
      prepareSession,
      streamAnswer,
      saveAssistant,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSessionState,
    });

    await bridge.dispatch(
      createEnvelope(
        'PANEL_MESSAGE',
        {
          text: '继续',
          sessionId: 'session-1',
          startNewSession: false,
          selectedElement: {
            tag: 'a',
            role: 'link',
            text: 'Issues',
            href: 'https://github.com/openai/openai-node/issues',
            attrs: {},
            nearbyContext: 'Repository navigation',
            pageType: 'repo',
          },
        },
        { id: 'panel-session' },
      ),
      panelSender,
    );

    expect(emitSessionState).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    expect(prepareSession).toHaveBeenCalledWith(expect.anything(), '继续', undefined, {
      sessionId: 'session-1',
      startNew: false,
    });
    expect(saveAssistant).toHaveBeenCalledWith('session-1', '本轮回答');
  });

  it('通过 Background 路由显式选择与新建会话', async () => {
    const emitSessionState = vi.fn();
    const changeSession = vi.fn(async (action: { kind: 'select' | 'new'; sessionId?: string }) => ({
      sessionId: action.kind === 'select' ? action.sessionId : undefined,
      cause: action.kind,
      messages:
        action.kind === 'select'
          ? [
              {
                id: 'message-selected',
                role: 'assistant' as const,
                content: '已切换',
                createdAt: '2026-07-24T00:00:00.000Z',
              },
            ]
          : [],
      truncated: false,
    }));
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(),
      streamAnswer: vi.fn(),
      changeSession,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSessionState,
    });

    await bridge.dispatch(
      createEnvelope('PANEL_SESSION_SELECT', { sessionId: 'session-2' }),
      panelSender,
    );
    await bridge.dispatch(createEnvelope('PANEL_SESSION_NEW', {}), panelSender);

    expect(changeSession).toHaveBeenNthCalledWith(1, {
      kind: 'select',
      sessionId: 'session-2',
    });
    expect(changeSession).toHaveBeenNthCalledWith(2, { kind: 'new' });
    expect(emitSessionState).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: 'session-2', cause: 'select' }),
    );
    expect(emitSessionState).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cause: 'new', messages: [] }),
    );
  });

  it('通过 Background 路由删除一轮问答或整个会话并刷新状态', async () => {
    const emitSessionState = vi.fn();
    const deleteTurn = vi.fn(async () => ({
      sessionId: 'session-1',
      cause: 'update' as const,
      messages: [],
      truncated: false,
    }));
    const deleteSession = vi.fn(async () => ({
      cause: 'new' as const,
      messages: [],
      truncated: false,
      recentSessions: [],
    }));
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(),
      streamAnswer: vi.fn(),
      deleteTurn,
      deleteSession,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSessionState,
    });

    await bridge.dispatch(
      createEnvelope('PANEL_TURN_DELETE', {
        sessionId: 'session-1',
        userMessageId: 'question-1',
      }),
      panelSender,
    );
    await bridge.dispatch(
      createEnvelope('PANEL_SESSION_DELETE', { sessionId: 'session-1' }),
      panelSender,
    );

    expect(deleteTurn).toHaveBeenCalledWith('session-1', 'question-1');
    expect(deleteSession).toHaveBeenCalledWith('session-1');
    expect(emitSessionState).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: 'session-1', cause: 'update' }),
    );
    expect(emitSessionState).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cause: 'new', messages: [] }),
    );
  });

  it('点击选择状态经 Background 从 active 推进到 selected', async () => {
    const emitPickState = vi.fn();
    const element = {
      tag: 'button',
      role: 'button',
      text: 'Star',
      attrs: { 'aria-label': 'Star this repository' },
      nearbyContext: 'Repository actions',
      pageType: 'repo' as const,
    };
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(),
      streamAnswer: vi.fn(),
      startPick: vi.fn(async () => ({ status: 'selected' as const, element })),
      cancelPick: vi.fn(),
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitPickState,
    });

    const response = await bridge.dispatch(
      createEnvelope('PANEL_PICK_START', {}, { id: 'pick-1' }),
      panelSender,
    );

    expect(response.id).toBe('pick-1');
    expect(emitPickState).toHaveBeenNthCalledWith(1, { status: 'active' });
    expect(emitPickState).toHaveBeenNthCalledWith(2, {
      status: 'selected',
      element,
    });
  });

  it('SPA 页面变化后不把旧页面 SelectedElement 发给 Provider', async () => {
    const streamAnswer = vi.fn(async function* (input: { selectedElement?: unknown }) {
      expect(input.selectedElement).toBeUndefined();
      yield '已忽略旧选择';
    });
    const emitPickState = vi.fn();
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/openai/openai-node/issues/2',
        title: 'Issue 2',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: {
          url: 'https://github.com/openai/openai-node/issues/2',
          pageType: 'issue' as const,
          repository: 'openai/openai-node',
          isPrivate: false,
          extracted: {},
          capturedAt: '2026-07-24T00:00:00.000Z',
        },
      })),
      streamAnswer,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitPickState,
    });

    await bridge.dispatch(
      createEnvelope('PANEL_MESSAGE', {
        text: '解释所选元素',
        selectedElement: {
          tag: 'button',
          text: 'Old button',
          sourceUrl: 'https://github.com/openai/openai-node/issues/1',
          attrs: {},
          nearbyContext: 'Old issue',
          pageType: 'issue',
        },
      }),
      panelSender,
    );

    expect(emitPickState).toHaveBeenCalledWith({
      status: 'cancelled',
      reason: '页面已变化，旧的元素选择未发送',
    });
  });

  it('结构充分的框选不截图；结构不足时只在可信 Background 裁剪并走视觉', async () => {
    const pageInfo = {
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
    };
    const baseRegion = {
      links: [],
      codeBlocks: [],
      buttons: [],
      nearbyContext: 'README',
      sourceUrl: pageInfo.url,
      rect: { x: 10, y: 20, width: 200, height: 100 },
      viewport: { cssWidth: 800, cssHeight: 600 },
      scroll: { x: 0, y: 0 },
      devicePixelRatio: 1,
      zoomFactor: 1,
    };
    const captureRegion = vi.fn(async () => 'data:image/jpeg;base64,CROPPED');
    const structuredStream = vi.fn(async function* (input: {
      needsVision?: boolean;
      images?: string[];
    }) {
      expect(input.needsVision).toBe(false);
      expect(input.images).toBeUndefined();
      yield '结构化回答';
    });
    const structuredBridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => pageInfo),
      streamAnswer: structuredStream,
      captureRegion,
      abort: vi.fn(() => false),
      emit: vi.fn(),
    });
    await structuredBridge.dispatch(
      createEnvelope('PANEL_MESSAGE', {
        text: '解释框选',
        selectedRegion: {
          ...baseRegion,
          text: '足够的结构化内容'.repeat(12),
          htmlOutline: '<p>',
          needsVision: false,
        },
      }),
      panelSender,
    );
    expect(captureRegion).not.toHaveBeenCalled();

    const visualStream = vi.fn(async function* (input: {
      needsVision?: boolean;
      images?: string[];
    }) {
      expect(input.needsVision).toBe(true);
      expect(input.images).toEqual(['data:image/jpeg;base64,CROPPED']);
      yield '视觉回答';
    });
    const visualBridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => pageInfo),
      prepareSession: vi.fn(async () => ({
        sessionId: 'session-vision',
        history: [],
        preferences: defaultUserPreferences(),
        snapshot: { sessionId: 'session-vision', messages: [], truncated: false },
      })),
      streamAnswer: visualStream,
      captureRegion,
      abort: vi.fn(() => false),
      emit: vi.fn(),
    });
    const visualRegion = {
      ...baseRegion,
      text: '',
      htmlOutline: '<img>',
      needsVision: true,
    };
    await visualBridge.dispatch(
      createEnvelope('PANEL_MESSAGE', {
        text: '解释图片',
        providerId: 'openrouter',
        selectedRegion: visualRegion,
      }),
      panelSender,
    );
    expect(captureRegion).toHaveBeenCalledExactlyOnceWith(visualRegion, expect.any(AbortSignal));
  });

  it('visionEnabled=false 时在截图和 Provider 调用前阻断视觉框选', async () => {
    const captureRegion = vi.fn();
    const streamAnswer = vi.fn();
    const preferences = {
      ...defaultUserPreferences(),
      visionEnabled: false,
    };
    const prepareSession = vi.fn();
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/example/charts',
        title: 'charts',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: {
          url: 'https://github.com/example/charts',
          pageType: 'repo' as const,
          repository: 'example/charts',
          isPrivate: false,
          extracted: {},
          capturedAt: '2026-07-24T00:00:00.000Z',
        },
      })),
      loadPreferences: vi.fn(async () => preferences),
      prepareSession,
      streamAnswer,
      captureRegion,
      abort: vi.fn(() => false),
      emit: vi.fn(),
    });

    await expect(
      bridge.dispatch(
        createEnvelope('PANEL_MESSAGE', {
          text: '解释图片',
          selectedRegion: {
            text: '',
            links: [],
            codeBlocks: [],
            buttons: [],
            htmlOutline: '<img>',
            nearbyContext: '',
            needsVision: true,
            sourceUrl: 'https://github.com/example/charts',
            rect: { x: 10, y: 20, width: 200, height: 100 },
            viewport: { cssWidth: 800, cssHeight: 600 },
            scroll: { x: 0, y: 0 },
            devicePixelRatio: 1,
          },
        }),
        panelSender,
      ),
    ).rejects.toThrow(/视觉能力已在设置中关闭/);
    expect(captureRegion).not.toHaveBeenCalled();
    expect(streamAnswer).not.toHaveBeenCalled();
    expect(prepareSession).not.toHaveBeenCalled();
  });

  it('区域框选状态经 Background 从 active 推进到 selected', async () => {
    const emitRegionState = vi.fn();
    const region = {
      text: '足够的结构化内容'.repeat(12),
      links: [],
      codeBlocks: [],
      buttons: [],
      htmlOutline: '<p>',
      nearbyContext: 'README',
      needsVision: false,
      sourceUrl: 'https://github.com/openai/openai-node',
      rect: { x: 10, y: 20, width: 200, height: 100 },
      viewport: { cssWidth: 800, cssHeight: 600 },
      scroll: { x: 0, y: 0 },
      devicePixelRatio: 1,
    };
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(),
      streamAnswer: vi.fn(),
      startRegion: vi.fn(async () => ({ status: 'selected' as const, region })),
      cancelRegion: vi.fn(),
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitRegionState,
    });

    await bridge.dispatch(
      createEnvelope('PANEL_REGION_START', {}, { id: 'region-1' }),
      panelSender,
    );

    expect(emitRegionState).toHaveBeenNthCalledWith(1, { status: 'active' });
    expect(emitRegionState).toHaveBeenNthCalledWith(2, {
      status: 'selected',
      region,
    });
  });

  it('中文搜索经安全路由自动执行并把查询解释与结果推回 Panel', async () => {
    const emitSearchState = vi.fn();
    const search = vi.fn(async () => ({
      status: 'ok' as const,
      conversion: {
        naturalLanguage: 'Star 超过 1000 的 Python 项目',
        target: 'repositories' as const,
        query: 'language:Python stars:>1000',
        explanation: '搜索公开仓库；语言为 Python；Star >1000。',
      },
      totalCount: 1,
      items: [
        {
          kind: 'repository' as const,
          id: 1,
          title: 'octocat/demo',
          url: 'https://github.com/octocat/demo',
          language: 'Python',
          stars: 1_234,
          updatedAt: '2026-07-24T00:00:00.000Z',
          archived: false,
        },
      ],
    }));
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/explore',
        title: 'Explore',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: {
          url: 'https://github.com/explore',
          pageType: 'other' as const,
          isPrivate: false,
          extracted: {},
          capturedAt: '2026-07-24T00:00:00.000Z',
        },
      })),
      streamAnswer: vi.fn(),
      search,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSearchState,
    });

    await bridge.dispatch(
      createEnvelope(
        'PANEL_SEARCH',
        {
          naturalLanguage: 'Star 超过 1000 的 Python 项目',
          target: 'auto',
          providerId: 'deepseek',
        },
        { id: 'search-roundtrip' },
      ),
      panelSender,
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        naturalLanguage: 'Star 超过 1000 的 Python 项目',
        target: 'auto',
        manualProviderId: 'deepseek',
        requestId: 'search-roundtrip',
      }),
    );
    expect(emitSearchState).toHaveBeenNthCalledWith(1, {
      status: 'searching',
      requestId: 'search-roundtrip',
    });
    expect(emitSearchState).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'done',
        requestId: 'search-roundtrip',
        result: expect.objectContaining({ totalCount: 1 }),
      }),
    );
  });

  it('当前页面上下文暂不可用时仍可执行独立的公开 GitHub 搜索', async () => {
    const emitSearchState = vi.fn();
    const search = vi.fn(async () => ({
      status: 'ok' as const,
      conversion: {
        naturalLanguage: '适合新手的 TypeScript 项目',
        target: 'repositories' as const,
        query: '适合新手 language:TypeScript',
        explanation: '搜索公开仓库；语言为 TypeScript。',
      },
      totalCount: 1,
      items: [],
    }));
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => {
        throw new Error('当前 GitHub 页面尚未完成解析');
      }),
      streamAnswer: vi.fn(),
      search,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSearchState,
    });

    await bridge.dispatch(
      createEnvelope(
        'PANEL_SEARCH',
        {
          naturalLanguage: '适合新手的 TypeScript 项目',
          target: 'repositories',
        },
        { id: 'search-without-page' },
      ),
      panelSender,
    );

    expect(search).toHaveBeenCalledWith({
      naturalLanguage: '适合新手的 TypeScript 项目',
      target: 'repositories',
      page: undefined,
      manualProviderId: undefined,
      requestId: 'search-without-page',
      signal: expect.any(AbortSignal),
    });
    expect(emitSearchState).toHaveBeenLastCalledWith({
      status: 'done',
      requestId: 'search-without-page',
      result: expect.objectContaining({ totalCount: 1 }),
    });
  });

  it('当前页面明确为私有仓库时仍阻断搜索出站', async () => {
    const emitSearchState = vi.fn();
    const search = vi.fn();
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/example/private-repo',
        title: 'Private repository',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: {
          url: 'https://github.com/example/private-repo',
          pageType: 'repo' as const,
          repository: 'example/private-repo',
          isPrivate: true,
          extracted: {},
          capturedAt: '2026-07-24T00:00:00.000Z',
        },
      })),
      streamAnswer: vi.fn(),
      search,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSearchState,
    });

    await bridge.dispatch(
      createEnvelope(
        'PANEL_SEARCH',
        {
          naturalLanguage: 'TypeScript 项目',
          target: 'repositories',
        },
        { id: 'search-private-page' },
      ),
      panelSender,
    );

    expect(search).not.toHaveBeenCalled();
    expect(emitSearchState).toHaveBeenLastCalledWith({
      status: 'error',
      requestId: 'search-private-page',
      error: expect.stringMatching(/私有|禁止出站/u),
    });
  });

  it('搜索响应 Schema 异常时只向 Panel 返回安全中文错误', async () => {
    const emitSearchState = vi.fn();
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => {
        throw new Error('当前 GitHub 页面尚未完成解析');
      }),
      streamAnswer: vi.fn(),
      search: vi.fn(async () =>
        githubSearchResultSchema.parse({
          status: 'ok',
          conversion: {
            naturalLanguage: '声音克隆',
            target: 'repositories',
            query: '声音克隆',
            explanation: '搜索公开仓库。',
          },
          totalCount: 1,
          items: [
            {
              kind: 'repository',
              id: 1,
              title: 'example/repository',
              url: 'https://github.com/example/repository',
              description: 'x'.repeat(2_001),
              stars: 1,
              updatedAt: '2026-08-17T00:00:00.000Z',
              archived: false,
            },
          ],
        }),
      ),
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSearchState,
    });

    await bridge.dispatch(
      createEnvelope(
        'PANEL_SEARCH',
        { naturalLanguage: '声音克隆', target: 'repositories' },
        { id: 'search-invalid-response' },
      ),
      panelSender,
    );

    expect(emitSearchState).toHaveBeenLastCalledWith({
      status: 'error',
      requestId: 'search-invalid-response',
      error: 'GitHub 返回的数据格式异常，本次搜索未显示结果。',
    });
    expect(JSON.stringify(emitSearchState.mock.calls)).not.toMatch(/too_big|items|description/u);
  });

  it('一键仓库分析经当前 PageContext 执行并推回固定卡片', async () => {
    const emitRepositoryAnalysisState = vi.fn();
    const card = {
      repository: 'react/react',
      url: 'https://github.com/react/react',
      overview: {
        summary: 'React 帮你用组件构建用户界面。',
        highlights: ['适合构建 Web 界面'],
        source: 'provider' as const,
      },
      purpose: '用于构建用户界面。',
      details: {
        readmeSummary: 'React 是一个界面开发工具。',
        features: ['组件化界面'],
        configuration: ['项目通过 package.json 管理测试任务。'],
        implementation: ['核心代码位于 packages 目录。'],
      },
      sourceSummary: {
        readmeEvidence: '已读取 README.md；原文仅作为分析依据，不在这里重复展示。',
        readmeSections: ['章节：主要功能'],
        configuration: ['package.json：脚本 test'],
        implementation: ['packages：核心包目录'],
        source: 'readme' as const,
      },
      languages: [{ name: 'JavaScript', percent: 100 }],
      structure: {
        directories: ['packages'],
        keyFiles: [
          {
            path: 'package.json',
            role: '项目清单 / 构建配置',
            findings: ['项目名：react'],
          },
        ],
        truncated: true,
      },
      platforms: ['Web/Browser'],
      installation: { steps: ['npm install react'], source: 'readme' as const },
      release: null,
      activity: {},
      popularity: { stars: 240_000 },
      archived: false,
      license: { name: 'MIT License', spdxId: 'MIT' },
      issuesAndPullRequests: { openIssues: 1_000, openPullRequests: 100 },
      difficulty: { level: '入门' as const, reason: '标准 npm 安装。' },
      risks: ['需核对版本兼容性。'],
      nextSteps: ['阅读快速开始。'],
      generatedAt: '2026-07-24T00:00:00.000Z',
      sources: { dom: true, githubApi: true, provider: true },
    };
    const analyzeRepository = vi.fn(async () => card);
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/react/react',
        title: 'react/react',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: {
          url: 'https://github.com/react/react',
          pageType: 'repo' as const,
          repository: 'react/react',
          isPrivate: false,
          extracted: {},
          capturedAt: '2026-07-24T00:00:00.000Z',
        },
      })),
      streamAnswer: vi.fn(),
      analyzeRepository,
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitRepositoryAnalysisState,
    });

    await bridge.dispatch(
      createEnvelope(
        'PANEL_ANALYZE_REPOSITORY',
        { providerId: 'deepseek' },
        { id: 'analysis-roundtrip' },
      ),
      panelSender,
    );

    expect(analyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'deepseek',
        requestId: 'analysis-roundtrip',
      }),
    );
    expect(emitRepositoryAnalysisState).toHaveBeenNthCalledWith(1, {
      status: 'analyzing',
      requestId: 'analysis-roundtrip',
    });
    expect(emitRepositoryAnalysisState).toHaveBeenNthCalledWith(2, {
      status: 'done',
      requestId: 'analysis-roundtrip',
      card,
    });
  });
});
