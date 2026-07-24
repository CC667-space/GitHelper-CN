import {
  contentPickCancelSchema,
  contentPickCancelResponseSchema,
  contentPickStartSchema,
  pageInfoSchema,
  panelPickCancelSchema,
  panelPickStartSchema,
  panelPickStateSchema,
  panelSessionStateSchema,
  panelAbortSchema,
  PANEL_PORT_NAME,
  panelMessageSchema,
  pickOutcomeSchema,
  streamEventSchema,
  type PageInfo,
  type PanelSessionState,
  type PanelPickState,
  type PickOutcome,
  type ProviderRuntimeView,
  type StreamEvent,
} from '../lib/bridge-protocol';
import { createEnvelope, MAX_MESSAGE_BYTES, parseEnvelope, type Envelope } from '../lib/messaging';
import { MessageRouter, type RouteContext } from './router';
import { sanitizeText } from './sanitizer';
import type { Message, ProviderId, SelectedElement, UserPreferences } from '../lib/types';
import { preferencesStore } from './prefs-store';
import { sessionStore } from './session-store';

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
    signal: AbortSignal;
  }): AsyncIterable<string>;
  prepareSession?(page: PageInfo, question: string): Promise<PreparedPanelSession>;
  saveAssistant?(sessionId: string, content: string): Promise<void>;
  startPick?(signal: AbortSignal): Promise<PickOutcome>;
  cancelPick?(): Promise<void>;
  abort(requestId: string): boolean;
  providerViews?(): Promise<ProviderRuntimeView[]>;
  emit(event: Envelope<StreamEvent>): void;
  emitSessionState?(state: PanelSessionState): void;
  emitPickState?(state: PanelPickState): void;
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
    const requestId = context.requestId;
    const page = await this.dependencies.requestPageInfo(context.signal);
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
    const prepared = await this.dependencies.prepareSession?.(page, message.text);
    if (prepared) {
      this.dependencies.emitSessionState?.(prepared.snapshot);
    }
    this.emit({ requestId, kind: 'start' });
    this.emit({
      requestId,
      kind: 'context',
      text: page.title || page.url,
    });
    let answer = '';
    for await (const delta of this.dependencies.streamAnswer({
      requestId,
      question: message.text,
      page,
      providerId: message.providerId,
      history: prepared?.history,
      historySummary: prepared?.historySummary,
      preferences: prepared?.preferences,
      selectedElement,
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
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT_NAME) {
      port.disconnect();
      return;
    }
    const sessions = sessionStore();
    const preferences = preferencesStore();
    const bridge = new PanelBridge(chrome.runtime.id, {
      requestPageInfo: requestActivePageInfo,
      prepareSession: async (page, question) => {
        if (!page.pageContext) {
          throw new Error('当前页面上下文尚未就绪');
        }
        const prepared = await sessions.prepare(page.pageContext, question);
        return {
          sessionId: prepared.session.sessionId,
          history: prepared.history,
          historySummary: prepared.historySummary,
          preferences: await preferences.read(),
          snapshot: panelSessionStateSchema.parse(sessions.panelSnapshot(prepared.session)),
        };
      },
      saveAssistant: async (sessionId, content) => {
        await sessions.appendAssistant(sessionId, content);
      },
      startPick: requestActivePagePick,
      cancelPick: cancelActivePagePick,
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
    });
    const hydration = requestActivePageInfo(new AbortController().signal)
      .then(async (page) => {
        const session = page.pageContext ? await sessions.findForPage(page.pageContext) : undefined;
        port.postMessage(
          createEnvelope(
            'SESSION_STATE',
            panelSessionStateSchema.parse(sessions.panelSnapshot(session)),
          ),
        );
      })
      .catch(() => undefined);
    port.onDisconnect.addListener(() => {
      void cancelActivePagePick().catch(() => undefined);
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
