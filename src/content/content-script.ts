import { handlePageInfoRequest } from './page-info';
import { parseGitHubPage } from './parsers';
import { startGitHubSpaWatcher } from './spa-watcher';
import type { PageContext } from '../lib/types';
import { initializeOnce } from './bootstrap';
import {
  contentPickCancelSchema,
  contentPickStartSchema,
  contentRegionCancelResponseSchema,
  contentRegionCancelSchema,
  contentRegionStartSchema,
  pickOutcomeSchema,
  regionOutcomeSchema,
} from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../lib/messaging';
import { PickController } from './selection/pick';
import { RegionController } from './selection/region';

const CONTENT_SCRIPT_BOOT_KEY = '__gitHelperContentScriptBootV1';

initializeOnce(
  globalThis as unknown as Record<string, unknown>,
  CONTENT_SCRIPT_BOOT_KEY,
  initializeContentScript,
);

function initializeContentScript(): void {
  const INJECTED_ATTR = 'data-git-helper-injected';

  document.documentElement.setAttribute(INJECTED_ATTR, 'true');
  let currentPageContext: PageContext | undefined;
  const picker = new PickController(document, () => window.location.href);
  const regionSelector = new RegionController(document, () => window.location.href);

  function clearTransientSelectionState(): void {
    picker.cancel('页面已变化，点击选择已取消');
    regionSelector.cancel('页面已变化，框选已取消');
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

  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (response: unknown) => void) => {
      if (sender.id !== chrome.runtime.id) {
        return false;
      }
      const type = (message as { type?: unknown } | null)?.type;
      if (type === 'PICK_START_REQUEST') {
        try {
          const request = parseEnvelope(message, contentPickStartSchema, {
            expectedType: 'PICK_START_REQUEST',
          });
          regionSelector.cancel('已切换到点击选择');
          void picker.start().then((outcome) => {
            sendResponse(
              createEnvelope('PICK_START_RESPONSE', pickOutcomeSchema.parse(outcome), {
                id: request.id,
              }),
            );
          });
          return true;
        } catch {
          return false;
        }
      }
      if (type === 'REGION_START_REQUEST') {
        try {
          const request = parseEnvelope(message, contentRegionStartSchema, {
            expectedType: 'REGION_START_REQUEST',
          });
          picker.cancel('已切换到区域框选');
          void regionSelector.start().then((outcome) => {
            sendResponse(
              createEnvelope('REGION_START_RESPONSE', regionOutcomeSchema.parse(outcome), {
                id: request.id,
              }),
            );
          });
          return true;
        } catch {
          return false;
        }
      }
      if (type === 'REGION_CANCEL_REQUEST') {
        try {
          const request = parseEnvelope(message, contentRegionCancelSchema, {
            expectedType: 'REGION_CANCEL_REQUEST',
          });
          regionSelector.cancel('用户已取消框选');
          sendResponse(
            createEnvelope(
              'REGION_CANCEL_RESPONSE',
              contentRegionCancelResponseSchema.parse({ cancelled: true }),
              { id: request.id },
            ),
          );
        } catch {
          return false;
        }
      }
      if (type === 'PICK_CANCEL_REQUEST') {
        try {
          const request = parseEnvelope(message, contentPickCancelSchema, {
            expectedType: 'PICK_CANCEL_REQUEST',
          });
          picker.cancel('用户已取消点击选择');
          sendResponse(
            createEnvelope(
              'PICK_CANCEL_RESPONSE',
              { cancelled: true },
              {
                id: request.id,
              },
            ),
          );
        } catch {
          return false;
        }
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
}
