import {
  createOptionsCredentialStore,
  type CredentialStorageArea,
} from '../background/credential-store';
import { ACTIVE_PANEL_SESSION_KEY } from '../background/active-session-store';
import { SEARCH_SNAPSHOT_STORAGE_KEY } from '../background/search-snapshot-store';
import { PreferencesStore } from '../background/prefs-store';
import { SessionStore } from '../background/session-store';
import type { StorageAreaLike } from '../lib/storage';

type LocalDataArea = StorageAreaLike & CredentialStorageArea;

export function createLocalDataManager(area: LocalDataArea, sessionArea?: StorageAreaLike) {
  const sessions = new SessionStore(area);
  const preferences = new PreferencesStore(area);
  const credentials = createOptionsCredentialStore(area);
  return {
    async clearSessionsAndPreferences(): Promise<void> {
      await Promise.all([sessions.clear(), preferences.clear()]);
      await sessionArea?.remove([ACTIVE_PANEL_SESSION_KEY, SEARCH_SNAPSHOT_STORAGE_KEY]);
    },
    async clearAllLocalData(): Promise<void> {
      await credentials.deleteAll();
      await area.clear();
      await sessionArea?.clear();
    },
  };
}

export async function clearSessionsAndPreferences(): Promise<void> {
  await createLocalDataManager(
    chrome.storage.local,
    chrome.storage.session,
  ).clearSessionsAndPreferences();
}

export async function clearAllLocalData(): Promise<void> {
  await createLocalDataManager(chrome.storage.local, chrome.storage.session).clearAllLocalData();
}
