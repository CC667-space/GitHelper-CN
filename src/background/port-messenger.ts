type PostMessagePort = Pick<chrome.runtime.Port, 'postMessage'>;

function isDisconnectedPortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /disconnected port object/i.test(message);
}

export interface PortMessenger {
  post(message: unknown): boolean;
  markDisconnected(): void;
}

/**
 * Serializes all outbound Port messages through the Port lifecycle.
 * Chrome can make a Port unusable just before onDisconnect is delivered, so
 * the synchronous postMessage failure must be handled as well as the event.
 */
export function createPortMessenger(port: PostMessagePort): PortMessenger {
  let connected = true;

  return {
    post(message) {
      if (!connected) {
        return false;
      }
      try {
        port.postMessage(message);
        return true;
      } catch (error) {
        if (isDisconnectedPortError(error)) {
          connected = false;
          return false;
        }
        throw error;
      }
    },
    markDisconnected() {
      connected = false;
    },
  };
}
