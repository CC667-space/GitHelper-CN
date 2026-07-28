import {
  contentPickCancelSchema,
  contentPickCancelResponseSchema,
  contentPickStartSchema,
  contentRegionCancelResponseSchema,
  contentRegionCancelSchema,
  contentRegionStartSchema,
  pageInfoSchema,
  panelPickCancelSchema,
  panelPickStartSchema,
  panelPickStateSchema,
  panelRegionCancelSchema,
  panelRegionStartSchema,
  panelRegionStateSchema,
  panelSearchRequestSchema,
  panelSearchStateSchema,
  panelOpenGitHubPageSchema,
  panelAnalyzeRepositoryRequestSchema,
  panelRepositoryAnalysisStateSchema,
  panelSessionStateSchema,
  panelSessionNewSchema,
  panelSessionSelectSchema,
  panelSessionDeleteSchema,
  panelTurnDeleteSchema,
  panelAbortSchema,
  PANEL_PORT_NAME,
  panelMessageSchema,
  pickOutcomeSchema,
  regionOutcomeSchema,
  streamEventSchema,
  type PageInfo,
  type PanelSessionState,
  type PanelPickState,
  type PanelRegionState,
  type PanelSearchState,
  type PanelRepositoryAnalysisState,
  type PickOutcome,
  type RegionOutcome,
  type ProviderRuntimeView,
  type StreamEvent,
} from '../lib/bridge-protocol';
import { createEnvelope, MAX_MESSAGE_BYTES, parseEnvelope, type Envelope } from '../lib/messaging';
import { MessageRouter, type RouteContext } from './router';
import { sanitizeText } from './sanitizer';
import type {
  Message,
  ProviderId,
  SelectedElement,
  SelectedRegion,
  Session,
  UserPreferences,
} from '../lib/types';
import { captureSelectedRegion } from './capture';
import { preferencesStore } from './prefs-store';
import { sessionStore } from './session-store';
import type { GitHubSearchResult, SearchTarget } from '../lib/github-search';
import { GitHubSearchExecutor } from './tools/executors';
import { assertPublicContext } from './outbound-policy';
import type { RepositoryAnalysisCard } from '../lib/repository-analysis';
import { RepositoryAnalysisExecutor } from './repository-analysis';
import { GitHubApiClient } from './github-api';
import { activePanelSessionStore } from './active-session-store';

interface PreparedPanelSession {
  sessionId: string;
  history: Message[];
  historySummary?: string;
  preferences: UserPreferences;
  snapshot: PanelSessionState;
}

export interface PanelBridgeDependencies {
  requestPageInfo(signal: AbortSignal): Promise<PageInfo>;
  streamAnswer(input: {
    requestId: string;
    question: string;
    page: PageInfo;
    providerId?: ProviderId;
    history?: Message[];
    historySummary?: string;
    preferences?: UserPreferences;
    selectedElement?: SelectedElement;
    selectedRegion?: SelectedRegion;
    needsVision?: boolean;
    images?: string[];
    signal: AbortSignal;
  }): AsyncIterable<string>;
  prepareSession?(
    page: PageInfo,
    question: string,
    preferences?: UserPreferences,
    selection?: { sessionId?: string; startNew?: boolean },
  ): Promise<PreparedPanelSession>;
  changeSession?(
    action: { kind: 'select'; sessionId: string } | { kind: 'new' },
  ): Promise<PanelSessionState>;
  deleteTurn?(sessionId: string, userMessageId: string): Promise<PanelSessionState>;
  deleteSession?(sessionId: string): Promise<PanelSessionState>;
  loadPreferences?(): Promise<UserPreferences>;
  saveAssistant?(sessionId: string, content: string): Promise<void>;
  startPick?(signal: AbortSignal): Promise<PickOutcome>;
  cancelPick?(): Promise<void>;
  startRegion?(signal: AbortSignal): Promise<RegionOutcome>;
  cancelRegion?(): Promise<void>;
  captureRegion?(region: SelectedRegion, signal: AbortSignal): Promise<string>;
  search?(input: {
    naturalLanguage: string;
    target: SearchTarget;
    page?: PageInfo;
    signal: AbortSignal;
  }): Promise<GitHubSearchResult>;
  analyzeRepository?(input: {
    page: PageInfo;
    providerId?: ProviderId;
    requestId: string;
    signal: AbortSignal;
  }): Promise<RepositoryAnalysisCard>;
  openGitHubPage?(url: string): Promise<void>;
  abort(requestId: string): boolean;
  providerViews?(): Promise<ProviderRuntimeView[]>;
  emit(event: Envelope<StreamEvent>): void;
  emitSessionState?(state: PanelSessionState): void;
  emitPickState?(state: PanelPickState): void;
  emitRegionState?(state: PanelRegionState): void;
  emitSearchState?(state: PanelSearchState): void;
  emitRepositoryAnalysisState?(state: PanelRepositoryAnalysisState): void;
}

