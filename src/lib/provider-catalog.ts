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
  settingsLabel?: string;
  apiHost: string;
  apiPath: string;
  hostPermission: 'required' | 'optional';
  intermediary: boolean;
  defaultTextModel: string;
  defaultVisionModel?: string;
  modelSuggestions: {
    text: readonly string[];
    vision: readonly string[];
  };
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
    modelSuggestions: {
      text: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      vision: [],
    },
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
    modelSuggestions: { text: [], vision: [] },
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
    modelSuggestions: {
      text: ['openrouter/auto', 'openrouter/free', '~openai/gpt-latest'],
      vision: ['openrouter/free', '~openai/gpt-latest', '~google/gemini-flash-latest'],
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    settingsLabel: 'ChatGPT（OpenAI API）',
    apiHost: 'https://api.openai.com',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: false,
    defaultTextModel: 'gpt-5-mini',
    defaultVisionModel: 'gpt-5-mini',
    modelSuggestions: {
      text: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'],
      vision: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'],
    },
    connectionNote: '需要 OpenAI API Key；ChatGPT 登录或订阅不能代替 API Key。',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    settingsLabel: 'Claude（Anthropic API）',
    apiHost: 'https://api.anthropic.com',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: false,
    defaultTextModel: 'claude-sonnet-4-6',
    defaultVisionModel: 'claude-sonnet-4-6',
    modelSuggestions: {
      text: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
      vision: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
    },
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
    modelSuggestions: {
      text: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
      vision: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    },
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
    modelSuggestions: {
      text: ['qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash'],
      vision: ['qwen3.7-plus', 'qwen3.6-flash', 'qwen3-vl-plus'],
    },
    connectionNote: '使用只需 API Key 的百炼共享端点；模型 ID 可按账号可用范围修改。',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    apiHost: 'https://api.siliconflow.cn',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    intermediary: true,
    defaultTextModel: 'Pro/zai-org/GLM-5.1',
    modelSuggestions: {
      text: ['zai-org/GLM-5.2', 'Pro/zai-org/GLM-5.1', 'moonshotai/Kimi-K2.7-Code'],
      vision: ['Qwen/Qwen3.6-35B-A3B', 'Qwen/Qwen3.6-27B', 'Qwen/Qwen3.5-397B-A17B'],
    },
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
