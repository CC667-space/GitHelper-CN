import type { RepositoryAnalysisCard } from '../lib/repository-analysis';

interface StructureSummary {
  directories: string[];
  keyFiles: Array<{ path: string; role: string; findings: string[] }>;
}

interface SourceSummaryInput {
  readme?: string;
  description?: string;
  installCommands: string[];
  structure: StructureSummary;
}

export function hasChineseNarrative(value: string, minimumCharacters = 4): boolean {
  let count = 0;
  for (const character of value) {
    if (/[\u3400-\u9fff]/u.test(character)) {
      count += 1;
      if (count >= minimumCharacters) {
        return true;
      }
    }
  }
  return false;
}

export function cleanRepositoryMarkdownText(value: string): string {
  return value
    .replace(/\uFFFD+/gu, ' ')
    .replace(/!\[[^\n]*\]\([^)\n]*\)/gu, '')
    .replace(/\[([^\n]+)\]\([^)\n]*\)/gu, '$1')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/^[\s>*#-]+/u, '')
    .replace(/[*_~`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function isMediaOrNavigationBlock(rawBlock: string, cleaned: string): boolean {
  if (/<(?:img|picture|source)\b|shields\.io|\bbadge\b|align\s*=\s*["']?center/iu.test(rawBlock)) {
    return true;
  }
  const linkCount =
    [...rawBlock.matchAll(/\[[^\]\n]+\]\([^)\n]+\)/gu)].length +
    [...rawBlock.matchAll(/<a\b[^>]*>/giu)].length;
  const hasSentencePunctuation = /[.!?。！？]/u.test(cleaned);
  return linkCount >= 2 && !hasSentencePunctuation;
}

export function extractReadmeSummary(readme: string): string | undefined {
  const blocks = readme.split(/\r?\n\s*\r?\n/gu);
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter(Boolean);
    if (
      !lines.length ||
      lines.every((line) => /^#{1,6}\s/u.test(line)) ||
      lines.some((line) => /^```/u.test(line)) ||
      lines.every((line) => /^!\[/u.test(line) || /shields\.io|badge/iu.test(line))
    ) {
      continue;
    }
    const cleaned = cleanRepositoryMarkdownText(lines.join(' '));
    const wordCount = cleaned.split(/\s+/u).filter(Boolean).length;
    const chineseCharacterCount = [...cleaned].filter((character) =>
      /[\u3400-\u9fff]/u.test(character),
    ).length;
    if (
      (cleaned.length >= 20 || chineseCharacterCount >= 12) &&
      (wordCount >= 5 || chineseCharacterCount >= 12) &&
      !isMediaOrNavigationBlock(block, cleaned)
    ) {
      return cleaned.slice(0, 1_000);
    }
  }
  return undefined;
}

export function extractReadmeFeatures(readme: string): string[] {
  const headingPattern =
    /^(?:features?|highlights?|capabilit(?:y|ies)|what (?:it|this project) does|核心功能|主要功能|功能|特性|亮点)$/iu;
  const features: string[] = [];
  let inFeatureSection = false;
  for (const rawLine of readme.split(/\r?\n/gu)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(rawLine.trim());
    if (heading?.[1]) {
      if (inFeatureSection) {
        break;
      }
      inFeatureSection = headingPattern.test(cleanRepositoryMarkdownText(heading[1]));
      continue;
    }
    if (!inFeatureSection) {
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/u.exec(rawLine)?.[1];
    if (!item) {
      continue;
    }
    const cleaned = cleanRepositoryMarkdownText(item);
    if (cleaned && !features.includes(cleaned)) {
      features.push(cleaned.slice(0, 300));
    }
    if (features.length >= 6) {
      break;
    }
  }
  if (features.length < 6) {
    for (const row of readme.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
      const cells = [...(row[1] ?? '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map((cell) =>
        cleanRepositoryMarkdownText(cell[1] ?? ''),
      );
      const title = cells[0];
      const detail = cells.slice(1).filter(Boolean).join('；');
      if (!title || !detail || /^(?:features?|功能|特性)$/iu.test(title)) {
        continue;
      }
      const finding = `${title}：${detail}`.slice(0, 300);
      if (!features.includes(finding)) {
        features.push(finding);
      }
      if (features.length >= 6) {
        break;
      }
    }
  }
  return features;
}

function localConfiguration(installCommands: string[], structure: StructureSummary): string[] {
  const installation = installCommands.map((command) => `安装/运行：${command}`);
  const fileEvidence = structure.keyFiles.flatMap((file) =>
    /依赖|构建|运行环境|配置/u.test(file.role)
      ? file.findings.map((finding) => `${file.path}：${finding}`)
      : [],
  );
  return [...new Set([...installation, ...fileEvidence])].slice(0, 6);
}

function localImplementation(structure: StructureSummary): string[] {
  const directoryEvidence = structure.directories.length
    ? [`目录概览：${structure.directories.slice(0, 8).join('、')}`]
    : [];
  const fileEvidence = structure.keyFiles
    .filter((file) => !/README/i.test(file.path))
    .flatMap((file) => {
      const findings = file.findings.length ? file.findings.join('；') : file.role;
      return [`${file.path}：${findings}`];
    });
  return [...new Set([...directoryEvidence, ...fileEvidence])].slice(0, 6);
}

function cleanedLimited(items: string[], limit = 6): string[] {
  return [...new Set(items.map((item) => cleanRepositoryMarkdownText(item)).filter(Boolean))].slice(
    0,
    limit,
  );
}

export function buildRepositorySourceSummary(
  input: SourceSummaryInput,
): RepositoryAnalysisCard['sourceSummary'] {
  const readmeSummary = input.readme ? extractReadmeSummary(input.readme) : undefined;
  const localSummary =
    readmeSummary ?? input.description?.trim().slice(0, 1_000) ?? '未获取到可概括的 README 内容。';
  const cleanedLocalSummary = cleanRepositoryMarkdownText(localSummary);
  const summary =
    (hasChineseNarrative(cleanedLocalSummary, 4) ? cleanedLocalSummary : undefined) ??
    'README 主要内容为外文；这里保留原项目证据，不把它当作 AI 中文总结。';

  return {
    readmeSummary: summary.slice(0, 1_000),
    features: cleanedLimited(input.readme ? extractReadmeFeatures(input.readme) : []),
    configuration: cleanedLimited(localConfiguration(input.installCommands, input.structure)),
    implementation: cleanedLimited(localImplementation(input.structure)),
    source: input.readme ? 'readme' : input.description ? 'description' : 'limited',
  };
}
