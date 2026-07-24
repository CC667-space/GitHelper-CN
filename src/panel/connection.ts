import {
  PANEL_PORT_NAME,
  providerStateSchema,
  streamEventSchema,
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

export function connectPanel(
  onEvent: (event: StreamEvent) => void,
  onProviderState: (state: ProviderState) => void,
  onConnectionChange: (connected: boolean) => void,
): PanelConnection {
  const port = chrome.runtime.connect({ name: PANEL_PORT_NAME });
  onConnectionChange(true);
  port.onMessage.addListener((raw: unknown) => {
    const candidate = raw as { type?: unknown };
    if (candidate?.type === 'PROVIDER_STATE') {
      onProviderState(
        parseEnvelope(raw, providerStateSchema, {
          expectedType: 'PROVIDER_STATE',
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
  });
  port.onDisconnect.addListener(() => onConnectionChange(false));
  return {
    send(text, providerId) {
      port.postMessage(createEnvelope('PANEL_MESSAGE', { text, providerId }));
    },
    abort(requestId) {
      port.postMessage(createEnvelope('PANEL_ABORT', { requestId }));
    },
    disconnect() {
      port.disconnect();
    },
  };
}