export class PanelBridge {
  private readonly router: MessageRouter;

  constructor(
    runtimeId: string,
    private readonly dependencies: PanelBridgeDependencies,
  ) {
    this.router = new MessageRouter(
      {
        PANEL_MESSAGE: {
          source: 'extension',
          payloadSchema: panelMessageSchema,
          handler: (payload, context) => this.handlePanelMessage(payload, context),
        },
        PANEL_ABORT: {
          source: 'extension',
          payloadSchema: panelAbortSchema,
          handler: (payload) => {
            const request = panelAbortSchema.parse(payload);
            return { aborted: this.dependencies.abort(request.requestId) };
          },
        },
        PANEL_SESSION_SELECT: {
          source: 'extension',
          payloadSchema: panelSessionSelectSchema,
          handler: async (payload) => {
            const { sessionId } = panelSessionSelectSchema.parse(payload);
            return await this.handleSessionChange({ kind: 'select', sessionId });
          },
        },
        PANEL_SESSION_NEW: {
          source: 'extension',
          payloadSchema: panelSessionNewSchema,
          handler: async () => await this.handleSessionChange({ kind: 'new' }),
        },
        PANEL_TURN_DELETE: {
          source: 'extension',
          payloadSchema: panelTurnDeleteSchema,
          handler: async (payload) => {
            if (!this.dependencies.deleteTurn || !this.dependencies.emitSessionState) {
              throw new Error('问答删除能力尚未注册');
            }
            const { sessionId, userMessageId } = panelTurnDeleteSchema.parse(payload);
            const state = panelSessionStateSchema.parse(
              await this.dependencies.deleteTurn(sessionId, userMessageId),
            );
            this.dependencies.emitSessionState(state);
            return { deleted: true };
          },
        },
        PANEL_SESSION_DELETE: {
          source: 'extension',
          payloadSchema: panelSessionDeleteSchema,
          handler: async (payload) => {
            if (!this.dependencies.deleteSession || !this.dependencies.emitSessionState) {
              throw new Error('会话删除能力尚未注册');
            }
            const { sessionId } = panelSessionDeleteSchema.parse(payload);
            const state = panelSessionStateSchema.parse(
              await this.dependencies.deleteSession(sessionId),
            );
            this.dependencies.emitSessionState(state);
            return { deleted: true };
          },
        },
        PANEL_PICK_START: {
          source: 'extension',
          payloadSchema: panelPickStartSchema,
          handler: (_payload, context) => this.handlePickStart(context),
        },
        PANEL_PICK_CANCEL: {
          source: 'extension',
          payloadSchema: panelPickCancelSchema,
          handler: async () => {
            await this.dependencies.cancelPick?.();
            return { cancelled: true };
          },
        },
        PANEL_REGION_START: {
          source: 'extension',
          payloadSchema: panelRegionStartSchema,
          handler: (_payload, context) => this.handleRegionStart(context),
        },
        PANEL_REGION_CANCEL: {
          source: 'extension',
          payloadSchema: panelRegionCancelSchema,
          handler: async () => {
            await this.dependencies.cancelRegion?.();
            return { cancelled: true };
          },
        },
        PANEL_SEARCH: {
          source: 'extension',
          payloadSchema: panelSearchRequestSchema,
          handler: (payload, context) => this.handleSearch(payload, context),
        },
        PANEL_OPEN_GITHUB_PAGE: {
          source: 'extension',
          payloadSchema: panelOpenGitHubPageSchema,
          handler: async (payload) => {
            if (!this.dependencies.openGitHubPage) {
              throw new Error('GitHub 页面打开能力尚未注册');
            }
            const { url } = panelOpenGitHubPageSchema.parse(payload);
            await this.dependencies.openGitHubPage(url);
            return { opened: true };
          },
        },
        PANEL_ANALYZE_REPOSITORY: {
          source: 'extension',
          payloadSchema: panelAnalyzeRepositoryRequestSchema,
          handler: (payload, context) => this.handleRepositoryAnalysis(payload, context),
        },
      },
      runtimeId,
      { maxPayloadBytes: MAX_MESSAGE_BYTES, timeoutMs: 90_000 },
    );
  }

