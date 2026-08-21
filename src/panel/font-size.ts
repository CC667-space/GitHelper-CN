import {
  PREFERENCES_STORAGE_KEY,
  PreferencesStore,
  userPreferencesSchema,
} from '../background/prefs-store';
import type { UserPreferences } from '../lib/types';

type StorageChange = { newValue?: unknown };
type StorageChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;

interface PreferencesReader {
  read(): Promise<UserPreferences>;
}

interface StorageChangesLike {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

interface PanelFontSizeDependencies {
  reader?: PreferencesReader;
  changes?: StorageChangesLike;
}

function applyPanelFontSize(root: HTMLElement, size: UserPreferences['panelFontSize']): void {
  root.style.fontSize = `${size}px`;
}

export async function installPanelFontSizePreference(
  root: HTMLElement,
  dependencies: PanelFontSizeDependencies = {},
): Promise<() => void> {
  const reader = dependencies.reader ?? new PreferencesStore();
  const changes = dependencies.changes ?? chrome.storage.onChanged;

  applyPanelFontSize(root, 16);
  applyPanelFontSize(root, (await reader.read()).panelFontSize);

  const listener: StorageChangeListener = (storageChanges, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    const changed = storageChanges[PREFERENCES_STORAGE_KEY];
    if (!changed) {
      return;
    }
    if (changed.newValue === undefined) {
      applyPanelFontSize(root, 16);
      return;
    }
    const parsed = userPreferencesSchema.safeParse(changed.newValue);
    if (parsed.success) {
      applyPanelFontSize(root, parsed.data.panelFontSize);
    }
  };
  changes.addListener(listener);

  return () => changes.removeListener(listener);
}
