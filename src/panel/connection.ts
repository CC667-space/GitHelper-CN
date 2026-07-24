import { PANEL_PORT_NAME, streamEventSchema, type StreamEvent } from '../lib/bridge-protocol';
import { createEnvelope, parseEnvelope } from '../lib/messaging';

export interface PanelConnection {
  send(text: string): void;
  disconnect(): void;
}

export function connectPanel(
  onEvent: (event: StreamEvent) => void,
  onConnectionChange: (connected: boolean) => void,
): PanelConnection {
  const port = chrome.runtime.connect({ name: PANEL_PORT_NAME });
  onConnectionChange(true);
  port.onMessage.addListener((raw: unknown) => {
    const candidate = raw as { type?: unknown };
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
    send(text) {
      port.postMessage(createEnvelope('PANEL_MESSAGE', { text }));
    },
    disconnect() {
      port.disconnect();
    },
  };
}
