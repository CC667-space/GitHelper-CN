import { describe, expect, it } from 'vitest';

import {
  PROVIDER_CATALOG,
  PROVIDER_CATALOG_VERIFIED_AT,
  providerCatalogEntry,
} from '../../src/lib/provider-catalog';

describe('Provider catalog', () => {
  it('暴露十家常用内置服务、一个受限 custom，并把 UUAPI 标记为 legacy', () => {
    expect(PROVIDER_CATALOG_VERIFIED_AT).toBe('2026-10-07');
    expect(PROVIDER_CATALOG.map((provider) => provider.id)).toEqual([
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
    ]);

    expect(providerCatalogEntry('openai')).toMatchObject({
      label: 'OpenAI',
      settingsLabel: 'ChatGPT（OpenAI API）',
      apiHost: 'https://api.openai.com',
      apiPath: '/v1/chat/completions',
      hostPermission: 'optional',
      defaultTextModel: 'gpt-6.1-sol',
      defaultVisionModel: 'gpt-6.1-sol',
      intermediary: false,
      modelSuggestions: {
        text: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
        vision: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
      },
    });

    expect(providerCatalogEntry('anthropic')).toMatchObject({
      settingsLabel: 'Claude（Anthropic API）',
      apiHost: 'https://api.anthropic.com',
      apiPath: '/v1/chat/completions',
      defaultTextModel: 'claude-sonnet-5-5',
      defaultVisionModel: 'claude-sonnet-5-5',
      modelSuggestions: {
        text: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5'],
        vision: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5'],
      },
      hostPermission: 'optional',
    });
    expect(providerCatalogEntry('gemini')).toMatchObject({
      apiHost: 'https://generativelanguage.googleapis.com',
      apiPath: '/v1beta/openai/chat/completions',
      defaultTextModel: 'gemini-3.8-flash',
      defaultVisionModel: 'gemini-3.8-flash',
      modelSuggestions: {
        text: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
        vision: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
      },
    });
    expect(providerCatalogEntry('qwen')).toMatchObject({
      apiHost: 'https://dashscope.aliyuncs.com',
      apiPath: '/compatible-mode/v1/chat/completions',
      defaultTextModel: 'qwen3.8-flash',
      defaultVisionModel: 'qwen3.8-flash',
      modelSuggestions: {
        text: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'],
        vision: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-omni-flash'],
      },
    });
    expect(providerCatalogEntry('siliconflow')).toMatchObject({
      apiHost: 'https://api.siliconflow.cn',
      apiPath: '/v1/chat/completions',
      defaultTextModel: 'zai-org/GLM-5.2',
      defaultVisionModel: 'Qwen/Qwen3.8-27B',
      modelSuggestions: {
        text: ['zai-org/GLM-5.2', 'Pro/zai-org/GLM-5.1', 'moonshotai/Kimi-K2.7-Code'],
        vision: ['Qwen/Qwen3.8-27B', 'Qwen/Qwen3.6-35B-A3B', 'Qwen/Qwen3.6-27B'],
      },
    });

    expect(providerCatalogEntry('deepseek')).toMatchObject({
      supportsVisionSelection: true,
      defaultTextModel: 'deepseek-flash',
      defaultVisionModel: 'deepseek-flash',
      modelSuggestions: {
        text: ['deepseek-flash', 'deepseek-v4-pro'],
        vision: ['deepseek-flash'],
      },
    });
    expect(providerCatalogEntry('glm')).toMatchObject({
      apiHost: 'https://open.bigmodel.cn',
      apiPath: '/api/paas/v4/chat/completions',
      hostPermission: 'optional',
      visibility: 'common',
    });
    expect(providerCatalogEntry('kimi').apiHost).toBe('https://api.moonshot.cn');
    expect(providerCatalogEntry('grok').apiHost).toBe('https://api.x.ai');
    expect(providerCatalogEntry('grok')).toMatchObject({
      defaultTextModel: 'grok-4.6',
      defaultVisionModel: 'grok-4.6',
    });
    expect(providerCatalogEntry('grok').modelSuggestions).toEqual({
      text: ['grok-4.6', 'grok-4.5', 'grok-4.3'],
      vision: ['grok-4.6', 'grok-4.5', 'grok-4.3'],
    });
    expect(providerCatalogEntry('custom')).toMatchObject({
      apiHost: '',
      apiPath: '',
      hostPermission: 'dynamic',
      visibility: 'common',
    });
    expect(providerCatalogEntry('uuapi').visibility).toBe('legacy');
  });
});
