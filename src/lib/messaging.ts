import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const DEFAULT_MESSAGE_TIMEOUT_MS = 15_000;

export interface Envelope<T> {
  v: typeof PROTOCOL_VERSION;
  id: string;
  type: string;
  payload: T;
  timestamp: string;
}

export type MessagingErrorCode =
  'INVALID_ENVELOPE' | 'PAYLOAD_TOO_LARGE' | 'MESSAGE_TIMEOUT' | 'UNSUPPORTED_VERSION';

export class MessagingError extends Error {
  constructor(
    readonly code: MessagingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

const baseEnvelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(128),
  timestamp: z.iso.datetime(),
});

export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function assertMessageSize(value: unknown, maxBytes = MAX_MESSAGE_BYTES): number {
  const bytes = serializedBytes(value);
  if (bytes > maxBytes) {
    throw new MessagingError(
      'PAYLOAD_TOO_LARGE',
      `消息大小 ${bytes} bytes 超过上限 ${maxBytes} bytes`,
    );
  }
  return bytes;
}

export function createEnvelope<T>(
  type: string,
  payload: T,
  options: { id?: string; now?: Date; maxBytes?: number } = {},
): Envelope<T> {
  const envelope: Envelope<T> = {
    v: PROTOCOL_VERSION,
    id: options.id ?? crypto.randomUUID(),
    type,
    payload,
    timestamp: (options.now ?? new Date()).toISOString(),
  };
  assertMessageSize(envelope, options.maxBytes);
  return envelope;
}

export function parseEnvelope<T>(
  input: unknown,
  payloadSchema: z.ZodType<T>,
  options: { expectedType?: string; maxBytes?: number } = {},
): Envelope<T> {
  assertMessageSize(input, options.maxBytes);
  const parsedBase = baseEnvelopeSchema.safeParse(input);
  if (!parsedBase.success) {
    const maybeVersion = (input as { v?: unknown } | null)?.v;
    if (maybeVersion !== undefined && maybeVersion !== PROTOCOL_VERSION) {
      throw new MessagingError('UNSUPPORTED_VERSION', `不支持的协议版本：${String(maybeVersion)}`);
    }
    throw new MessagingError('INVALID_ENVELOPE', parsedBase.error.message);
  }
  const payload = payloadSchema.safeParse((input as { payload?: unknown }).payload);
  if (!payload.success) {
    throw new MessagingError('INVALID_ENVELOPE', payload.error.message);
  }
  if (options.expectedType && parsedBase.data.type !== options.expectedType) {
    throw new MessagingError(
      'INVALID_ENVELOPE',
      `消息类型 ${parsedBase.data.type} 与预期 ${options.expectedType} 不一致`,
    );
  }
  return {
    ...parsedBase.data,
    payload: payload.data,
  };
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new MessagingError('MESSAGE_TIMEOUT', `消息等待超过 ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
