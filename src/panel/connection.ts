import {
  PANEL_PORT_NAME,
  panelSessionStateSchema,
  providerStateSchema,
  streamEventSchema,
  type PanelSessionState,
  type ProviderState,
  type StreamEvent,
} from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../lib/messaging';
import type { ProviderId } from '../lib/types';

export interface PanelConnection {
  send(text: string, providerId?: ProviderId): void;
  abort(requestId: string): void;
  disconnect(): void;
}

const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 5_000;

export function connectPanel(
  onEvent: (event: StreamEvent) => void,
  onProviderState: (state: ProviderState) => void,
  onConnectionChange: (connected: boolean) => void,
  onSessionState: (state: PanelSessionState) => void = () => undefined,
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
    send(text, providerId) {
      activePort?.postMessage(createEnvelope('PANEL_MESSAGE', { text, providerId }));
    },
    abort(requestId) {
      activePort?.postMessage(createEnvelope('PANEL_ABORT', { requestId }));
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