  dispatch(raw: unknown, sender: chrome.runtime.MessageSender): Promise<Envelope<unknown>> {
    return this.router.dispatch(raw, sender);
  }

  private async handlePanelMessage(payload: unknown, context: RouteContext): Promise<unknown> {
    const message = panelMessageSchema.parse(payload);
    const sanitizedQuestion = sanitizeText(message.text).value;
    const requestId = context.requestId;
    const page = await this.dependencies.requestPageInfo(context.signal);
    if (page.pageContext) {
      assertPublicContext(page.pageContext);
    }
    const selectedElement =
      message.selectedElement?.sourceUrl && message.selectedElement.sourceUrl !== page.url
        ? undefined
        : message.selectedElement;
    if (message.selectedElement && !selectedElement) {
      this.dependencies.emitPickState?.({
        status: 'cancelled',
        reason: '页面已变化，旧的元素选择未发送',
      });
    }
    const selectedRegion =
      message.selectedRegion?.sourceUrl && message.selectedRegion.sourceUrl !== page.url
        ? undefined
        : message.selectedRegion;
    if (message.selectedRegion && !selectedRegion) {
      this.dependencies.emitRegionState?.({
        status: 'cancelled',
        reason: '页面已变化，旧的区域框选未发送',
      });
    }
    const currentPreferences =
      selectedRegion?.needsVision && this.dependencies.loadPreferences
        ? await this.dependencies.loadPreferences()
        : undefined;
    if (selectedRegion?.needsVision && currentPreferences?.visionEnabled === false) {
      throw new Error('视觉能力已在设置中关闭；请启用后重新框选');
    }
    const prepared = await this.dependencies.prepareSession?.(
      page,
      sanitizedQuestion,
      currentPreferences,
      {
        sessionId: message.sessionId,
        startNew: message.startNewSession,
      },
    );
    if (prepared) {
      this.dependencies.emitSessionState?.(prepared.snapshot);
    }
    this.emit({ requestId, kind: 'start' });
    this.emit({
      requestId,
      kind: 'context',
      text: page.title || page.url,
    });
    const needsVision = selectedRegion?.needsVision ?? false;
    if (needsVision && prepared?.preferences.visionEnabled === false) {
      throw new Error('视觉能力已在设置中关闭；请启用后重新框选');
    }
    const images =
      needsVision && selectedRegion
        ? [await this.requireCaptureRegion(selectedRegion, context.signal)]
        : undefined;
    let answer = '';
    for await (const delta of this.dependencies.streamAnswer({
      requestId,
      question: sanitizedQuestion,
      page,
      providerId: message.providerId,
      history: prepared?.history,
      historySummary: prepared?.historySummary,
      preferences: prepared?.preferences,
      selectedElement,
      selectedRegion,
      needsVision,
      images,
      signal: context.signal,
    })) {
      answer += delta;
      this.emit({ requestId, kind: 'delta', text: delta });
    }
    if (prepared && this.dependencies.saveAssistant) {
      await this.dependencies.saveAssistant(prepared.sessionId, answer);
    }
    this.emit({ requestId, kind: 'done' });
    return { accepted: true, requestId };
  }

