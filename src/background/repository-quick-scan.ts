import type { RepositoryAnalysisCard, RepositoryInsights } from '../lib/repository-analysis';

interface StructureSummary {
  directories: string[];
  keyFiles: Array<{ path: string; role: string; findings: string[] }>;
}

interface QuickScanInput {
  readme?: string;
  description?: string;
  installCommands: string[];
  structure: StructureSummary;
  insights: RepositoryInsights;
  providerUsed: boolean;
}

function cleanMarkdownInline(value: string): string {
  return value
    .replace(/!\[[^\n]*\]\([^)\n]*\)/gu, '')
    .replace(/\[([^\n]+)\]\([^)\n]*\)/gu, '$1')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/^[\s>*#-]+/u, '')
    .replace(/[*_~`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function readmeParagraph(readme: string): string | undefined {
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
    const cleaned = cleanMarkdownInline(lines.join(' '));
    if (cleaned.length >= 20) {
      return cleaned.slice(0, 1_000);
    }
  }
  return undefined;
}

function readmeFeatures(readme: string): string[] {
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
      inFeatureSection = headingPattern.test(cleanMarkdownInline(heading[1]));
      continue;
    }
    if (!inFeatureSection) {
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/u.exec(rawLine)?.[1];
    if (!item) {
      continue;
    }
    const cleaned = cleanMarkdownInline(item);
    if (cleaned && !features.includes(cleaned)) {
      features.push(cleaned.slice(0, 300));
    }
    if (features.length >= 6) {
      break;
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

function uniqueLimited(primary: string[] | undefined, secondary: string[], limit = 6): string[] {
  return [
    ...new Set([...(primary ?? []), ...secondary].map((item) => item.trim()).filter(Boolean)),
  ].slice(0, limit);
}

export function buildRepositoryQuickScan(
  input: QuickScanInput,
): RepositoryAnalysisCard['quickScan'] {
  const readmeSummary = input.readme ? readmeParagraph(input.readme) : undefined;
  const localSummary =
    readmeSummary ?? input.description?.trim().slice(0, 1_000) ?? '未获取到可概括的 README 内容。';
  const summary =
    input.insights.readmeSummary ??
    (input.providerUsed ? input.insights.purpose : undefined) ??
    localSummary;

  return {
    readmeSummary: summary.slice(0, 1_000),
    features: uniqueLimited(
      input.readme ? readmeFeatures(input.readme) : [],
      input.insights.features ?? [],
    ),
    configuration: uniqueLimited(
      localConfiguration(input.installCommands, input.structure),
      input.insights.configuration ?? [],
    ),
    implementation: uniqueLimited(
      localImplementation(input.structure),
      input.insights.implementationNotes ?? [],
    ),
    source: input.readme ? 'readme' : input.description ? 'description' : 'limited',
  };
}
