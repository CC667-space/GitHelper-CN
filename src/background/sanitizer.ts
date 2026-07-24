export type SanitizedKind =
  | 'API_KEY'
  | 'GITHUB_TOKEN'
  | 'PRIVATE_KEY'
  | 'ENV_SECRET'
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
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    replacement: '‹REDACTED:API_KEY›',
  },
  {
    kind: 'ENV_SECRET',
    pattern:
      /^(\s*[A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Za-z0-9_]*\s*=\s*).+$/gim,
    replacement: (_match, prefix) => `${prefix}‹REDACTED:ENV_SECRET›`,
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
      return Object.fromEntries(Object.entries(candidate).map(([key, item]) => [key, visit(item)]));
    }
    return candidate;
  };
  return { value: visit(value), findings };
}
