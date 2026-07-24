import { handlePageInfoRequest } from './page-info';
import { parseGitHubPage } from './parsers';
import { startGitHubSpaWatcher } from './spa-watcher';
import type { PageContext } from '../lib/types';
import { initializeOnce } from './bootstrap';

const CONTENT_SCRIPT_BOOT_KEY = '__gitHelperContentScriptBootV1';

initializeOnce(
  globalThis as unknown as Record<string, unknown>,
  CONTENT_SCRIPT_BOOT_KEY,
  initializeContentScript,
);

function initializeContentScript(): void {
  const INJECTED_ATTR = 'data-git-helper-injected';
  const MARKER_ID = 'git-helper-phase0-probe-marker';
  const MARKER_RGB = 'rgb(17, 221, 119)';

  document.documentElement.setAttribute(INJECTED_ATTR, 'true');
  let currentPageContext: PageContext | undefined;

  function clearTransientSelectionState(): void {
    document
      .querySelectorAll('[data-git-helper-selection-overlay]')
      .forEach((element) => element.remove());
    document.dispatchEvent(new CustomEvent('git-helper:context-invalidated'));
  }

  startGitHubSpaWatcher({
    onInvalidate() {
      currentPageContext = undefined;
      clearTransientSelectionState();
    },
    onRefresh() {
      currentPageContext = parseGitHubPage(document, window.location.href);
    },
  });

  interface ProbeMessage {
    type: 'PHASE0_BASIC' | 'PHASE0_PREPARE_TARGET' | 'PHASE0_CLEANUP_TARGET';
    index?: number;
  }

  function removeMarker(): void {
    document.getElementById(MARKER_ID)?.remove();
  }

  function findTarget(index: number): Element {
    const points = [
      { x: 0.18, y: 0.04 },
      { x: 0.52, y: 0.5 },
      { x: 0.78, y: 0.78 },
    ];
    const point = points[index] ?? points[0]!;
    const x = Math.max(1, Math.min(window.innerWidth - 2, Math.round(window.innerWidth * point.x)));
    const y = Math.max(
      1,
      Math.min(window.innerHeight - 2, Math.round(window.innerHeight * point.y)),
    );
    return document.elementFromPoint(x, y) ?? document.body;
  }

  function prepareTarget(index: number): Record<string, unknown> {
    removeMarker();
    const target = findTarget(index);
    const targetRect = target.getBoundingClientRect();
    const markerSize = 24;
    const markerX = Math.max(
      2,
      Math.min(window.innerWidth - markerSize - 2, targetRect.left + targetRect.width / 2 - 12),
    );
    const markerY = Math.max(
      2,
      Math.min(window.innerHeight - markerSize - 2, targetRect.top + targetRect.height / 2 - 12),
    );

    const marker = document.createElement('div');
    marker.id = MARKER_ID;
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, {
      position: 'fixed',
      left: `${markerX}px`,
      top: `${markerY}px`,
      width: `${markerSize}px`,
      height: `${markerSize}px`,
      background: MARKER_RGB,
      zIndex: '2147483647',
      pointerEvents: 'none',
    });
    document.documentElement.append(marker);

    return {
      target: {
        tag: target.tagName.toLowerCase(),
        id: target.id,
        text: (target.textContent ?? '').trim().slice(0, 80),
        rect: {
          x: targetRect.x,
          y: targetRect.y,
          width: targetRect.width,
          height: targetRect.height,
        },
      },
      markerRect: {
        x: markerX,
        y: markerY,
        width: markerSize,
        height: markerSize,
      },
      viewport: {
        cssWidth: window.innerWidth,
        cssHeight: window.innerHeight,
      },
      scroll: {
        x: window.scrollX,
        y: window.scrollY,
      },
      devicePixelRatio: window.devicePixelRatio,
    };
  }

  chrome.runtime.onMessage.addListener(
    (message: ProbeMessage, _sender, sendResponse: (response: unknown) => void) => {
      if (message.type === 'PHASE0_BASIC') {
        void chrome.storage.local
          .get('phase0CredentialSentinel')
          .then((value) => {
            sendResponse({
              injected: true,
              url: window.location.href,
              credentialSentinelVisible: value.phase0CredentialSentinel === 'phase0-secret',
              viewport: {
                cssWidth: window.innerWidth,
                cssHeight: window.innerHeight,
              },
              scroll: {
                x: window.scrollX,
                y: window.scrollY,
              },
              devicePixelRatio: window.devicePixelRatio,
            });
          })
          .catch((error: unknown) => {
            sendResponse({
              injected: true,
              url: window.location.href,
              credentialSentinelVisible: false,
              storageReadRejected: true,
              storageError: error instanceof Error ? error.message : String(error),
              viewport: {
                cssWidth: window.innerWidth,
                cssHeight: window.innerHeight,
              },
              scroll: {
                x: window.scrollX,
                y: window.scrollY,
              },
              devicePixelRatio: window.devicePixelRatio,
            });
          });
        return true;
      }

      if (message.type === 'PHASE0_PREPARE_TARGET') {
        sendResponse(prepareTarget(message.index ?? 0));
        return false;
      }

      if (message.type === 'PHASE0_CLEANUP_TARGET') {
        removeMarker();
        sendResponse({ cleaned: true });
        return false;
      }

      return false;
    },
  );

  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (response: unknown) => void) => {
      if (
        sender.id !== chrome.runtime.id ||
        (message as { type?: unknown } | null)?.type !== 'PAGE_INFO_REQUEST'
      ) {
        return false;
      }
      try {
        sendResponse(
          handlePageInfoRequest(
            message,
            document,
            window.location,
            document.title,
            new Date(),
            currentPageContext,
          ),
        );
      } catch {
        return false;
      }
      return false;
    },
  );

  const probeRunButton = document.createElement('button');
  probeRunButton.id = 'git-helper-phase0-run-button';
  probeRunButton.type = 'button';
  probeRunButton.setAttribute('aria-hidden', 'true');
  Object.assign(probeRunButton.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'auto',
    zIndex: '-1',
  });
  probeRunButton.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'PHASE0_RUN' });
  });
  document.documentElement.append(probeRunButton);
}
