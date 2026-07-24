import {
  pageInfoSchema,
  PANEL_PORT_NAME,
  panelMessageSchema,
  streamEventSchema,
  type PageInfo,
  type StreamEvent,
} from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope, type Envelope } from '../lib/messaging';
import { MessageRouter, type RouteContext } from './router';
import { sanitizeText } from './sanitizer';

export interface PanelBridgeDependencies {
  requestPageInfo(signal: AbortSignal): Promise<PageInfo>;
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
      },
      runtimeId,
    );
  }

  dispatch(raw: unknown, sender: chrome.runtime.MessageSender): Promise<Envelope<unknown>> {
    return this.router.dispatch(raw, sender);
  }

  private async handlePanelMessage(payload: unknown, context: RouteContext): Promise<unknown> {
    const message = panelMessageSchema.parse(payload);
    const requestId = crypto.randomUUID();
    this.emit({ requestId, kind: 'start' });
    const page = await this.dependencies.requestPageInfo(context.signal);
    this.emit({
      requestId,
      kind: 'context',
      text: page.title || page.url,
    });
    this.emit({
      requestId,
      kind: 'delta',
      text: `已收到“${message.text}”，当前页面信息往返成功。`,
    });
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

function errorStreamEvent(error: unknown): Envelope<StreamEvent> {
  return createEnvelope('STREAM_EVENT', {
    requestId: crypto.randomUUID(),
    kind: 'error',
    text: sanitizeText(error instanceof Error ? error.message : String(error)).value,
  });
}

export function registerPanelPortBridge(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT_NAME) {
      port.disconnect();
      return;
    }
    const bridge = new PanelBridge(chrome.runtime.id, {
      requestPageInfo: requestActivePageInfo,
      emit: (event) => port.postMessage(event),
    });
    port.onMessage.addListener((message) => {
      void bridge
        .dispatch(message, port.sender ?? {})
        .then((response) => port.postMessage(response))
        .catch((error: unknown) => port.postMessage(errorStreamEvent(error)));
    });
  });
}
