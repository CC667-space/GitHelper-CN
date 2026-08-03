import { z } from 'zod';

export const PROVIDER_IDS = [
  'deepseek',
  'uuapi',
  'openrouter',
  'openai',
  'anthropic',
  'gemini',
  'qwen',
  'siliconflow',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const providerIdSchema = z.enum(PROVIDER_IDS);

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  apiHost: string;
  apiPath: string;
  hostPermission: 'required' | 'optional';
  intermediary: boolean;
  defaultTextModel: string;
  defaultVisionModel?: string;
  modelSuggestions: string[];
  connectionNote?: string;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiHost: 'https://api.deepseek.com',
    apiPath: '/chat/completions',
    hostPermission: 'required',
    intermediary: false,
    defaultTextModel: 'deepseek-v4-flash',
    modelSuggestions: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  {
    id: 'uuapi',
    label: 'UUAPI',
    apiHost: 'https://uuapi.net',
    apiPath: '/v1/chat/completions',
    hostPermission: 'required',
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
    hostPermission: 'required',
    intermediary: true,
    defaultTextModel: '~openai/gpt-latest',
    defaultVisionModel: 'openrouter/free',
    modelSuggestions: ['~openai/gpt-latest', 'openrouter/free'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiHost: 'https://api.openai.com',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: false,
    defaultTextModel: 'gpt-5-mini',
    defaultVisionModel: 'gpt-5-mini',
    modelSuggestions: ['gpt-5-mini', 'gpt-4.1-mini'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiHost: 'https://api.anthropic.com',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: false,
    defaultTextModel: 'claude-sonnet-4-6',
    defaultVisionModel: 'claude-sonnet-4-6',
    modelSuggestions: ['claude-sonnet-4-6', 'claude-opus-5'],
    connectionNote: '当前使用 Anthropic 官方 OpenAI 兼容层；高级原生能力不在本版本范围内。',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    apiHost: 'https://generativelanguage.googleapis.com',
    apiPath: '/v1beta/openai/chat/completions',
    hostPermission: 'optional',
    intermediary: false,
    defaultTextModel: 'gemini-3.6-flash',
    defaultVisionModel: 'gemini-3.6-flash',
    modelSuggestions: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
    connectionNote: '当前使用 Google 官方 OpenAI 兼容接口。',
  },
  {
    id: 'qwen',
    label: '阿里云百炼 / Qwen',
    apiHost: 'https://dashscope.aliyuncs.com',
    apiPath: '/compatible-mode/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: false,
    defaultTextModel: 'qwen-plus',
    defaultVisionModel: 'qwen-vl-plus',
    modelSuggestions: ['qwen-plus', 'qwen3.8-max', 'qwen-vl-plus', 'qwen-vl-max'],
    connectionNote: '使用只需 API Key 的百炼共享端点；模型 ID 可按账号可用范围修改。',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    apiHost: 'https://api.siliconflow.cn',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: true,
    defaultTextModel: 'Pro/zai-org/GLM-4.7',
    modelSuggestions: ['Pro/zai-org/GLM-4.7', 'Qwen/Qwen3.5-9B'],
    connectionNote: '模型上下线与能力可能变化；可在模型框中填写账号当前可用的模型 ID。',
  },
] as const;

export function providerCatalogEntry(providerId: ProviderId): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
  if (!entry) {
    throw new Error(`未知 Provider：${providerId}`);
  }
  return entry;
}