  private emit(event: StreamEvent): void {
    const validated = streamEventSchema.parse(event);
    this.dependencies.emit(createEnvelope('STREAM_EVENT', validated));
  }

  private async handleSessionChange(
    action: { kind: 'select'; sessionId: string } | { kind: 'new' },
  ): Promise<{ changed: true }> {
    if (!this.dependencies.changeSession || !this.dependencies.emitSessionState) {
      throw new Error('会话切换能力尚未注册');
    }
    const state = panelSessionStateSchema.parse(await this.dependencies.changeSession(action));
    this.dependencies.emitSessionState(state);
    return { changed: true };
  }

  private async handlePickStart(context: RouteContext): Promise<PickOutcome> {
    if (!this.dependencies.startPick || !this.dependencies.emitPickState) {
      throw new Error('点击选择能力尚未注册');
    }
    this.dependencies.emitPickState({ status: 'active' });
    const cancelOnAbort = () => {
      void this.dependencies.cancelPick?.();
    };
    context.signal.addEventListener('abort', cancelOnAbort, { once: true });
    try {
      const outcome = pickOutcomeSchema.parse(await this.dependencies.startPick(context.signal));
      this.dependencies.emitPickState(outcome);
      return outcome;
    } catch (error: unknown) {
      this.dependencies.emitPickState({
        status: 'cancelled',
        reason: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      });
      throw error;
    } finally {
      context.signal.removeEventListener('abort', cancelOnAbort);
    }
  }

  private async handleRegionStart(context: RouteContext): Promise<RegionOutcome> {
    if (!this.dependencies.startRegion || !this.dependencies.emitRegionState) {
      throw new Error('区域框选能力尚未注册');
    }
    this.dependencies.emitRegionState({ status: 'active' });
    const cancelOnAbort = () => {
      void this.dependencies.cancelRegion?.();
    };
    context.signal.addEventListener('abort', cancelOnAbort, { once: true });
    try {
      const outcome = regionOutcomeSchema.parse(
        await this.dependencies.startRegion(context.signal),
      );
      this.dependencies.emitRegionState(outcome);
      return outcome;
    } catch (error: unknown) {
      this.dependencies.emitRegionState({
        status: 'cancelled',
        reason: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      });
      throw error;
    } finally {
      context.signal.removeEventListener('abort', cancelOnAbort);
    }
  }

  private requireCaptureRegion(region: SelectedRegion, signal: AbortSignal): Promise<string> {
    if (!this.dependencies.captureRegion) {
      throw new Error('可信截图能力尚未注册');
    }
    return this.dependencies.captureRegion(region, signal);
  }

  private async handleSearch(payload: unknown, context: RouteContext): Promise<unknown> {
    const request = panelSearchRequestSchema.parse(payload);
    if (!this.dependencies.search || !this.dependencies.emitSearchState) {
      throw new Error('GitHub 搜索能力尚未注册');
    }
    this.dependencies.emitSearchState({
      status: 'searching',
      requestId: context.requestId,
    });
    try {
      let page: PageInfo | undefined;
      let currentPage: PageInfo | undefined;
      try {
        currentPage = await this.dependencies.requestPageInfo(context.signal);
      } catch (error: unknown) {
        if (context.signal.aborted) {
          throw error;
        }
      }
      if (currentPage?.pageContext) {
        assertPublicContext(currentPage.pageContext);
        page = currentPage;
      }
      const result = await this.dependencies.search({
        ...request,
        page,
        signal: context.signal,
      });
      this.dependencies.emitSearchState({
        status: 'done',
        requestId: context.requestId,
        result,
      });
      return { accepted: true, requestId: context.requestId };
    } catch (error: unknown) {
      const message = sanitizeText(
        error instanceof Error ? error.message : String(error),
      ).value.slice(0, 1_000);
      this.dependencies.emitSearchState({
        status: 'error',
        requestId: context.requestId,
        error: message,
      });
      return { accepted: false, requestId: context.requestId };
    }
  }

