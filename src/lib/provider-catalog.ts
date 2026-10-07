import { z } from 'zod';

export const PROVIDER_IDS = [
  'deepseek',
  'openrouter',
  'openai',
  'anthropic',
  'gemini',
  'qwen',
  'siliconflow',
  'glm',
  'kimi',
  'grok',
  'custom',
  'uuapi',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export const providerIdSchema = z.enum(PROVIDER_IDS);
export const PROVIDER_CATALOG_VERIFIED_AT = '2026-10-07';

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  settingsLabel?: string;
  apiHost: string;
  apiPath: string;
  hostPermission: 'required' | 'optional' | 'dynamic';
  visibility: 'common' | 'legacy';
  supportsVisionSelection: boolean;
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
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'deepseek-flash',
    defaultVisionModel: 'deepseek-flash',
    modelSuggestions: {
      text: ['deepseek-flash', 'deepseek-v4-pro'],
      vision: ['deepseek-flash'],
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiHost: 'https://openrouter.ai',
    apiPath: '/api/v1/chat/completions',
    hostPermission: 'required',
    visibility: 'common',
    supportsVisionSelection: true,
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
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'gpt-6.1-sol',
    defaultVisionModel: 'gpt-6.1-sol',
    modelSuggestions: {
      text: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
      vision: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
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
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'claude-sonnet-5-5',
    defaultVisionModel: 'claude-sonnet-5-5',
    modelSuggestions: {
      text: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5'],
      vision: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5'],
    },
    connectionNote: '当前使用 Anthropic 官方 OpenAI 兼容层；高级原生能力不在本版本范围内。',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    apiHost: 'https://generativelanguage.googleapis.com',
    apiPath: '/v1beta/openai/chat/completions',
    hostPermission: 'optional',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'gemini-3.8-flash',
    defaultVisionModel: 'gemini-3.8-flash',
    modelSuggestions: {
      text: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
      vision: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    },
    connectionNote: '当前使用 Google 官方 OpenAI 兼容接口。',
  },
  {
    id: 'qwen',
    label: '阿里云百炼 / Qwen',
    apiHost: 'https://dashscope.aliyuncs.com',
    apiPath: '/compatible-mode/v1/chat/completions',
    hostPermission: 'optional',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'qwen3.8-flash',
    defaultVisionModel: 'qwen3.8-flash',
    modelSuggestions: {
      text: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'],
      vision: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-omni-flash'],
    },
    connectionNote: '使用只需 API Key 的百炼共享端点；模型 ID 可按账号可用范围修改。',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    apiHost: 'https://api.siliconflow.cn',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: true,
    defaultTextModel: 'zai-org/GLM-5.2',
    defaultVisionModel: 'Qwen/Qwen3.8-27B',
    modelSuggestions: {
      text: ['zai-org/GLM-5.2', 'Pro/zai-org/GLM-5.1', 'moonshotai/Kimi-K2.7-Code'],
      vision: ['Qwen/Qwen3.8-27B', 'Qwen/Qwen3.6-35B-A3B', 'Qwen/Qwen3.6-27B'],
    },
    connectionNote: '模型上下线与能力可能变化；可在模型框中填写账号当前可用的模型 ID。',
  },
  {
    id: 'glm',
    label: 'GLM（智谱 API）',
    apiHost: 'https://open.bigmodel.cn',
    apiPath: '/api/paas/v4/chat/completions',
    hostPermission: 'optional',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'glm-5.2',
    defaultVisionModel: 'glm-5v-turbo',
    modelSuggestions: {
      text: ['glm-5.2', 'glm-4.7', 'glm-4.7-flash'],
      vision: ['glm-5v-turbo', 'glm-4.6v', 'glm-4.6v-flash'],
    },
  },
  {
    id: 'kimi',
    label: 'Kimi（月之暗面 API）',
    apiHost: 'https://api.moonshot.cn',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'kimi-k3',
    defaultVisionModel: 'kimi-k3',
    modelSuggestions: {
      text: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
      vision: ['kimi-k3', 'kimi-k2.6'],
    },
  },
  {
    id: 'grok',
    label: 'Grok（xAI API）',
    apiHost: 'https://api.x.ai',
    apiPath: '/v1/chat/completions',
    hostPermission: 'optional',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: false,
    defaultTextModel: 'grok-4.6',
    defaultVisionModel: 'grok-4.6',
    modelSuggestions: {
      text: ['grok-4.6', 'grok-4.5', 'grok-4.3'],
      vision: ['grok-4.6', 'grok-4.5', 'grok-4.3'],
    },
  },
  {
    id: 'custom',
    label: '自定 Provider（OpenAI-compatible）',
    apiHost: '',
    apiPath: '',
    hostPermission: 'dynamic',
    visibility: 'common',
    supportsVisionSelection: true,
    intermediary: true,
    defaultTextModel: '',
    defaultVisionModel: '',
    modelSuggestions: { text: [], vision: [] },
    connectionNote: '先保存公网 HTTPS URL 与 Model ID，再保存 Key；兼容性以真实探针为准。',
  },
  {
    id: 'uuapi',
    label: 'UUAPI',
    apiHost: 'https://uuapi.net',
    apiPath: '/v1/chat/completions',
    hostPermission: 'required',
    visibility: 'legacy',
    supportsVisionSelection: true,
    intermediary: true,
    defaultTextModel: '',
    defaultVisionModel: '',
    modelSuggestions: { text: [], vision: [] },
    connectionNote: '仅保留旧配置兼容，不再作为常用 Provider 候选。',
  },
] as const;

export function providerCatalogEntry(providerId: ProviderId): ProviderCatalogEntry {
  const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
  if (!entry) {
    throw new Error(`未知 Provider：${providerId}`);
  }
  return entry;
}
