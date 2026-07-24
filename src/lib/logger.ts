export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogSink {
  debug(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

const REDACTED = '‹REDACTED›';
const MAX_LOG_STRING_LENGTH = 2_000;
const SENSITIVE_KEY = /(?:api[-_]?key|authorization|cookie|password|secret|token)/i;
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bhttps?:\/\/[^:/\s]+:[^@\s/]+@/gi,
  /["']?\b(?:api[-_]?key|client[-_]?secret|access[-_]?token|auth[-_]?token|password)\b["']?\s*[:=]\s*["']?[^"'\s,;}]{6,}/gi,
  /-----BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY-----[\s\S]*?-----END (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/g,
];

export function redactString(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted.length > MAX_LOG_STRING_LENGTH
    ? `${redacted.slice(0, MAX_LOG_STRING_LENGTH)}…‹TRUNCATED›`
    : redacted;
}

export function redactLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '‹CIRCULAR›';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactLogValue(item, seen),
    ]),
  );
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(
  sink: LogSink = console,
  minimumLevel: LogLevel = import.meta.env?.PROD ? 'warn' : 'debug',
): LogSink {
  const emit =
    (level: LogLevel) =>
    (...values: unknown[]): void => {
      if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel]) {
        return;
      }
      sink[level](...values.map((value) => redactLogValue(value)));
    };

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}

export const logger = createLogger();
