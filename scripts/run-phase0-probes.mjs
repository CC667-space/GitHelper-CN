import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const extensionPath = fileURLToPath(new URL('../dist/', import.meta.url));
const artifactsPath = fileURLToPath(new URL('../probe-artifacts/', import.meta.url));
await mkdir(artifactsPath, { recursive: true });
const profilePath = await mkdtemp(join(artifactsPath, 'chrome-profile-'));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(
  new URL('../probe-artifacts/playwright-browsers/', import.meta.url),
);
const { chromium } = await import('playwright-core');
const execFileAsync = promisify(execFile);

async function invokeExtensionAction() {
  const command = [
    "$target = Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*openai-node*' }",
    '$target = $target | Sort-Object StartTime -Descending | Select-Object -First 1',
    "if (-not $target) { throw '未找到隔离 Chromium 探针窗口' }",
    '$shell = New-Object -ComObject WScript.Shell',
    "if (-not $shell.AppActivate($target.Id)) { throw '无法激活隔离 Chromium 探针窗口' }",
    'Add-Type -AssemblyName UIAutomationClient',
    'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; using System.Threading; public static class GitHelperMouse { [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra); public static void Click(int x, int y) { SetCursorPos(x,y); Thread.Sleep(100); mouse_event(0x0002,0,0,0,UIntPtr.Zero); Thread.Sleep(80); mouse_event(0x0004,0,0,0,UIntPtr.Zero); } }\'',
    '$automationRoot = [System.Windows.Automation.AutomationElement]::FromHandle($target.MainWindowHandle)',
    '$automationElements = $automationRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)',
    "$extensionsButton = $automationElements | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -match '^(扩展程序|Extensions)$' } | Select-Object -First 1",
    "if (-not $extensionsButton) { throw 'UI Automation 未找到扩展程序按钮' }",
    '$extensionsRect = $extensionsButton.Current.BoundingRectangle',
    '[GitHelperMouse]::Click([int]($extensionsRect.Left + $extensionsRect.Width / 2), [int]($extensionsRect.Top + $extensionsRect.Height / 2))',
    'Start-Sleep -Milliseconds 800',
    '$menuElements = $automationRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)',
    "$menuNames = $menuElements | Where-Object { $_.Current.Name -match 'GitHelper|扩展程序|Side Panel|侧边栏' } | ForEach-Object { $_.Current.ControlType.ProgrammaticName + ':' + $_.Current.Name }",
    "Write-Output ('UIA_MENU=' + (($menuNames | Select-Object -Unique) -join '|'))",
    "$gitHelperAction = $menuElements | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -eq 'GitHelper-CN' -and $_.Current.BoundingRectangle.Width -gt 0 } | Select-Object -First 1",
    "if (-not $gitHelperAction) { throw '扩展程序菜单中未找到可调用的 GitHelper-CN action' }",
    '$gitHelperRect = $gitHelperAction.Current.BoundingRectangle',
    '[GitHelperMouse]::Click([int]($gitHelperRect.Left + $gitHelperRect.Width / 2), [int]($gitHelperRect.Top + $gitHelperRect.Height / 2))',
    "Write-Output ('ACTION_TARGET=' + $target.Id + ':' + $target.MainWindowTitle)",
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command]);
  console.error(stdout.trim());
}

const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: chromium.executablePath(),
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--force-device-scale-factor=1.5',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-component-update',
    '--window-size=1440,1000',
  ],
  viewport: null,
});

