import type { ResolvedSearchTarget, SearchConversion, SearchTarget } from '../lib/github-search';

export const SEARCH_CONVERSION_SYSTEM_PROMPT = [
  '你把中文自然语言转换为只读的 GitHub 搜索语句。',
  '只允许输出 target、query、explanation 三个字段。',
  'target 只能是 repositories 或 issues。',
  '优先使用 GitHub 官方限定词，例如 language、stars、topic、repo、is、label、pushed、archived。',
  '不得生成写操作、账号操作、非 GitHub URL 或未由用户表达的限定条件。',
].join('\n');

const LANGUAGE_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\btypescript\b|TypeScript|TS(?=\s|$)|打字稿/iu, 'TypeScript'],
  [/\bjavascript\b|JavaScript|\bJS\b/iu, 'JavaScript'],
  [/\bpython\b|Python|蟒蛇/iu, 'Python'],
  [/\brust\b|Rust/iu, 'Rust'],
  [/\bgolang\b|\bgo\b|Go 语言|Golang/iu, 'Go'],
  [/\bjava\b|Java/iu, 'Java'],
  [/\bc\+\+\b|C\+\+/iu, 'C++'],
  [/\bc#\b|C#/iu, 'C#'],
  [/\bkotlin\b|Kotlin/iu, 'Kotlin'],
  [/\bswift\b|Swift/iu, 'Swift'],
  [/\bruby\b|Ruby/iu, 'Ruby'],
  [/\bphp\b|PHP/iu, 'PHP'],
];

const ISSUE_HINT = /(?:\bissues?\b|议题|问题单|工单|\bbug\b|good first issue|help wanted)/iu;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(now: Date, days: number): string {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - days);
  return isoDate(result);
}

