import { z } from 'zod';

import { CURRENT_SCHEMA_VERSION, StorageRepository, type StorageAreaLike } from '../lib/storage';
import type { UserPreferences } from '../lib/types';

export const PREFERENCES_STORAGE_KEY = 'preferences:v1';

export const userPreferencesSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    language: z.literal('zh-CN'),
    panelFontSize: z.union([z.literal(14), z.literal(16), z.literal(18)]).default(16),
    technicalLevel: z.enum(['beginner', 'intermediate', 'advanced']),
    operatingSystem: z.string().trim().min(1).max(100),
    explanationPreference: z.string().trim().min(1).max(500),
    operationPolicy: z
      .object({
        navigation: z.enum(['auto', 'confirm']),
        search: z.enum(['auto', 'confirm']),
        downloads: z.enum(['confirm', 'deny']),
        accountChanges: z.literal('deny'),
      })
      .strict(),
    visionEnabled: z.boolean(),
  })
  .strict();

export function defaultUserPreferences(): UserPreferences {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    language: 'zh-CN',
    panelFontSize: 16,
    technicalLevel: 'beginner',
    operatingSystem: 'Windows 11',
    explanationPreference: '分步骤说明，并解释必要术语',
    operationPolicy: {
      navigation: 'auto',
      search: 'auto',
      downloads: 'confirm',
      accountChanges: 'deny',
    },
    visionEnabled: true,
  };
}

export class PreferencesStore {
  private readonly storage: StorageRepository;

  constructor(area: StorageAreaLike = chrome.storage.local) {
    this.storage = new StorageRepository(area);
  }

  async read(): Promise<UserPreferences> {
    const candidate = await this.storage.get<unknown>(PREFERENCES_STORAGE_KEY);
    const parsed = userPreferencesSchema.safeParse(candidate);
    return parsed.success ? parsed.data : defaultUserPreferences();
  }

  async write(preferences: UserPreferences): Promise<UserPreferences> {
    const validated = userPreferencesSchema.parse(preferences);
    await this.storage.set(PREFERENCES_STORAGE_KEY, validated);
    return validated;
  }

  clear(): Promise<void> {
    return this.storage.remove(PREFERENCES_STORAGE_KEY);
  }
}

let defaultPreferencesStore: PreferencesStore | undefined;

export function preferencesStore(): PreferencesStore {
  defaultPreferencesStore ??= new PreferencesStore();
  return defaultPreferencesStore;
}