try {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  }
  serviceWorker.on('console', (message) => {
    console.error(`SERVICE_WORKER_CONSOLE=${message.type()}:${message.text()}`);
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (message) => {
    console.error(`PAGE_CONSOLE=${message.type()}:${message.text()}`);
  });
  page.on('pageerror', (error) => {
    console.error(`PAGE_ERROR=${error.message}`);
  });
  page.on('requestfailed', (request) => {
    console.error(`REQUEST_FAILED=${request.url()}:${request.failure()?.errorText ?? 'unknown'}`);
  });
  const extensionId = new URL(serviceWorker.url()).host;
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await optionsPage.locator('#phase0-open-side-panel').click();
  await optionsPage
    .getByTestId('phase0-side-panel-status')
    .getByText('Side Panel 已打开')
    .waitFor({ timeout: 10_000 });
  await page.bringToFront();

  await page.goto('https://github.com/openai/openai-node', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  console.error(
    `PROBE_DIAGNOSTIC=${JSON.stringify({
      serviceWorkerUrl: serviceWorker.url(),
      pageUrl: page.url(),
      pageTitle: await page.title(),
      bodyPreview: await page
        .locator('body')
        .innerText()
        .catch(() => '')
        .then((text) => text.slice(0, 200)),
    })}`,
  );
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-git-helper-injected') === 'true',
    undefined,
    { timeout: 20_000 },
  );
  await page.evaluate(() => window.scrollTo(0, Math.min(900, document.body.scrollHeight / 3)));
  const browserZoomFactor = await serviceWorker.evaluate(async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.setZoom(activeTab.id, 1.25);
    return chrome.tabs.getZoom(activeTab.id);
  });
  await page.waitForTimeout(1_000);
  const registeredCommands = await serviceWorker.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.commands.getAll((commands) => resolve(commands));
      }),
  );
  console.error(`REGISTERED_COMMANDS=${JSON.stringify(registeredCommands)}`);
  await invokeExtensionAction();
  await page.waitForTimeout(1_000);
  const shortcutProbeState = await serviceWorker.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.storage.local.get('phase0Probe', (value) => resolve(value.phase0Probe));
      }),
  );
  if (!shortcutProbeState) {
    const triggerPage = context
      .pages()
      .find(
        (candidate) =>
          candidate.url().startsWith(`chrome-extension://${extensionId}/`) && !candidate.isClosed(),
      );
    if (!triggerPage) {
      throw new Error('未找到可发送 Phase 0 探针消息的扩展页面');
    }
    console.error(`PHASE0_TRIGGER_PAGE=${triggerPage.url()}`);
    const messageResult = await triggerPage.evaluate(async () => {
      try {
        return await Promise.race([
          chrome.runtime.sendMessage({ type: 'PHASE0_RUN' }),
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: false, error: 'message timeout' }), 15_000),
          ),
        ]);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    console.error(`PHASE0_MESSAGE_RESULT=${JSON.stringify(messageResult)}`);
    const messageDiagnostics = await serviceWorker.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.storage.local.get(['phase0MessageReceived', 'phase0Probe'], (value) =>
            resolve(value),
          );
        }),
    );
    console.error(`PHASE0_MESSAGE_DIAGNOSTICS=${JSON.stringify(messageDiagnostics)}`);
  }

  const deadline = Date.now() + 45_000;
  let probe;
  while (Date.now() < deadline) {
    probe = await serviceWorker.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.storage.local.get('phase0Probe', (value) => resolve(value.phase0Probe));
        }),
    );
    if (probe?.status === 'passed' || probe?.status === 'failed') {
      break;
    }
    await page.waitForTimeout(500);
  }

  const panelTargets = context
    .pages()
    .map((candidate) => candidate.url())
    .filter((url) => url.includes('/src/panel/index.html'));
  const payload = {
    chromeVersion: await page.evaluate(() => navigator.userAgent),
    pageUrl: page.url(),
    pageTitle: await page.title(),
    simulatedDeviceScaleFactor: 1.5,
    browserZoomFactor,
    sidePanelTargets: panelTargets,
    probe,
  };
  console.log(`PHASE0_PROBE_JSON=${JSON.stringify(payload)}`);
  if (!probe || probe.status !== 'passed' || probe.allTargetsAligned !== true) {
    process.exitCode = 1;
  }
} finally {
  await context.close();
  await rm(profilePath, { recursive: true, force: true });
}
