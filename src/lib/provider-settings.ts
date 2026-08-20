import { z } from 'zod';

import { normalizeCustomProviderUrl } from './custom-provider-config';
import { PROVIDER_CATALOG, providerIdSchema, type ProviderId } from './provider-catalog';

const STORAGE_KEY = 'provider:settings:v1';

const modelSettingSchema = z
  .object({
    textModel: z.string().trim().max(300),
    visionModel: z.string().trim().max(300).optional(),
  })
  .strict();

const providerSettingSchema = z
  .object({
    textModel: z.string().trim().max(300),
    visionModel: z.string().trim().max(300).optional(),
    baseUrl: z.string().trim().max(2_048).optional(),
  })
  .strict();

const legacyProviderSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    providers: z.partialRecord(providerIdSchema, modelSettingSchema),
  })
  .strict();

const storedProviderSettingsSchema = z
  .object({
    schemaVersion: z.literal(2),
    providers: z.partialRecord(providerIdSchema, providerSettingSchema),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [providerId, setting] of Object.entries(value.providers)) {
      if (providerId !== 'custom' && setting?.baseUrl !== undefined) {
        context.addIssue({
          code: 'custom',
          message: '只有 custom Provider 可配置 baseUrl',
          path: ['providers', providerId, 'baseUrl'],
        });
      }
    }
  });

type StoredProviderSettings =
  z.infer<typeof legacyProviderSettingsSchema> | z.infer<typeof storedProviderSettingsSchema>;

export type ProviderSetting = z.infer<typeof providerSettingSchema>;
export interface ProviderSettings {
  schemaVersion: 2;
  providers: Record<ProviderId, ProviderSetting>;
}

export interface ProviderSettingsArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function validateProviderSetting(
  providerId: ProviderId,
  setting: ProviderSetting,
): ProviderSetting {
  const validated = providerSettingSchema.parse(setting);
  if (providerId !== 'custom' && validated.baseUrl !== undefined) {
    throw new Error('只有 custom Provider 可配置 baseUrl');
  }
  if (providerId === 'custom' && validated.baseUrl) {
    return { ...validated, baseUrl: normalizeCustomProviderUrl(validated.baseUrl).baseUrl };
  }
  return validated;
}

export function defaultProviderSettings(): ProviderSettings {
  return {
    schemaVersion: 2,
    providers: Object.fromEntries(
      PROVIDER_CATALOG.map((entry) => [
        entry.id,
        {
          textModel: entry.defaultTextModel,
          ...(entry.defaultVisionModel === undefined
            ? {}
            : { visionModel: entry.defaultVisionModel }),
        },
      ]),
    ) as Record<ProviderId, ProviderSetting>,
  };
}

function mergeWithDefaultProviderSettings(stored: StoredProviderSettings): ProviderSettings {
  const defaults = defaultProviderSettings();
  return {
    schemaVersion: 2,
    providers: Object.fromEntries(
      PROVIDER_CATALOG.map((entry) => {
        const candidate = stored.providers[entry.id];
        return [
          entry.id,
          candidate ? validateProviderSetting(entry.id, candidate) : defaults.providers[entry.id],
        ];
      }),
    ) as Record<ProviderId, ProviderSetting>,
  };
}

export class ProviderSettingsJsonError extends Error {
  readonly code = 'PROVIDER_SETTINGS_JSON_INVALID';

  constructor() {
    super('Provider 配置 JSON 无效；只允许模型名称和 custom 的非秘密 HTTPS URL。');
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
  const parsed = z
    .union([legacyProviderSettingsSchema, storedProviderSettingsSchema])
    .safeParse(decoded);
  if (!parsed.success) {
    throw new ProviderSettingsJsonError();
  }
  try {
    return mergeWithDefaultProviderSettings(parsed.data);
  } catch {
    throw new ProviderSettingsJsonError();
  }
}

export function serializeProviderSettingsJson(settings: ProviderSettings): string {
  try {
    const providers = Object.fromEntries(
      PROVIDER_CATALOG.map((entry) => {
        const setting = validateProviderSetting(entry.id, settings.providers[entry.id]);
        const serialized: ProviderSetting = {
          textModel: setting.textModel,
          ...(setting.visionModel === undefined ? {} : { visionModel: setting.visionModel }),
          ...(entry.id === 'custom' && setting.baseUrl ? { baseUrl: setting.baseUrl } : {}),
        };
        return [entry.id, serialized];
      }),
    );
    return JSON.stringify({ schemaVersion: 2, providers }, null, 2);
  } catch {
    throw new ProviderSettingsJsonError();
  }
}

export function createProviderSettingsStore(area: ProviderSettingsArea) {
  return {
    async read(): Promise<ProviderSettings> {
      const result = await area.get(STORAGE_KEY);
      const parsed = z
        .union([legacyProviderSettingsSchema, storedProviderSettingsSchema])
        .safeParse(result[STORAGE_KEY]);
      if (!parsed.success) {
        return defaultProviderSettings();
      }
      try {
        return mergeWithDefaultProviderSettings(parsed.data);
      } catch {
        return defaultProviderSettings();
      }
    },
    async writeProvider(providerId: ProviderId, setting: ProviderSetting): Promise<void> {
      const current = await this.read();
      const validated = validateProviderSetting(providerId, setting);
      await area.set({
        [STORAGE_KEY]: {
          schemaVersion: 2,
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
