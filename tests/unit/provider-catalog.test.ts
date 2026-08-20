import { describe, expect, it } from 'vitest';

import { PROVIDER_CATALOG, providerCatalogEntry } from '../../src/lib/provider-catalog';

describe('Provider catalog', () => {
  it('把八家常用服务作为同一组内置 Provider 暴露给调用方', () => {
    expect(PROVIDER_CATALOG.map((provider) => provider.id)).toEqual([
      'deepseek',
      'uuapi',
      'openrouter',
      'openai',
      'anthropic',
      'gemini',
      'qwen',
      'siliconflow',
    ]);

    expect(providerCatalogEntry('openai')).toMatchObject({
      label: 'OpenAI',
      settingsLabel: 'ChatGPT（OpenAI API）',
      apiHost: 'https://api.openai.com',
      apiPath: '/v1/chat/completions',
      hostPermission: 'optional',
      defaultTextModel: 'gpt-5-mini',
      defaultVisionModel: 'gpt-5-mini',
      intermediary: false,
      modelSuggestions: {
        text: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'],
        vision: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'],
      },
    });

    expect(providerCatalogEntry('anthropic')).toMatchObject({
      settingsLabel: 'Claude（Anthropic API）',
      apiHost: 'https://api.anthropic.com',
      apiPath: '/v1/chat/completions',
      modelSuggestions: {
        text: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
        vision: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
      },
      hostPermission: 'optional',
    });
    expect(providerCatalogEntry('gemini')).toMatchObject({
      apiHost: 'https://generativelanguage.googleapis.com',
      apiPath: '/v1beta/openai/chat/completions',
      defaultTextModel: 'gemini-3.6-flash',
      defaultVisionModel: 'gemini-3.6-flash',
      modelSuggestions: {
        text: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
        vision: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
      },
    });
    expect(providerCatalogEntry('qwen')).toMatchObject({
      apiHost: 'https://dashscope.aliyuncs.com',
      apiPath: '/compatible-mode/v1/chat/completions',
      defaultTextModel: 'qwen-plus',
      defaultVisionModel: 'qwen-vl-plus',
      modelSuggestions: {
        text: ['qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash'],
        vision: ['qwen3.7-plus', 'qwen3.6-flash', 'qwen3-vl-plus'],
      },
    });
    expect(providerCatalogEntry('siliconflow')).toMatchObject({
      apiHost: 'https://api.siliconflow.cn',
      apiPath: '/v1/chat/completions',
      defaultTextModel: 'Pro/zai-org/GLM-5.1',
      modelSuggestions: {
        text: ['zai-org/GLM-5.2', 'Pro/zai-org/GLM-5.1', 'moonshotai/Kimi-K2.7-Code'],
        vision: ['Qwen/Qwen3.6-35B-A3B', 'Qwen/Qwen3.6-27B', 'Qwen/Qwen3.5-397B-A17B'],
      },
    });

    expect(providerCatalogEntry('deepseek').modelSuggestions.vision).toEqual([]);
  });
});
