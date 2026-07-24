import { registerPanelPortBridge } from './panel-bridge';
import { registerOptionsRouter } from './options-router';
import { ProviderRuntime } from './provider-runtime';

const PROBE_KEY = 'phase0Probe';
const MARKER_RGBA = [17, 221, 119, 255] as const;

interface MarkerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreparedTarget {
  target: {
    tag: string;
    id: string;
    text: string;
    rect: MarkerRect;
  };
  markerRect: MarkerRect;
  viewport: {
    cssWidth: number;
    cssHeight: number;
  };
  scroll: {
    x: number;
    y: number;
  };
  devicePixelRatio: number;
}

interface ActualBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setTrustedStorageAccess(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

void setTrustedStorageAccess();
const providerRuntime = new ProviderRuntime();
registerPanelPortBridge(providerRuntime);
registerOptionsRouter(providerRuntime);
chrome.runtime.onInstalled.addListener(() => {
  void setTrustedStorageAccess();
});
chrome.runtime.onStartup.addListener(() => {
  void setTrustedStorageAccess();
});

function closeEnough(actual: number, expected: number, tolerance = 3): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

async function inspectCapturedMarker(
  dataUrl: string,
  prepared: PreparedTarget,
): Promise<Record<string, unknown>> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('无法创建 2D OffscreenCanvas 上下文');
  }
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;

  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const offset = (y * bitmap.width + x) * 4;
      if (
        pixels[offset] === MARKER_RGBA[0] &&
        pixels[offset + 1] === MARKER_RGBA[1] &&
        pixels[offset + 2] === MARKER_RGBA[2] &&
        pixels[offset + 3] === MARKER_RGBA[3]
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    throw new Error('截图中未找到校准标记');
  }

  const scaleX = bitmap.width / prepared.viewport.cssWidth;
  const scaleY = bitmap.height / prepared.viewport.cssHeight;
  const expected = {
    x: Math.round(prepared.markerRect.x * scaleX),
    y: Math.round(prepared.markerRect.y * scaleY),
    width: Math.round(prepared.markerRect.width * scaleX),
    height: Math.round(prepared.markerRect.height * scaleY),
  };
  const actual: ActualBounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const aligned =
    closeEnough(actual.x, expected.x) &&
    closeEnough(actual.y, expected.y) &&
    closeEnough(actual.width, expected.width) &&
    closeEnough(actual.height, expected.height);

  bitmap.close();
  return {
    captured: {
      width: canvas.width,
      height: canvas.height,
    },
    scaleX,
    scaleY,
    expected,
    actual,
    aligned,
    dprTimesZoomInference: prepared.devicePixelRatio,
    scrollCompensationApplied: false,
  };
}

async function runPhase0Probe(
  tab: chrome.tabs.Tab,
  options: { sidePanelAlreadyVerified?: boolean } = {},
): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined) {
    throw new Error('活动标签页缺少 tabId/windowId');
  }

  const startedAt = new Date().toISOString();
  const result: Record<string, unknown> = {
    status: 'running',
    startedAt,
    tabId: tab.id,
    windowId: tab.windowId,
    permissions: ['sidePanel', 'storage', 'activeTab'],
    hostPermissions: [
      'https://github.com/*',
      'https://api.github.com/*',
      'https://api.deepseek.com/*',
      'https://uuapi.net/*',
      'https://openrouter.ai/*',
    ],
    tabsPermissionDeclared: false,
    scriptingPermissionDeclared: false,
  };
  await chrome.storage.local.set({
    [PROBE_KEY]: result,
    phase0CredentialSentinel: 'phase0-secret',
  });

  try {
    if (options.sidePanelAlreadyVerified) {
      result.sidePanelOpenResolved = true;
      result.sidePanelVerifiedByOptionsGesture = true;
    } else {
      await chrome.sidePanel.open({ tabId: tab.id });
      result.sidePanelOpenResolved = true;
      await delay(500);
    }

    const basic = (await chrome.tabs.sendMessage(tab.id, {
      type: 'PHASE0_BASIC',
    })) as Record<string, unknown>;
    result.basic = basic;
    result.staticContentScriptSucceeded = basic.injected === true;
    result.activeTabUrl = tab.url ?? basic.url;
    result.zoomFactor = await chrome.tabs.getZoom(tab.id);
    result.trustedStorageBlockedContent = basic.credentialSentinelVisible === false;

    const targets: Record<string, unknown>[] = [];
    for (let index = 0; index < 3; index += 1) {
      const prepared = (await chrome.tabs.sendMessage(tab.id, {
        type: 'PHASE0_PREPARE_TARGET',
        index,
      })) as PreparedTarget;
      await delay(600);
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const validation = await inspectCapturedMarker(screenshot, prepared);
      targets.push({
        index,
        prepared,
        validation,
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'PHASE0_CLEANUP_TARGET' });
      await delay(600);
    }
    result.targets = targets;
    result.captureVisibleTabSucceeded = true;
    result.allTargetsAligned = targets.every(
      (target) => (target.validation as { aligned?: boolean }).aligned === true,
    );
    result.status = 'passed';
  } catch (error: unknown) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await chrome.storage.local.remove('phase0CredentialSentinel');
    result.completedAt = new Date().toISOString();
    await chrome.storage.local.set({ [PROBE_KEY]: result });
  }
}

chrome.action.onClicked.addListener((tab) => {
  void runPhase0Probe(tab, { sidePanelAlreadyVerified: true });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-side-panel') {
    return;
  }
  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (!tab) {
        throw new Error('快捷键触发时未找到活动标签页');
      }
      return runPhase0Probe(tab);
    })
    .catch(async (error: unknown) => {
      await chrome.storage.local.set({
        [PROBE_KEY]: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date().toISOString(),
        },
      });
    });
});

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string },
    _sender,
    sendResponse: (response: Record<string, unknown>) => void,
  ) => {
    if (message.type !== 'PHASE0_RUN') {
      return false;
    }
    sendResponse({ ok: true, accepted: true });
    void (async () => {
      await chrome.storage.local.set({
        phase0MessageReceived: new Date().toISOString(),
      });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('探针消息未找到活动标签页');
      }
      await runPhase0Probe(tab, { sidePanelAlreadyVerified: true });
    })().catch(async (error: unknown) => {
      await chrome.storage.local.set({
        [PROBE_KEY]: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date().toISOString(),
        },
      });
    });
    return false;
  },
);
