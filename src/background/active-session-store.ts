import { z } from 'zod';

import { CURRENT_SCHEMA_VERSION, type StorageAreaLike } from '../lib/storage';

export const ACTIVE_PANEL_SESSION_KEY = 'panel:active-session:v1';

const activePanelSessionSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    sessionId: z.string().min(1).max(128),
  })
  .strict();

export class ActivePanelSessionStore {
  constructor(private readonly area: StorageAreaLike = chrome.storage.session) {}

  async read(): Promise<string | undefined> {
    const stored = (await this.area.get(ACTIVE_PANEL_SESSION_KEY))[ACTIVE_PANEL_SESSION_KEY];
    if (stored === undefined) {
      return undefined;
    }
    const parsed = activePanelSessionSchema.safeParse(stored);
    if (!parsed.success) {
      await this.area.remove(ACTIVE_PANEL_SESSION_KEY);
      return undefined;
    }
    return parsed.data.sessionId;
  }

  async write(sessionId: string): Promise<void> {
    await this.area.set({
      [ACTIVE_PANEL_SESSION_KEY]: activePanelSessionSchema.parse({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessionId,
      }),
    });
  }

  async clear(): Promise<void> {
    await this.area.remove(ACTIVE_PANEL_SESSION_KEY);
  }
}

let defaultActivePanelSessionStore: ActivePanelSessionStore | undefined;

export function activePanelSessionStore(): ActivePanelSessionStore {
  defaultActivePanelSessionStore ??= new ActivePanelSessionStore();
  return defaultActivePanelSessionStore;
}