  private async handleRepositoryAnalysis(
    payload: unknown,
    context: RouteContext,
  ): Promise<unknown> {
    const request = panelAnalyzeRepositoryRequestSchema.parse(payload);
    if (!this.dependencies.analyzeRepository || !this.dependencies.emitRepositoryAnalysisState) {
      throw new Error('仓库分析能力尚未注册');
    }
    this.dependencies.emitRepositoryAnalysisState({
      status: 'analyzing',
      requestId: context.requestId,
    });
    try {
      const page = await this.dependencies.requestPageInfo(context.signal);
      if (!page.pageContext) {
        throw new Error('当前页面上下文尚未就绪');
      }
      assertPublicContext(page.pageContext);
      const card = await this.dependencies.analyzeRepository({
        page,
        providerId: request.providerId,
        requestId: context.requestId,
        signal: context.signal,
      });
      this.dependencies.emitRepositoryAnalysisState({
        status: 'done',
        requestId: context.requestId,
        card,
      });
      return { accepted: true, requestId: context.requestId };
    } catch (error: unknown) {
      const message = sanitizeText(
        error instanceof Error ? error.message : String(error),
      ).value.slice(0, 1_000);
      this.dependencies.emitRepositoryAnalysisState({
        status: 'error',
        requestId: context.requestId,
        error: message,
      });
      return { accepted: false, requestId: context.requestId };
    }
  }
}

export async function requestActivePageInfo(signal: AbortSignal): Promise<PageInfo> {
  if (signal.aborted) {
    throw signal.reason;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url?.startsWith('https://github.com/')) {
    throw new Error('当前活动标签页不是可读取的 GitHub 页面');
  }
  const request = createEnvelope('PAGE_INFO_REQUEST', {});
  const abortPromise = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const raw = await Promise.race([chrome.tabs.sendMessage(tab.id, request), abortPromise]);
  const response = parseEnvelope(raw, pageInfoSchema, {
    expectedType: 'PAGE_INFO_RESPONSE',
  });
  if (response.id !== request.id) {
    throw new Error('Content 响应 request ID 不匹配');
  }
  return response.payload;
}

async function activeGitHubTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url?.startsWith('https://github.com/')) {
    throw new Error('当前活动标签页不是可读取的 GitHub 页面');
  }
  return tab;
}

export async function requestActivePagePick(signal: AbortSignal): Promise<PickOutcome> {
  if (signal.aborted) {
    throw signal.reason;
  }
  const tab = await activeGitHubTab();
  const request = createEnvelope('PICK_START_REQUEST', contentPickStartSchema.parse({}));
  const abortPromise = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const raw = await Promise.race([chrome.tabs.sendMessage(tab.id!, request), abortPromise]);
  const response = parseEnvelope(raw, pickOutcomeSchema, {
    expectedType: 'PICK_START_RESPONSE',
  });
  if (response.id !== request.id) {
    throw new Error('Content 点击选择响应 request ID 不匹配');
  }
  return response.payload;
}

export async function cancelActivePagePick(): Promise<void> {
  const tab = await activeGitHubTab();
  const request = createEnvelope('PICK_CANCEL_REQUEST', contentPickCancelSchema.parse({}));
  const raw = await chrome.tabs.sendMessage(tab.id!, request);
  const response = parseEnvelope(raw, contentPickCancelResponseSchema, {
    expectedType: 'PICK_CANCEL_RESPONSE',
  });
  if (response.id !== request.id) {
    throw new Error('Content 取消选择响应 request ID 不匹配');
  }
}

export async function requestActivePageRegion(signal: AbortSignal): Promise<RegionOutcome> {
  if (signal.aborted) {
    throw signal.reason;
  }
  const tab = await activeGitHubTab();
  const request = createEnvelope('REGION_START_REQUEST', contentRegionStartSchema.parse({}));
  const abortPromise = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const raw = await Promise.race([chrome.tabs.sendMessage(tab.id!, request), abortPromise]);
  const response = parseEnvelope(raw, regionOutcomeSchema, {
    expectedType: 'REGION_START_RESPONSE',
  });
  if (response.id !== request.id) {
    throw new Error('Content 区域框选响应 request ID 不匹配');
  }
  return response.payload;
}

