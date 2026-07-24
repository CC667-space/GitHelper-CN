import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultDist = resolve(process.cwd(), 'dist');

export function findUnsafePatterns(relativePath, content) {
  const findings = [];
  const extension = extname(relativePath).toLowerCase();
  const commonRules = [
    { name: 'eval', pattern: /\beval\s*\(/ },
    { name: 'new Function', pattern: /\bnew\s+Function\s*\(/ },
    { name: 'remote dynamic import', pattern: /\bimport\s*\(\s*['"]https?:\/\//i },
  ];
  for (const rule of commonRules) {
    if (rule.pattern.test(content)) {
      findings.push(`${relativePath}: ${rule.name}`);
    }
  }
  if (extension === '.html' && /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(content)) {
    findings.push(`${relativePath}: remote script`);
  }
  if (
    relativePath.replaceAll('\\', '/') === 'manifest.json' &&
    /unsafe-eval|script-src[^;]*(?:https?:|[*])/i.test(content)
  ) {
    findings.push(`${relativePath}: unsafe CSP`);
  }
  return findings;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute)));
    } else {
      files.push(absolute);
    }
  }
  return files;
}

export async function scanBuildDirectory(directory = defaultDist) {
  const findings = [];
  for (const file of await listFiles(directory)) {
    if (!['.js', '.mjs', '.html', '.json'].includes(extname(file).toLowerCase())) {
      continue;
    }
    const content = await readFile(file, 'utf8');
    findings.push(...findUnsafePatterns(relative(directory, file), content));
  }
  return findings;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const findings = await scanBuildDirectory();
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Build safety scan passed: no eval/new Function/remote runtime scripts.');
  }
}
