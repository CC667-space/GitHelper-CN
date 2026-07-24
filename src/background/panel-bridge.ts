import {
  pageInfoSchema,
  panelAbortSchema,
  PANEL_PORT_NAME,
  panelMessageSchema,
  streamEventSchema,
  type PageInfo,
  type ProviderRuntimeView,
  type StreamEvent,
} from '../lib/bridge-protocol';
import { createEnvelope, MAX_MESSAGE_BYTES, parseEnvelope, type Envelope } from '../lib/messaging';
import { MessageRouter, type RouteContext } from './router';
import { sanitizeText } from './sanitizer';
import type { ProviderId } from '../lib/types';

export interface PanelBridgeDependencies {
  requestPageInfo(signal: AbortSignal): Promise<PageInfo>;
  streamAnswer(input: {
    requestId: string;
    question: string;
    page: PageInfo;
    providerId?: ProviderId;
    signal: AbortSignal;
  }): AsyncIterable<string>;
  abort(requestId: string): boolean;
  providerViews?(): Promise<ProviderRuntimeView[]>;
  emit(event: Envelope<StreamEvent>): void;
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
    this.emit({ requestId, kind: 'start' });
    const page = await this.dependencies.requestPageInfo(context.signal);
    this.emit({
      requestId,
      kind: 'context',
      text: page.title || page.url,
    });
    for await (const delta of this.dependencies.streamAnswer({
      requestId,
      question: message.text,
      page,
      providerId: message.providerId,
      signal: context.signal,
    })) {
      this.emit({ requestId, kind: 'delta', text: delta });
    }
    this.emit({ requestId, kind: 'done' });
    return { accepted: true, requestId };
  }

  private emit(event: StreamEvent): void {
    const validated = streamEventSchema.parse(event);
    this.dependencies.emit(createEnvelope('STREAM_EVENT', validated));
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
    const bridge = new PanelBridge(chrome.runtime.id, {
      requestPageInfo: requestActivePageInfo,
      streamAnswer: async function* (input) {
        if (!input.page.pageContext) {
          throw new Error('当前页面上下文尚未就绪');
        }
        yield* runtime.streamAnswer({
          requestId: input.requestId,
          question: input.question,
          pageContext: input.page.pageContext,
          manualProviderId: input.providerId,
          signal: input.signal,
        });
      },
      abort: (requestId) => runtime.abort(requestId),
      providerViews: () => runtime.views(),
      emit: (event) => port.postMessage(event),
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
      void bridge
        .dispatch(message, port.sender ?? {})
        .then((response) => port.postMessage(response))
        .catch((error: unknown) => port.postMessage(errorStreamEvent(error, requestId)));
    });
  });
}
