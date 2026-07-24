import { z } from 'zod';

import {
  MAX_MESSAGE_BYTES,
  createEnvelope,
  parseEnvelope,
  withTimeout,
  type Envelope,
} from '../lib/messaging';
import { isSensitiveFieldName } from './sanitizer';

export type RouteSource = 'content' | 'extension' | 'either';

export interface RouteContext {
  sender: chrome.runtime.MessageSender;
  signal: AbortSignal;
  requestId: string;
  type: string;
}

export interface RouteDefinition {
  payloadSchema: z.ZodType;
  source: RouteSource;
  handler(payload: unknown, context: RouteContext): Promise<unknown> | unknown;
}

export type RouteMap = Record<string, RouteDefinition>;

export class MessageSourceError extends Error {
  readonly code = 'INVALID_MESSAGE_SOURCE';

  constructor(message: string) {
    super(message);
    this.name = 'MessageSourceError';
  }
}

export class CredentialPayloadError extends Error {
  readonly code = 'CREDENTIAL_IN_MESSAGE';

  constructor() {
    super('普通消息载荷禁止包含凭据字段');
    this.name = 'CredentialPayloadError';
  }
}

function senderUrl(sender: chrome.runtime.MessageSender): string | undefined {
  return sender.url ?? sender.tab?.url;
}

export function assertMessageSource(
  sender: chrome.runtime.MessageSender,
  expected: RouteSource,
  runtimeId: string,
): void {
  if (sender.id !== runtimeId) {
    throw new MessageSourceError('消息 sender.id 不属于本扩展');
  }
  const value = senderUrl(sender);
  const isExtension =
    typeof value === 'string' && value.startsWith(`chrome-extension://${runtimeId}/`);
  let isContent = false;
  if (sender.tab && typeof value === 'string') {
    try {
      const url = new URL(value);
      isContent =
        url.protocol === 'https:' &&
        url.hostname === 'github.com' &&
        (sender.frameId === undefined || sender.frameId === 0);
    } catch {
      isContent = false;
    }
  }
  if (
    (expected === 'content' && !isContent) ||
    (expected === 'extension' && !isExtension) ||
    (expected === 'either' && !isContent && !isExtension)
  ) {
    throw new MessageSourceError(`消息来源不符合路由要求：${expected}`);
  }
}

function hasCredentialField(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasCredentialField);
  }
  return Object.entries(value).some(
    ([key, item]) => isSensitiveFieldName(key) || hasCredentialField(item),
  );
}

export class MessageRouter {
  constructor(
    private readonly routes: RouteMap,
    private readonly runtimeId: string,
    private readonly options = {
      maxPayloadBytes: MAX_MESSAGE_BYTES,
      timeoutMs: 15_000,
    },
  ) {}

  async dispatch(raw: unknown, sender: chrome.runtime.MessageSender): Promise<Envelope<unknown>> {
    const base = parseEnvelope(raw, z.unknown(), {
      maxBytes: this.options.maxPayloadBytes,
    });
    if (hasCredentialField(base.payload)) {
      throw new CredentialPayloadError();
    }
    const route = this.routes[base.type];
    if (!route) {
      throw new Error(`未注册消息类型：${base.type}`);
    }
    assertMessageSource(sender, route.source, this.runtimeId);
    const envelope = parseEnvelope(raw, route.payloadSchema, {
      expectedType: base.type,
      maxBytes: this.options.maxPayloadBytes,
    });
    const controller = new AbortController();
    const result = await withTimeout(
      Promise.resolve(
        route.handler(envelope.payload, {
          sender,
          signal: controller.signal,
          requestId: envelope.id,
          type: envelope.type,
        }),
      ),
      this.options.timeoutMs,
    ).catch((error: unknown) => {
      controller.abort(error);
      throw error;
    });
    return createEnvelope(`${base.type}:response`, result, {
      id: base.id,
      maxBytes: this.options.maxPayloadBytes,
    });
  }
}

export function registerRuntimeRouter(router: MessageRouter): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void router
      .dispatch(message, sender)
      .then((response) => sendResponse({ ok: true, response }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: {
            name: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    return true;
  });
}
