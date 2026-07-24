import {
  createOptionsCredentialStore,
  type CredentialStorageArea,
} from '../background/credential-store';
import { PreferencesStore } from '../background/prefs-store';
import { SessionStore } from '../background/session-store';
import type { StorageAreaLike } from '../lib/storage';

type LocalDataArea = StorageAreaLike & CredentialStorageArea;

export function createLocalDataManager(area: LocalDataArea) {
  const sessions = new SessionStore(area);
  const preferences = new PreferencesStore(area);
  const credentials = createOptionsCredentialStore(area);
  return {
    async clearSessionsAndPreferences(): Promise<void> {
      await Promise.all([sessions.clear(), preferences.clear()]);
    },
    async clearAllLocalData(): Promise<void> {
      await credentials.deleteAll();
      await area.clear();
    },
  };
}

export async function clearSessionsAndPreferences(): Promise<void> {
  await createLocalDataManager(chrome.storage.local).clearSessionsAndPreferences();
}

export async function clearAllLocalData(): Promise<void> {
  await createLocalDataManager(chrome.storage.local).clearAllLocalData();
}