function firstDayOfMonth(now: Date): string {
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function firstDayOfYear(now: Date): string {
  return `${now.getUTCFullYear()}-01-01`;
}

function resolveTarget(input: string, requested: SearchTarget): ResolvedSearchTarget {
  if (requested !== 'auto') {
    return requested;
  }
  return ISSUE_HINT.test(input) ? 'issues' : 'repositories';
}

function existingQualifiers(input: string): string[] {
  return (
    input.match(
      /\b(?:language|stars|topic|repo|org|user|is|state|label|pushed|created|updated|archived|license):(?:"[^"]+"|\S+)/giu,
    ) ?? []
  );
}

function matchLanguage(input: string): string | undefined {
  return LANGUAGE_ALIASES.find(([pattern]) => pattern.test(input))?.[1];
}

function matchStars(input: string): string | undefined {
  const patterns: ReadonlyArray<readonly [RegExp, string]> = [
    [/(?:stars?|star|星标|星星|收藏)[^\d]{0,10}(?:至少|不低于|大于等于|>=)\s*(\d+)/iu, '>='],
    [/(?:stars?|star|星标|星星|收藏)[^\d]{0,10}(?:超过|大于|>)\s*(\d+)/iu, '>'],
    [/(?:stars?|star|星标|星星|收藏)[^\d]{0,10}(?:至多|不高于|小于等于|<=)\s*(\d+)/iu, '<='],
    [/(?:stars?|star|星标|星星|收藏)[^\d]{0,10}(?:少于|小于|<)\s*(\d+)/iu, '<'],
    [/(?:至少|不低于|大于等于|>=)\s*(\d+)[^\d]{0,10}(?:stars?|star|星标|星星)/iu, '>='],
    [/(?:超过|大于|>)\s*(\d+)[^\d]{0,10}(?:stars?|star|星标|星星)/iu, '>'],
  ];
  for (const [pattern, operator] of patterns) {
    const match = pattern.exec(input);
    if (match?.[1]) {
      return `${operator}${match[1]}`;
    }
  }
  return undefined;
}

function matchPushed(input: string, now: Date): string | undefined {
  if (/最近(?:一|1)年|过去(?:一|1)年/iu.test(input)) {
    return subtractDays(now, 365);
  }
  if (/最近半年|过去半年/iu.test(input)) {
    return subtractDays(now, 183);
  }
  const days = /最近\s*(\d{1,3})\s*天|过去\s*(\d{1,3})\s*天/iu.exec(input);
  const dayCount = Number(days?.[1] ?? days?.[2]);
  if (Number.isFinite(dayCount) && dayCount > 0) {
    return subtractDays(now, Math.min(dayCount, 366));
  }
  if (/最近(?:一|1)周|过去(?:一|1)周/iu.test(input)) {
    return subtractDays(now, 7);
  }
  if (/本月|这个月/iu.test(input)) {
    return firstDayOfMonth(now);
  }
  if (/今年|本年度/iu.test(input)) {
    return firstDayOfYear(now);
  }
  return undefined;
}

function matchTopic(input: string): string | undefined {
  const explicit = /(?:topic|主题)\s*(?:为|是|:|：)?\s*["“]?([\w.-]{2,50})/iu.exec(input)?.[1];
  if (explicit) {
    return explicit.toLowerCase();
  }
  const known = /\b(react|vue|angular|machine-learning|llm|cli)\b/iu.exec(input)?.[1];
  return known?.toLowerCase();
}

function matchLabel(input: string): string | undefined {
  for (const label of ['good first issue', 'help wanted', 'documentation', 'bug']) {
    if (input.toLowerCase().includes(label)) {
      return label;
    }
  }
  const explicit = /(?:label|标签)\s*(?:为|是|:|：)?\s*["“]([^"”]{1,100})["”]/iu.exec(input)?.[1];
  return explicit?.trim();
}

function matchRepository(input: string): string | undefined {
  return /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\b/u.exec(input)?.[1];
}

function removeRecognizedPhrases(input: string): string {
  return input
    .replace(
      /\b(?:language|stars|topic|repo|org|user|is|state|label|pushed|created|updated|archived|license):(?:"[^"]+"|\S+)/giu,
      ' ',
    )
    .replace(/(?:请|帮我|帮忙|搜索|查找|找一下|寻找|查一下|查找一下|有哪些|有没有|我想找)/gu, ' ')
    .replace(/\b(?:good first issue|help wanted|documentation|bug)\b/giu, ' ')
    .replace(/(?:仓库|项目|代码库|issues?|议题|问题单|工单)/giu, ' ')
    .replace(
      /(?:stars?|star|星标|星星|收藏)[^\d]{0,10}(?:(?:至少|不低于|大于等于|超过|大于|至多|不高于|小于等于|少于|小于|>=|<=|>|<)\s*)?\d+/giu,
      ' ',
    )
    .replace(
      /(?:(?:至少|不低于|大于等于|超过|大于|>=|>)\s*)?\d+[^\d]{0,10}(?:stars?|star|星标|星星)/giu,
      ' ',
    )
    .replace(/最近(?:一|1)年|过去(?:一|1)年|最近半年|过去半年/giu, ' ')
    .replace(
      /(?:最近|过去)\s*\d{1,3}\s*天|最近(?:一|1)周|过去(?:一|1)周|本月|这个月|今年|本年度/giu,
      ' ',
    )
    .replace(/(?:未关闭|仍未关闭|开放中|已打开|打开的|开放的|开放(?!源)|已关闭|关闭的)/gu, ' ')
    .replace(/(?:非归档|未归档|没有归档|仍活跃)/gu, ' ')
    .replace(/(?:topic|主题)\s*(?:为|是|:|：)?\s*["“]?[\w.-]{2,50}["”]?/giu, ' ')
    .replace(/(?:label|标签)\s*(?:为|是|:|：)?\s*["“][^"”]{1,100}["”]/giu, ' ')
    .replace(
      /\b(?:typescript|javascript|python|rust|golang|go|java|kotlin|swift|ruby|php|c\+\+|c#)\b/giu,
      ' ',
    )
    .replace(/Go 语言|打字稿|蟒蛇/gu, ' ')
    .replace(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/gu, ' ')
    .replace(/[，。！？、；：,.!?;]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function quoteQualifierValue(value: string): string {
  return /\s/u.test(value) ? `"${value.replaceAll('"', '')}"` : value;
}

function boundedQuery(parts: string[]): string {
  const result = parts.filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
  if (!result) {
    throw new Error('无法从输入中提取可执行的 GitHub 搜索条件');
  }
  return result.slice(0, 256).trim();
}

export function convertNaturalLanguageSearch(
  naturalLanguage: string,
  requestedTarget: SearchTarget = 'auto',
  now = new Date(),
): SearchConversion {
  const input = naturalLanguage.trim();
  if (!input) {
    throw new Error('搜索描述不能为空');
  }
  if (input.length > 500) {
    throw new Error('搜索描述不能超过 500 个字符');
  }
  const target = resolveTarget(input, requestedTarget);
  const qualifiers = [...existingQualifiers(input)];
  const explanation: string[] = [];
  const language = matchLanguage(input);
  if (language && !qualifiers.some((item) => item.toLowerCase().startsWith('language:'))) {
    qualifiers.push(`language:${language}`);
    explanation.push(`语言为 ${language}`);
  }
  if (target === 'repositories') {
    const stars = matchStars(input);
    if (stars && !qualifiers.some((item) => item.toLowerCase().startsWith('stars:'))) {
      qualifiers.push(`stars:${stars}`);
      explanation.push(`Star ${stars}`);
    }
    const topic = matchTopic(input);
    if (topic && !qualifiers.some((item) => item.toLowerCase().startsWith('topic:'))) {
      qualifiers.push(`topic:${topic}`);
      explanation.push(`主题为 ${topic}`);
    }
    if (
      /非归档|未归档|没有归档|仍活跃/iu.test(input) &&
      !qualifiers.some((item) => item.toLowerCase().startsWith('archived:'))
    ) {
      qualifiers.push('archived:false');
      explanation.push('排除归档仓库');
    }
  } else {
    if (!qualifiers.some((item) => /^is:(?:issue|pr)$/iu.test(item))) {
      qualifiers.push('is:issue');
    }
    if (
      /未关闭|仍未关闭|开放中|已打开|打开的|开放的|开放(?!源)|\bopen\b/iu.test(input) &&
      !qualifiers.some((item) => /^(?:is|state):(?:open|closed)$/iu.test(item))
    ) {
      qualifiers.push('is:open');
      explanation.push('仅开放 Issue');
    } else if (
      /已关闭|关闭的|\bclosed\b/iu.test(input) &&
      !qualifiers.some((item) => /^(?:is|state):(?:open|closed)$/iu.test(item))
    ) {
      qualifiers.push('is:closed');
      explanation.push('仅已关闭 Issue');
    }
    const label = matchLabel(input);
    if (label && !qualifiers.some((item) => item.toLowerCase().startsWith('label:'))) {
      qualifiers.push(`label:${quoteQualifierValue(label)}`);
      explanation.push(`标签为 ${label}`);
    }
    const repository = matchRepository(input);
    if (repository && !qualifiers.some((item) => item.toLowerCase().startsWith('repo:'))) {
      qualifiers.push(`repo:${repository}`);
      explanation.push(`限定仓库 ${repository}`);
    }
  }
  const pushed = matchPushed(input, now);
  if (pushed && !qualifiers.some((item) => item.toLowerCase().startsWith('pushed:'))) {
    qualifiers.push(`pushed:>=${pushed}`);
    explanation.push(`最近更新时间不早于 ${pushed}`);
  }
  const freeText = removeRecognizedPhrases(input);
  const query = boundedQuery([freeText, ...qualifiers]);
  return {
    naturalLanguage: input,
    target,
    query,
    explanation: `${target === 'repositories' ? '搜索公开仓库' : '搜索公开 Issue'}${
      explanation.length ? `；${explanation.join('；')}` : '；保留输入中的关键词'
    }。`,
  };
}
