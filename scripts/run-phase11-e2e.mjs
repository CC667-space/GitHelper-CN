import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const extensionPath = join(projectRoot, 'dist');
const artifactsPath = join(projectRoot, 'probe-artifacts');
const browserPath = join(artifactsPath, 'playwright-browsers');
const repoFixture = await readFile(
  join(projectRoot, 'tests', 'fixtures', 'github', 'repo.html'),
  'utf8',
);
const issueFixture = await readFile(
  join(projectRoot, 'tests', 'fixtures', 'github', 'issue.html'),
  'utf8',
);
const analysisReadme = [
  '<p align="center"><img src="assets/banner.png" alt="Hello World"></p>',
  '# Hello World �',
  '<p align="center"><a href="/">Hello World</a> | <a href="/">Desktop</a></p>',
  '',
  '<p align="center"><img src="https://img.shields.io/badge/docs-blue" alt="Docs"></p>',
  '',
  '**A tiny example server for learning real project structure.** It inspects bounded configuration and source evidence.',
  '',
  '<table>',
  '<tr><td><b>Starts a local greeting server</b></td><td>Runs from the inspected JavaScript entry point.</td></tr>',
  '<tr><td><b>Shows real project evidence</b></td><td>Summarizes inspected manifests and source files.</td></tr>',
  '</table>',
  '',
  '## Installation',
  '',
  'npm install',
].join('\n');
const analysisReadmeZhCn = [
  '<p align="center"><img src="assets/banner.png" alt="Hello World"></p>',
  '# Hello World 中文说明 �',
  '<p align="center"><a href="/">项目主页</a> | <a href="/">桌面版</a></p>',
  '',
  '<p align="center"><img src="https://img.shields.io/badge/docs-blue" alt="Docs"></p>',
  '',
  '这是一个用于学习真实项目结构的小型示例服务器，可检查受限的配置文件与源码证据。',
  '',
  '<table>',
  '<tr><td><b>启动本地问候服务器</b></td><td>从已检查的 JavaScript 入口文件运行。</td></tr>',
  '<tr><td><b>展示真实项目证据</b></td><td>概括已检查的清单文件与源码文件。</td></tr>',
  '</table>',
  '',
  '## 安装',
  '',
  'npm install',
].join('\n');

await mkdir(artifactsPath, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserPath;
const { chromium } = await import('playwright-core');
const profilePath = await mkdtemp(join(artifactsPath, 'phase11-profile-'));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForPanel(context, extensionId, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const panel = context
      .pages()
      .find((candidate) =>
        candidate.url().startsWith(`chrome-extension://${extensionId}/src/panel/index.html`),
      );
    if (panel) {
      return panel;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}

async function requestActivePageInfo(serviceWorker) {
  return await serviceWorker.evaluate(
    () =>
      new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (tab?.id === undefined) {
            reject(new Error('E2E 未找到活动 GitHub tab'));
            return;
          }
          const request = {
            v: 1,
            id: `phase11-${crypto.randomUUID()}`,
            type: 'PAGE_INFO_REQUEST',
            timestamp: new Date().toISOString(),
            payload: {},
          };
          chrome.tabs.sendMessage(tab.id, request, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          });
        });
      }),
  );
}

function apiHeaders(resource = 'core') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'X-RateLimit-Resource': resource,
    'X-RateLimit-Remaining': '59',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1_000) + 3_600),
  };
}

const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: chromium.executablePath(),
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    '--disable-default-apps',
    '--disable-component-update',
    '--disable-background-timer-throttling',
    '--window-size=1440,1000',
  ],
  viewport: null,
});

