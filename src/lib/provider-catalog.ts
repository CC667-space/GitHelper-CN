import type { ProviderId } from './types';

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  apiHost: string;
  apiPath: string;
  intermediary: boolean;
  defaultTextModel: string;
  defaultVisionModel?: string;
  modelSuggestions: string[];
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiHost: 'https://api.deepseek.com',
    apiPath: '/chat/completions',
    intermediary: false,
    defaultTextModel: 'deepseek-v4-flash',
    modelSuggestions: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  {
    id: 'uuapi',
    label: 'UUAPI',
    apiHost: 'https://uuapi.net',
    apiPath: '/v1/chat/completions',
    intermediary: true,
    defaultTextModel: '',
    defaultVisionModel: '',
    modelSuggestions: [],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiHost: 'https://openrouter.ai',
    apiPath: '/api/v1/chat/completions',
    intermediary: true,
    defaultTextModel: '~openai/gpt-latest',
    defaultVisionModel: 'openrouter/free',
    modelSuggestions: ['~openai/gpt-latest', 'openrouter/free'],
  },
] as const;

export function providerCatalogEntry(providerId: ProviderId): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
  if (!entry) {
    throw new Error(`未知 Provider：${providerId}`);
  }
  return entry;
}
