import {
  PANEL_PORT_NAME,
  panelPickStateSchema,
  panelRegionStateSchema,
  panelSearchStateSchema,
  panelRepositoryAnalysisStateSchema,
  panelOperationConfirmationStateSchema,
  panelSessionStateSchema,
  providerStateSchema,
  streamEventSchema,
  type PanelSessionState,
  type PanelPickState,
  type PanelRegionState,
  type PanelSearchState,
  type PanelRepositoryAnalysisState,
  type PanelOperationConfirmationState,
  type ProviderState,
  type StreamEvent,
} from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../lib/messaging';
import type { ProviderId, SelectedElement, SelectedRegion } from '../lib/types';
import type { SearchTarget } from '../lib/github-search';

export interface PanelConnection {
  send(
    text: string,
    providerId?: ProviderId,
    selectedElement?: SelectedElement,
    selectedRegion?: SelectedRegion,
    sessionId?: string,
    startNewSession?: boolean,
  ): void;
  abort(requestId: string): void;
  selectSession?(sessionId: string): void;
  newSession?(): void;
  deleteTurn?(sessionId: string, userMessageId: string): void;
  deleteSession?(sessionId: string): void;
  startPick?(): void;
  cancelPick?(): void;
  startRegion?(): void;
  cancelRegion?(): void;
  search?(
    naturalLanguage: string,
    target: SearchTarget,
    providerId?: ProviderId,
    confirmed?: true,
  ): void;
  clearSearch?(): void;
  openGitHubPage?(url: string, disposition?: 'foreground' | 'background', confirmed?: true): void;
  analyzeRepository?(providerId?: ProviderId): void;
  disconnect(): void;
}

const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 5_000;

export function connectPanel(
  onEvent: (event: StreamEvent) => void,
  onProviderState: (state: ProviderState) => void,
  onConnectionChange: (connected: boolean) => void,
  onSessionState: (state: PanelSessionState) => void = () => undefined,
  onPickState: (state: PanelPickState) => void = () => undefined,
  onRegionState: (state: PanelRegionState) => void = () => undefined,
  onSearchState: (state: PanelSearchState) => void = () => undefined,
  onRepositoryAnalysisState: (state: PanelRepositoryAnalysisState) => void = () => undefined,
  onOperationConfirmationState: (state: PanelOperationConfirmationState) => void = () => undefined,
): PanelConnection {
  let activePort: chrome.runtime.Port | undefined;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const handleMessage = (raw: unknown): void => {
    const candidate = raw as { type?: unknown };
    if (candidate?.type === 'PROVIDER_STATE') {
      onProviderState(
        parseEnvelope(raw, providerStateSchema, {
          expectedType: 'PROVIDER_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type === 'SESSION_STATE') {
      onSessionState(
        parseEnvelope(raw, panelSessionStateSchema, {
          expectedType: 'SESSION_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type === 'PICK_STATE') {
      onPickState(
        parseEnvelope(raw, panelPickStateSchema, {
          expectedType: 'PICK_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type === 'REGION_STATE') {
      onRegionState(
        parseEnvelope(raw, panelRegionStateSchema, {
          expectedType: 'REGION_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type === 'SEARCH_STATE') {
      onSearchState(
        parseEnvelope(raw, panelSearchStateSchema, {
          expectedType: 'SEARCH_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type === 'REPOSITORY_ANALYSIS_STATE') {
      onRepositoryAnalysisState(
        parseEnvelope(raw, panelRepositoryAnalysisStateSchema, {
          expectedType: 'REPOSITORY_ANALYSIS_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type === 'OPERATION_CONFIRMATION_STATE') {
      onOperationConfirmationState(
        parseEnvelope(raw, panelOperationConfirmationStateSchema, {
          expectedType: 'OPERATION_CONFIRMATION_STATE',
        }).payload,
      );
      return;
    }
    if (candidate?.type !== 'STREAM_EVENT') {
      return;
    }
    const event = parseEnvelope(raw, streamEventSchema, {
      expectedType: 'STREAM_EVENT',
    });
    onEvent(event.payload);
  };

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer !== undefined) {
      return;
    }
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      openPort();
    }, delay);
  };

  const openPort = (): void => {
    if (stopped) {
      return;
    }
    try {
      const port = chrome.runtime.connect({ name: PANEL_PORT_NAME });
      activePort = port;
      reconnectAttempt = 0;
      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(() => {
        if (stopped || activePort !== port) {
          return;
        }
        activePort = undefined;
        onConnectionChange(false);
        scheduleReconnect();
      });
      onConnectionChange(true);
    } catch {
      activePort = undefined;
      onConnectionChange(false);
      scheduleReconnect();
    }
  };

  openPort();

  return {
    send(text, providerId, selectedElement, selectedRegion, sessionId, startNewSession) {
      activePort?.postMessage(
        createEnvelope('PANEL_MESSAGE', {
          text,
          providerId,
          selectedElement,
          selectedRegion,
          sessionId,
          startNewSession,
        }),
      );
    },
    abort(requestId) {
      activePort?.postMessage(createEnvelope('PANEL_ABORT', { requestId }));
    },
    selectSession(sessionId) {
      activePort?.postMessage(createEnvelope('PANEL_SESSION_SELECT', { sessionId }));
    },
    newSession() {
      activePort?.postMessage(createEnvelope('PANEL_SESSION_NEW', {}));
    },
    deleteTurn(sessionId, userMessageId) {
      activePort?.postMessage(createEnvelope('PANEL_TURN_DELETE', { sessionId, userMessageId }));
    },
    deleteSession(sessionId) {
      activePort?.postMessage(createEnvelope('PANEL_SESSION_DELETE', { sessionId }));
    },
    startPick() {
      activePort?.postMessage(createEnvelope('PANEL_PICK_START', {}));
    },
    cancelPick() {
      activePort?.postMessage(createEnvelope('PANEL_PICK_CANCEL', {}));
    },
    startRegion() {
      activePort?.postMessage(createEnvelope('PANEL_REGION_START', {}));
    },
    cancelRegion() {
      activePort?.postMessage(createEnvelope('PANEL_REGION_CANCEL', {}));
    },
    search(naturalLanguage, target, providerId, confirmed) {
      activePort?.postMessage(
        createEnvelope('PANEL_SEARCH', {
          naturalLanguage,
          target,
          providerId,
          confirmed,
        }),
      );
    },
    clearSearch() {
      activePort?.postMessage(createEnvelope('PANEL_SEARCH_CLEAR', {}));
    },
    openGitHubPage(url, disposition = 'foreground', confirmed) {
      activePort?.postMessage(
        createEnvelope('PANEL_OPEN_GITHUB_PAGE', { url, disposition, confirmed }),
      );
    },
    analyzeRepository(providerId) {
      activePort?.postMessage(createEnvelope('PANEL_ANALYZE_REPOSITORY', { providerId }));
    },
    disconnect() {
      stopped = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      const port = activePort;
      activePort = undefined;
      port?.disconnect();
      onConnectionChange(false);
    },
  };
}