const pageErrors = [];
try {
  await context.route('https://github.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: repoFixture,
    });
  });
  await context.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    const path = `${url.pathname}${url.search}`;
    if (path === '/repos/octocat/Hello-World') {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          full_name: 'octocat/Hello-World',
          html_url: 'https://github.com/octocat/Hello-World',
          description: 'A first repository for testing GitHub APIs.',
          topics: ['hello-world', 'browser'],
          default_branch: 'main',
          language: 'JavaScript',
          stargazers_count: 2_800,
          forks_count: 1_100,
          subscribers_count: 90,
          watchers_count: 2_800,
          open_issues_count: 12,
          archived: false,
          license: { name: 'MIT License', spdx_id: 'MIT' },
          pushed_at: '2026-07-20T00:00:00.000Z',
          updated_at: '2026-07-21T00:00:00.000Z',
        }),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/languages') {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({ JavaScript: 750, HTML: 250 }),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/releases/latest') {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          name: 'v1.0.0',
          tag_name: 'v1.0.0',
          published_at: '2026-07-01T00:00:00.000Z',
          html_url: 'https://github.com/octocat/Hello-World/releases/tag/v1.0.0',
        }),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/pulls?state=open&per_page=1') {
      await route.fulfill({
        status: 200,
        headers: {
          ...apiHeaders(),
          Link: '<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=2>; rel="last"',
        },
        body: JSON.stringify([{ id: 1 }]),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/contents?ref=main') {
      const packageJson = '{"name":"hello-world","scripts":{"start":"node src/server.js"}}';
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify([
          { name: 'src', path: 'src', type: 'dir', size: 0, sha: 'src-sha' },
          {
            name: 'README.md',
            path: 'README.md',
            type: 'file',
            size: Buffer.byteLength(analysisReadme),
            sha: 'readme-sha',
          },
          {
            name: 'README.es.md',
            path: 'README.es.md',
            type: 'file',
            size: 512,
            sha: 'readme-es-sha',
          },
          {
            name: 'README.ur-pk.md',
            path: 'README.ur-pk.md',
            type: 'file',
            size: 512,
            sha: 'readme-ur-sha',
          },
          {
            name: 'README.zh-CN.md',
            path: 'README.zh-CN.md',
            type: 'file',
            size: Buffer.byteLength(analysisReadmeZhCn),
            sha: 'readme-zh-sha',
          },
          {
            name: 'package.json',
            path: 'package.json',
            type: 'file',
            size: packageJson.length,
            sha: 'package-sha',
          },
        ]),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/contents/README.md?ref=main') {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          type: 'file',
          path: 'README.md',
          size: Buffer.byteLength(analysisReadme),
          encoding: 'base64',
          content: Buffer.from(analysisReadme, 'utf8').toString('base64'),
        }),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/contents/README.zh-CN.md?ref=main') {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          type: 'file',
          path: 'README.zh-CN.md',
          size: Buffer.byteLength(analysisReadmeZhCn),
          encoding: 'base64',
          content: Buffer.from(analysisReadmeZhCn, 'utf8').toString('base64'),
        }),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/contents/src?ref=main') {
      const serverSource = 'export function startServer() { return "hello"; }';
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify([
          {
            name: 'server.js',
            path: 'src/server.js',
            type: 'file',
            size: serverSource.length,
            sha: 'server-sha',
          },
        ]),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/contents/package.json?ref=main') {
      const packageJson = '{"name":"hello-world","scripts":{"start":"node src/server.js"}}';
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          type: 'file',
          path: 'package.json',
          size: packageJson.length,
          encoding: 'base64',
          content: Buffer.from(packageJson, 'utf8').toString('base64'),
        }),
      });
      return;
    }
    if (path === '/repos/octocat/Hello-World/contents/src/server.js?ref=main') {
      const serverSource = 'export function startServer() { return "hello"; }';
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          type: 'file',
          path: 'src/server.js',
          size: serverSource.length,
          encoding: 'base64',
          content: Buffer.from(serverSource, 'utf8').toString('base64'),
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: apiHeaders(),
      body: JSON.stringify({ message: `Unmocked E2E API path: ${path}` }),
    });
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  const githubPage = context.pages()[0] ?? (await context.newPage());
  githubPage.on('pageerror', (error) => pageErrors.push(`GitHub: ${error.message}`));
  await githubPage.goto('https://github.com/octocat/Hello-World', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await githubPage.waitForFunction(
    () => document.documentElement.getAttribute('data-git-helper-injected') === 'true',
    undefined,
    { timeout: 10_000 },
  );
  await githubPage.waitForTimeout(500);
  assert(
    (await githubPage.locator('#git-helper-phase0-run-button').count()) === 1,
    'Content Script 初始实例数不是 1',
  );

  const optionsPage = await context.newPage();
  optionsPage.on('pageerror', (error) => pageErrors.push(`Options: ${error.message}`));
  await optionsPage.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await optionsPage.locator('#phase0-open-side-panel').click();
  await optionsPage
    .getByTestId('phase0-side-panel-status')
    .getByText('Side Panel 已打开')
    .waitFor({ timeout: 10_000 });
  let panel = await waitForPanel(context, extensionId, 2_000);
  const nativePanelExposedToPlaywright = panel !== undefined;
  if (!panel) {
    panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html`);
  }
  panel.on('pageerror', (error) => pageErrors.push(`Panel: ${error.message}`));
  await githubPage.bringToFront();
  await panel.getByTestId('side-panel').waitFor({ timeout: 10_000 });
  await panel.locator('[title="Background 已连接"]').waitFor({ timeout: 10_000 });

  await panel.getByRole('button', { name: '一键分析' }).click();
  const analysisCard = panel.getByTestId('repository-analysis-card');
  await analysisCard.waitFor({ timeout: 20_000 });
  const analysisText = await analysisCard.innerText();
  assert(analysisText.includes('octocat/Hello-World'), 'E2E 分析卡缺少仓库名');
  assert(analysisText.includes('总结速览'), 'E2E 分析卡缺少总结速览');
  assert(analysisText.includes('AI 总结暂不可用'), 'E2E 本地降级未明确标记 AI 总结状态');
  const repositoryDetails = panel.getByTestId('repository-details');
  const repositorySourceSummary = panel.getByTestId('repository-source-summary');
  assert((await repositoryDetails.getAttribute('open')) === null, 'E2E 详细介绍不应默认展开');
  assert(
    (await repositorySourceSummary.getAttribute('open')) === null,
    'E2E 原项目文件摘要不应默认展开',
  );
  await repositoryDetails.locator('summary').click();
  const detailsText = await repositoryDetails.innerText();
  assert(detailsText.includes('主要功能'), 'E2E 详细介绍缺少主要功能');
  assert(detailsText.includes('上手难度'), 'E2E 详细介绍缺少上手难度');
  await repositorySourceSummary.locator('summary').click();
  const sourceText = await repositorySourceSummary.innerText();
  assert(sourceText.includes('README 取样记录'), 'E2E 原项目文件摘要缺少 README 取样记录');
  assert(sourceText.includes('已读取 README.zh-CN.md'), 'E2E 未记录实际读取的中文 README');
  assert(sourceText.includes('章节：安装'), 'E2E 未记录 README 中已识别的章节');
  assert(
    !sourceText.includes('启动本地问候服务器') && !sourceText.includes('学习真实项目结构'),
    'E2E 原项目文件摘要仍在复制 README 原文',
  );
  assert(
    !sourceText.includes('Starts a local greeting server'),
    'E2E 分析卡错误展示了默认英文 README',
  );
  assert(
    !sourceText.includes('A tiny example server') &&
      !sourceText.includes('A first repository for testing GitHub APIs'),
    'E2E 分析卡仍透传英文 README 概括或仓库用途',
  );
  assert(!sourceText.includes('�'), 'E2E 分析卡仍包含 UTF-8 替换字符');
  assert(!sourceText.includes('<img'), 'E2E 分析卡仍包含 README banner HTML');
  assert(sourceText.includes('文件、配置与实现'), 'E2E 分析卡缺少文件配置分析');
  assert(sourceText.includes('package.json'), 'E2E 分析卡缺少实际 package.json 证据');
  assert(sourceText.includes('src/server.js'), 'E2E 分析卡缺少受限源码文件证据');
  const repositoryFacts = panel.getByTestId('repository-facts');
  assert((await repositoryFacts.getAttribute('open')) === null, 'E2E 仓库事实区不应默认展开');
  await repositoryFacts.locator('summary').click();
  const factsText = await repositoryFacts.innerText();
  assert(factsText.includes('2,800'), 'E2E 仓库事实区缺少 API Star 事实');
  assert(factsText.includes('MIT'), 'E2E 仓库事实区缺少 API 许可证事实');

  const issueBody = issueFixture.match(/<body>([\s\S]*?)<\/body>/iu)?.[1];
  assert(issueBody, 'Issue fixture 缺少 body');
  await githubPage.evaluate((body) => {
    history.pushState({}, '', '/octocat/Hello-World/issues/42');
    document.title = 'Improve documentation · Issue #42';
    document.body.innerHTML = body;
    document.dispatchEvent(new Event('turbo:load'));
    document.dispatchEvent(new Event('turbo:render'));
  }, issueBody);
  await githubPage.waitForTimeout(700);
  const spaResponse = await requestActivePageInfo(serviceWorker);
  const spaContext = spaResponse?.payload?.pageContext;
  assert(spaContext?.pageType === 'issue', 'SPA 后 PageContext 未刷新为 issue');
  assert(spaContext?.issueOrPrNumber === 42, 'SPA 后 Issue 编号不正确');
  assert(spaContext?.extracted?.title === 'Improve documentation', 'SPA 后 Issue 标题未刷新');
  assert(
    (await githubPage.locator('#git-helper-phase0-run-button').count()) === 1,
    'SPA 导航后 Content Script 出现重复初始化',
  );

  const sessionSentinel = 'PHASE11_SESSION_RESTORE_SENTINEL';
  const input = panel.getByPlaceholder('问问当前 GitHub 页面……');
  await input.fill(sessionSentinel);
  await input.press('Enter');
  await panel
    .getByTestId('conversation')
    .getByText(sessionSentinel, { exact: true })
    .waitFor({ timeout: 10_000 });
  await panel.getByRole('button', { name: '发送' }).waitFor({ timeout: 10_000 });

  const sensitiveSentinel = 'sk-phase11-security-sentinel-123456';
  await input.fill(`敏感测试 ${sensitiveSentinel}`);
  await input.press('Enter');
  await panel
    .getByTestId('conversation')
    .getByText('敏感测试 ‹REDACTED:API_KEY›', { exact: true })
    .waitFor({ timeout: 10_000 });
  await panel.getByRole('button', { name: '发送' }).waitFor({ timeout: 10_000 });
  const storedSessions = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('sessions:v1'))['sessions:v1'],
  );
  const serializedSessions = JSON.stringify(storedSessions);
  assert(serializedSessions.includes(sessionSentinel), '会话未写入 chrome.storage.local');
  assert(!serializedSessions.includes(sensitiveSentinel), '会话持久化包含敏感哨兵明文');
  assert(serializedSessions.includes('‹REDACTED:API_KEY›'), '会话持久化缺少敏感哨兵遮蔽标记');

  await githubPage.evaluate(() => {
    history.pushState({}, '', '/explore');
    document.title = 'Explore GitHub';
    document.body.innerHTML = '<main><h1>Explore GitHub</h1><p>发现公开项目</p></main>';
    document.dispatchEvent(new Event('turbo:load'));
    document.dispatchEvent(new Event('turbo:render'));
  });
  await githubPage.waitForTimeout(700);
  const switchedPageResponse = await requestActivePageInfo(serviceWorker);
  assert(switchedPageResponse?.payload?.url.endsWith('/explore'), '跨页面测试未切换到 Explore');

  await panel.reload({ waitUntil: 'domcontentloaded' });
  await panel.locator('[title="Background 已连接"]').waitFor({ timeout: 10_000 });
  await panel
    .getByTestId('conversation')
    .getByText(sessionSentinel, { exact: true })
    .waitFor({ timeout: 10_000 });
  await panel
    .getByTestId('conversation')
    .getByText('敏感测试 ‹REDACTED:API_KEY›', { exact: true })
    .waitFor({ timeout: 10_000 });
  assert(
    !(await panel.getByTestId('conversation').innerText()).includes(sensitiveSentinel),
    'Panel 重载后显示敏感哨兵明文',
  );
  assert(pageErrors.length === 0, `E2E 页面异常：${pageErrors.join(' | ')}`);

  console.log(
    `PHASE11_E2E_JSON=${JSON.stringify({
      status: 'passed',
      chromeVersion: await githubPage.evaluate(() => navigator.userAgent),
      extensionId,
      nativeSidePanelOpenResolved: true,
      nativePanelExposedToPlaywright,
      automatedPanelSurface: nativePanelExposedToPlaywright
        ? 'native-side-panel'
        : 'same-extension-panel-document',
      s1RepositoryAnalysis: {
        repository: 'octocat/Hello-World',
        apiFacts: ['stars', 'license', 'release', 'openPullRequests'],
        fileEvidence: ['README.zh-CN.md', 'package.json', 'src/server.js'],
        defaultVisible: ['overview'],
        defaultCollapsed: ['details', 'sourceSummary', 'facts'],
        factsDefaultExpanded: false,
      },
      spa: {
        pageType: spaContext.pageType,
        issueOrPrNumber: spaContext.issueOrPrNumber,
        contentScriptInstances: 1,
      },
      sessionRestore: {
        persisted: true,
        restoredAfterPanelReload: true,
        survivedPageSwitch: true,
      },
      s5SensitiveSentinel: {
        persistedPlaintext: false,
        restoredPlaintext: false,
        redactionMarker: '‹REDACTED:API_KEY›',
      },
      providerRequests: 0,
      pageErrors,
    })}`,
  );
} finally {
  await context.close();
  const expectedPrefix = `${artifactsPath}${sep}`;
  assert(profilePath.startsWith(expectedPrefix), '拒绝删除 probe-artifacts 之外的临时 profile');
  await rm(profilePath, { recursive: true, force: true });
}
