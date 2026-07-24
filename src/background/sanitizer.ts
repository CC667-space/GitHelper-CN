export type SanitizedKind =
  | 'API_KEY'
  | 'GITHUB_TOKEN'
  | 'CLOUD_KEY'
  | 'PRIVATE_KEY'
  | 'ENV_SECRET'
  | 'NAMED_SECRET'
  | 'AUTH_HEADER'
  | 'JWT'
  | 'URL_CREDENTIAL'
  | 'COOKIE_OR_PASSWORD'
  | 'EMAIL'
  | 'PHONE';

export interface SanitizerFinding {
  kind: SanitizedKind;
  count: number;
}

export interface SanitizedText {
  value: string;
  findings: SanitizerFinding[];
  redactedCount: number;
}

interface Rule {
  kind: SanitizedKind;
  pattern: RegExp;
  replacement: string | ((substring: string, ...groups: string[]) => string);
}

const RULES: Rule[] = [
  {
    kind: 'PRIVATE_KEY',
    pattern:
      /-----BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----[\s\S]*?-----END (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/g,
    replacement: '‹REDACTED:PRIVATE_KEY›',
  },
  {
    kind: 'GITHUB_TOKEN',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: '‹REDACTED:GITHUB_TOKEN›',
  },
  {
    kind: 'API_KEY',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/gi,
    replacement: '‹REDACTED:API_KEY›',
  },
  {
    kind: 'CLOUD_KEY',
    pattern: /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/g,
    replacement: '‹REDACTED:CLOUD_KEY›',
  },
  {
    kind: 'AUTH_HEADER',
    pattern: /\b(Authorization|Proxy-Authorization)\s*:\s*(Bearer|Basic)\s+[^\s,;]+/gi,
    replacement: (_match, header, scheme) => `${header}: ${scheme} ‹REDACTED:AUTH_HEADER›`,
  },
  {
    kind: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: '‹REDACTED:JWT›',
  },
  {
    kind: 'URL_CREDENTIAL',
    pattern: /\b(https?:\/\/[^:/\s]+:)[^@\s/]+@/gi,
    replacement: (_match, prefix) => `${prefix}‹REDACTED:URL_CREDENTIAL›@`,
  },
  {
    kind: 'ENV_SECRET',
    pattern:
      /^(\s*[A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Za-z0-9_]*\s*=\s*).+$/gim,
    replacement: (_match, prefix) => `${prefix}‹REDACTED:ENV_SECRET›`,
  },
  {
    kind: 'NAMED_SECRET',
    pattern:
      /(["']?\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password)\b["']?\s*[:=]\s*["']?)[^"'\s,;}]{6,}/gi,
    replacement: (_match, prefix) => `${prefix}‹REDACTED:NAMED_SECRET›`,
  },
  {
    kind: 'COOKIE_OR_PASSWORD',
    pattern: /\b(Set-Cookie|Cookie|password)\s*[:=]\s*[^\s;]+/gi,
    replacement: (_match, label) => `${label}=‹REDACTED:COOKIE_OR_PASSWORD›`,
  },
  {
    kind: 'EMAIL',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '‹REDACTED:EMAIL›',
  },
  {
    kind: 'PHONE',
    pattern: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g,
    replacement: '‹REDACTED:PHONE›',
  },
];

const SENSITIVE_FIELD_NAME =
  /^(?:api[-_]?key|authorization|proxy[-_]?authorization|cookie|password|secret|token|access[-_]?token|auth[-_]?token|client[-_]?secret|provider[-_]?credential|private[-_]?key)$/i;

export function isSensitiveFieldName(value: string): boolean {
  return SENSITIVE_FIELD_NAME.test(value);
}

export function sanitizeText(input: string): SanitizedText {
  let value = input;
  const findings: SanitizerFinding[] = [];
  for (const rule of RULES) {
    let count = 0;
    value = value.replace(rule.pattern, (...args: unknown[]) => {
      count += 1;
      return typeof rule.replacement === 'function'
        ? rule.replacement(...(args as [string, ...string[]]))
        : rule.replacement;
    });
    if (count > 0) {
      findings.push({ kind: rule.kind, count });
    }
  }
  return {
    value,
    findings,
    redactedCount: findings.reduce((total, finding) => total + finding.count, 0),
  };
}

export function sanitizeUnknown(value: unknown): {
  value: unknown;
  findings: SanitizerFinding[];
} {
  const findings: SanitizerFinding[] = [];
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): unknown => {
    if (typeof candidate === 'string') {
      const sanitized = sanitizeText(candidate);
      findings.push(...sanitized.findings);
      return sanitized.value;
    }
    if (Array.isArray(candidate)) {
      return candidate.map(visit);
    }
    if (candidate && typeof candidate === 'object') {
      if (seen.has(candidate)) {
        return '‹CIRCULAR›';
      }
      seen.add(candidate);
      return Object.fromEntries(
        Object.entries(candidate).map(([key, item]) => {
          if (isSensitiveFieldName(key)) {
            findings.push({ kind: 'NAMED_SECRET', count: 1 });
            return [key, '‹REDACTED:NAMED_SECRET›'];
          }
          return [key, visit(item)];
        }),
      );
    }
    return candidate;
  };
  const sanitized = visit(value);
  const consolidated = new Map<SanitizedKind, number>();
  for (const finding of findings) {
    consolidated.set(finding.kind, (consolidated.get(finding.kind) ?? 0) + finding.count);
  }
  return {
    value: sanitized,
    findings: Array.from(consolidated, ([kind, count]) => ({ kind, count })),
  };
}
