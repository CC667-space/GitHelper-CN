import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputPath = join(projectRoot, 'THIRD_PARTY_NOTICES.txt');
const licenseFilePattern = /^(?:licen[cs]e|copying|notice)(?:[-_.].*)?$/i;

function packageSegments(packageName) {
  return packageName.split('/');
}

function resolveInstalledPackage(packageName, fromPath) {
  let cursor = realpathSync(fromPath);
  const root = parse(cursor).root;
  while (true) {
    const candidate = join(cursor, 'node_modules', ...packageSegments(packageName));
    if (existsSync(join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    if (cursor === root) {
      return undefined;
    }
    cursor = dirname(cursor);
  }
}

function collectProductionPackages() {
  const rootPackageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const rootDependencies = {
    ...(rootPackageJson.dependencies ?? {}),
    ...(rootPackageJson.optionalDependencies ?? {}),
  };
  const queue = Object.keys(rootDependencies).map((name) => ({
    name,
    packagePath: resolveInstalledPackage(name, projectRoot),
    optional: Object.hasOwn(rootPackageJson.optionalDependencies ?? {}, name),
  }));
  const collected = [];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current.packagePath) {
      if (current.optional) {
        continue;
      }
      throw new Error(`未安装生产依赖：${current.name}`);
    }

    const packageJson = JSON.parse(readFileSync(join(current.packagePath, 'package.json'), 'utf8'));
    const identity = `${packageJson.name}@${packageJson.version}|${current.packagePath}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    collected.push({ packagePath: current.packagePath, packageJson });

    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.optionalDependencies ?? {}),
      ...(packageJson.peerDependencies ?? {}),
    };
    for (const dependencyName of Object.keys(dependencies)) {
      queue.push({
        name: dependencyName,
        packagePath: resolveInstalledPackage(dependencyName, current.packagePath),
        optional:
          Object.hasOwn(packageJson.optionalDependencies ?? {}, dependencyName) ||
          Object.hasOwn(packageJson.peerDependencies ?? {}, dependencyName),
      });
    }
  }

  return collected;
}

function readLicenseBundle(packagePath) {
  const directoryEntries = readdirSync(packagePath, {
    withFileTypes: true,
  });
  const licenseFiles = directoryEntries
    .filter((entry) => entry.isFile() && licenseFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (licenseFiles.length === 0) {
    throw new Error(`生产依赖缺少可收集的许可证文件：${packagePath}`);
  }

  const sections = licenseFiles.map((fileName) => {
    const text = readFileSync(join(packagePath, fileName), 'utf8').replace(/\r\n/g, '\n').trim();
    return licenseFiles.length === 1 ? text : `--- ${fileName} ---\n${text}`;
  });
  return { text: sections.join('\n\n'), files: licenseFiles };
}

const packages = [];

for (const { packagePath, packageJson } of collectProductionPackages()) {
  if (!statSync(packagePath).isDirectory()) {
    throw new Error(`生产依赖目录不存在：${packagePath}`);
  }
  const bundle = readLicenseBundle(packagePath);
  const digest = createHash('sha256').update(bundle.text).digest('hex');
  packages.push({
    name: packageJson.name,
    version: packageJson.version,
    declaredLicense: String(packageJson.license ?? 'UNKNOWN'),
    homepage: packageJson.homepage ?? '',
    licenseFiles: bundle.files,
    licenseText: bundle.text,
    digest,
  });
}

packages.sort((left, right) => {
  const nameOrder = left.name.localeCompare(right.name, 'en');
  return nameOrder || left.version.localeCompare(right.version, 'en');
});

const groups = new Map();
for (const dependency of packages) {
  const existing = groups.get(dependency.digest);
  if (existing) {
    existing.packages.push(`${dependency.name}@${dependency.version}`);
    continue;
  }
  groups.set(dependency.digest, {
    text: dependency.licenseText,
    packages: [`${dependency.name}@${dependency.version}`],
  });
}

const lines = [
  'GitHelper-CN Third-Party Notices',
  '================================',
  '',
  'This file is generated from the installed production dependency graph.',
  'Do not edit it by hand; run `pnpm notices:generate` after dependency changes.',
  '',
  'Production packages',
  '-------------------',
  '',
];

for (const dependency of packages) {
  const sourceFiles = dependency.licenseFiles.length
    ? dependency.licenseFiles.map((fileName) => basename(fileName)).join(', ')
    : 'package.json declaration';
  const homepage = dependency.homepage ? ` | ${dependency.homepage}` : '';
  lines.push(
    `- ${dependency.name}@${dependency.version} | ${dependency.declaredLicense} | ${sourceFiles}${homepage}`,
  );
}

lines.push('', 'License texts', '-------------', '');
for (const [digest, group] of [...groups.entries()].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  lines.push(
    `Packages: ${group.packages.sort((left, right) => left.localeCompare(right, 'en')).join(', ')}`,
    `SHA-256: ${digest}`,
    '',
    group.text,
    '',
    '------------------------------------------------------------------------',
    '',
  );
}

while (lines.at(-1) === '') {
  lines.pop();
}
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`THIRD_PARTY_NOTICES=${outputPath}`);
console.log(`PRODUCTION_PACKAGES=${packages.length}`);
console.log(`LICENSE_TEXT_GROUPS=${groups.size}`);