export async function cancelActivePageRegion(): Promise<void> {
  const tab = await activeGitHubTab();
  const request = createEnvelope('REGION_CANCEL_REQUEST', contentRegionCancelSchema.parse({}));
  const raw = await chrome.tabs.sendMessage(tab.id!, request);
  const response = parseEnvelope(raw, contentRegionCancelResponseSchema, {
    expectedType: 'REGION_CANCEL_RESPONSE',
  });
  if (response.id !== request.id) {
    throw new Error('Content 取消框选响应 request ID 不匹配');
  }
}

export async function captureActivePageRegion(
  region: SelectedRegion,
  signal: AbortSignal,
): Promise<string> {
  const tab = await activeGitHubTab();
  if (region.sourceUrl && tab.url !== region.sourceUrl) {
    throw new Error('活动页面已变化，拒绝截取旧区域');
  }
  return await captureSelectedRegion(tab, region, signal);
}

function errorStreamEvent(error: unknown, requestId?: string): Envelope<StreamEvent> {
  return createEnvelope('STREAM_EVENT', {
    requestId: requestId ?? crypto.randomUUID(),
    kind: 'error',
    text: sanitizeText(error instanceof Error ? error.message : String(error)).value,
  });
}

export function registerPanelPortBridge(
  runtime: import('./provider-runtime').ProviderRuntime,
): void {
  const githubApi = new GitHubApiClient();
  const searchExecutor = new GitHubSearchExecutor(githubApi);
  const repositoryAnalyzer = new RepositoryAnalysisExecutor(
    githubApi,
    async (facts, signal, manualProviderId, requestId) =>
      await runtime.generateRepositoryInsights({
        requestId: requestId ?? crypto.randomUUID(),
        facts,
        manualProviderId,
        signal,
      }),
  );
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT_NAME) {
      port.disconnect();
      return;
    }
    const sessions = sessionStore();
    const activeSession = activePanelSessionStore();
    const preferences = preferencesStore();
    const panelState = async (
      session: Session | undefined,
      cause: NonNullable<PanelSessionState['cause']>,
    ): Promise<PanelSessionState> =>
      panelSessionStateSchema.parse({
        ...sessions.panelSnapshot(session),
        cause,
        recentSessions: await sessions.listSummaries(),
      });
    const bridge = new PanelBridge(chrome.runtime.id, {
      requestPageInfo: requestActivePageInfo,
      loadPreferences: () => preferences.read(),
      prepareSession: async (page, question, currentPreferences, selection) => {
        if (!page.pageContext) {
          throw new Error('当前页面上下文尚未就绪');
        }
        const prepared = await sessions.prepare(page.pageContext, question, selection);
        await activeSession.write(prepared.session.sessionId);
        return {
          sessionId: prepared.session.sessionId,
          history: prepared.history,
          historySummary: prepared.historySummary,
          preferences: currentPreferences ?? (await preferences.read()),
          snapshot: await panelState(prepared.session, 'update'),
        };
      },
      changeSession: async (action) => {
        if (action.kind === 'new') {
          await activeSession.clear();
          return await panelState(undefined, 'new');
        }
        const session = await sessions.get(action.sessionId);
        if (!session) {
          throw new Error('所选会话不存在或已过期');
        }
        await activeSession.write(session.sessionId);
        return await panelState(session, 'select');
      },
      deleteTurn: async (sessionId, userMessageId) => {
        if (!(await sessions.deleteExchange(sessionId, userMessageId))) {
          throw new Error('要删除的问答不存在或已过期');
        }
        return await panelState(await sessions.get(sessionId), 'update');
      },
      deleteSession: async (sessionId) => {
        if (!(await sessions.delete(sessionId))) {
          throw new Error('要删除的会话不存在或已过期');
        }
        const activeSessionId = await activeSession.read();
        if (activeSessionId === sessionId) {
          await activeSession.clear();
          return await panelState(undefined, 'new');
        }
        const current = activeSessionId ? await sessions.get(activeSessionId) : undefined;
        if (activeSessionId && !current) {
          await activeSession.clear();
        }
        return await panelState(current, current ? 'update' : 'new');
      },
      saveAssistant: async (sessionId, content) => {
        await sessions.appendAssistant(sessionId, content);
      },
      startPick: requestActivePagePick,
      cancelPick: cancelActivePagePick,
      startRegion: requestActivePageRegion,
      cancelRegion: cancelActivePageRegion,
      captureRegion: captureActivePageRegion,
      search: async ({ naturalLanguage, target, page, signal }) => {
        if (page?.pageContext) {
          assertPublicContext(page.pageContext);
        }
        return await searchExecutor.search({
          naturalLanguage,
          target,
          page: page?.pageContext,
          signal,
        });
      },
      analyzeRepository: async ({ page, providerId, requestId, signal }) => {
        if (!page.pageContext) {
          throw new Error('当前页面上下文尚未就绪');
        }
        assertPublicContext(page.pageContext);
        return await repositoryAnalyzer.analyze({
          page: page.pageContext,
          manualProviderId: providerId,
          requestId,
          signal,
        });
      },
      openGitHubPage: async (url) => {
        await chrome.tabs.create({ url });
      },
      streamAnswer: async function* (input) {
        if (!input.page.pageContext) {
          throw new Error('当前页面上下文尚未就绪');
        }
        yield* runtime.streamAnswer({
          requestId: input.requestId,
          question: input.question,
          pageContext: input.page.pageContext,
          manualProviderId: input.providerId,
          history: input.history,
          historySummary: input.historySummary,
          preferences: input.preferences,
          selectedElement: input.selectedElement,
          selectedRegion: input.selectedRegion,
          needsVision: input.needsVision,
          images: input.images,
          signal: input.signal,
        });
      },
      abort: (requestId) => runtime.abort(requestId),
      providerViews: () => runtime.views(),
      emit: (event) => port.postMessage(event),
      emitSessionState: (state) =>
        port.postMessage(createEnvelope('SESSION_STATE', panelSessionStateSchema.parse(state))),
      emitPickState: (state) =>
        port.postMessage(createEnvelope('PICK_STATE', panelPickStateSchema.parse(state))),
      emitRegionState: (state) =>
        port.postMessage(createEnvelope('REGION_STATE', panelRegionStateSchema.parse(state))),
      emitSearchState: (state) =>
        port.postMessage(createEnvelope('SEARCH_STATE', panelSearchStateSchema.parse(state))),
      emitRepositoryAnalysisState: (state) =>
        port.postMessage(
          createEnvelope(
            'REPOSITORY_ANALYSIS_STATE',
            panelRepositoryAnalysisStateSchema.parse(state),
          ),
        ),
    });
    const hydration = requestActivePageInfo(new AbortController().signal)
      .then(async (page) => {
        const activeSessionId = await activeSession.read();
        const active = activeSessionId ? await sessions.get(activeSessionId) : undefined;
        if (activeSessionId && !active) {
          await activeSession.clear();
        }
        const session =
          active ?? (page.pageContext ? await sessions.findForPage(page.pageContext) : undefined);
        port.postMessage(createEnvelope('SESSION_STATE', await panelState(session, 'hydrate')));
      })
      .catch(() => undefined);
    port.onDisconnect.addListener(() => {
      void cancelActivePagePick().catch(() => undefined);
      void cancelActivePageRegion().catch(() => undefined);
    });
    void runtime
      .views()
      .then((providers) => port.postMessage(createEnvelope('PROVIDER_STATE', { providers })))
      .catch((error: unknown) => port.postMessage(errorStreamEvent(error)));
    port.onMessage.addListener((message) => {
      const requestId =
        typeof (message as { id?: unknown } | null)?.id === 'string' &&
        (message as { id: string }).id.length <= 128
          ? (message as { id: string }).id
          : undefined;
      void hydration
        .then(() => bridge.dispatch(message, port.sender ?? {}))
        .then((response) => port.postMessage(response))
        .catch((error: unknown) => port.postMessage(errorStreamEvent(error, requestId)));
    });
  });
}
