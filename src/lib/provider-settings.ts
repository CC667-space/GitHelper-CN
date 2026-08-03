import { z } from 'zod';

import { PROVIDER_CATALOG, providerIdSchema, type ProviderId } from './provider-catalog';

const STORAGE_KEY = 'provider:settings:v1';

const providerSettingSchema = z
  .object({
    textModel: z.string().trim().max(300),
    visionModel: z.string().trim().max(300).optional(),
  })
  .strict();

const storedProviderSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    providers: z.partialRecord(providerIdSchema, providerSettingSchema),
  })
  .strict();

export type ProviderSetting = z.infer<typeof providerSettingSchema>;
export interface ProviderSettings {
  schemaVersion: 1;
  providers: Record<ProviderId, ProviderSetting>;
}

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

function mergeWithDefaultProviderSettings(
  stored: z.infer<typeof storedProviderSettingsSchema>,
): ProviderSettings {
  const defaults = defaultProviderSettings();
  return {
    schemaVersion: 1,
    providers: Object.fromEntries(
      PROVIDER_CATALOG.map((entry) => [
        entry.id,
        stored.providers[entry.id] ?? defaults.providers[entry.id],
      ]),
    ) as Record<ProviderId, ProviderSetting>,
  };
}

export class ProviderSettingsJsonError extends Error {
  readonly code = 'PROVIDER_SETTINGS_JSON_INVALID';

  constructor() {
    super('Provider 配置 JSON 无效；只允许配置内置 Provider 的模型名称。');
    this.name = 'ProviderSettingsJsonError';
  }
}

export function parseProviderSettingsJson(source: string): ProviderSettings {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new ProviderSettingsJsonError();
  }

  const parsed = storedProviderSettingsSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ProviderSettingsJsonError();
  }
  return mergeWithDefaultProviderSettings(parsed.data);
}

export function serializeProviderSettingsJson(settings: ProviderSettings): string {
  try {
    const providers = Object.fromEntries(
      PROVIDER_CATALOG.map((entry) => {
        const setting = providerSettingSchema.parse(settings.providers[entry.id]);
        return [
          entry.id,
          setting.visionModel === undefined
            ? { textModel: setting.textModel }
            : { textModel: setting.textModel, visionModel: setting.visionModel },
        ];
      }),
    );
    return JSON.stringify({ schemaVersion: 1, providers }, null, 2);
  } catch {
    throw new ProviderSettingsJsonError();
  }
}

export function createProviderSettingsStore(area: ProviderSettingsArea) {
  return {
    async read(): Promise<ProviderSettings> {
      const result = await area.get(STORAGE_KEY);
      const parsed = storedProviderSettingsSchema.safeParse(result[STORAGE_KEY]);
      return parsed.success
        ? mergeWithDefaultProviderSettings(parsed.data)
        : defaultProviderSettings();
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
    async importJson(source: string): Promise<ProviderSettings> {
      const settings = parseProviderSettingsJson(source);
      await area.set({ [STORAGE_KEY]: settings });
      return settings;
    },
    async exportJson(): Promise<string> {
      return serializeProviderSettingsJson(await this.read());
    },
  };
}

export function providerSettingsStore() {
  return createProviderSettingsStore(chrome.storage.local);
}
