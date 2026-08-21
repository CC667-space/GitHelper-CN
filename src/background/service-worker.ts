import { registerPanelPortBridge } from './panel-bridge';
import { registerOptionsRouter } from './options-router';
import { ProviderRuntime } from './provider-runtime';

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

async function openSidePanelForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    throw new Error('活动标签页缺少 tabId');
  }
  await chrome.sidePanel.open({ tabId: tab.id });
}

chrome.action.onClicked.addListener((tab) => {
  void openSidePanelForTab(tab).catch(() => undefined);
});

chrome.tabs.onActivated.addListener(({ windowId }) => {
  const close = (
    chrome.sidePanel as typeof chrome.sidePanel & {
      close?: (options: { windowId: number }) => Promise<void>;
    }
  ).close;
  if (!close) {
    return;
  }
  void close.call(chrome.sidePanel, { windowId }).catch(() => undefined);
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
      return openSidePanelForTab(tab);
    })
    .catch(() => undefined);
});
