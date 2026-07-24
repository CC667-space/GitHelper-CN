import { z } from 'zod';

import { PROVIDER_CATALOG } from './provider-catalog';
import type { ProviderId } from './types';

const STORAGE_KEY = 'provider:settings:v1';

const providerSettingSchema = z
  .object({
    textModel: z.string().trim().max(300),
    visionModel: z.string().trim().max(300).optional(),
  })
  .strict();

const providerSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    providers: z.record(z.enum(['deepseek', 'uuapi', 'openrouter']), providerSettingSchema),
  })
  .strict();

export type ProviderSetting = z.infer<typeof providerSettingSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

export interface ProviderSettingsArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function defaultProviderSettings(): ProviderSettings {
  return {
    schemaVersion: 1,
    providers: Object.fromEntries(
      PROVIDER_CATALOG.map((entry) => [
        entry.id,
        {
          textModel: entry.defaultTextModel,
          visionModel: entry.defaultVisionModel,
        },
      ]),
    ) as Record<ProviderId, ProviderSetting>,
  };
}

export function createProviderSettingsStore(area: ProviderSettingsArea) {
  return {
    async read(): Promise<ProviderSettings> {
      const result = await area.get(STORAGE_KEY);
      const parsed = providerSettingsSchema.safeParse(result[STORAGE_KEY]);
      return parsed.success ? parsed.data : defaultProviderSettings();
    },
    async writeProvider(providerId: ProviderId, setting: ProviderSetting): Promise<void> {
      const current = await this.read();
      const validated = providerSettingSchema.parse(setting);
      await area.set({
        [STORAGE_KEY]: {
          ...current,
          providers: { ...current.providers, [providerId]: validated },
        },
      });
    },
  };
}

export function providerSettingsStore() {
  return createProviderSettingsStore(chrome.storage.local);
}
