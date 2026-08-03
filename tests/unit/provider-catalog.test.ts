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
      apiHost: 'https://api.openai.com',
      apiPath: '/v1/chat/completions',
      hostPermission: 'optional',
      defaultTextModel: 'gpt-5-mini',
      defaultVisionModel: 'gpt-5-mini',
      intermediary: false,
    });

    expect(providerCatalogEntry('anthropic')).toMatchObject({
      apiHost: 'https://api.anthropic.com',
      apiPath: '/v1/chat/completions',
      defaultTextModel: 'claude-sonnet-4-6',
      hostPermission: 'optional',
    });
    expect(providerCatalogEntry('gemini')).toMatchObject({
      apiHost: 'https://generativelanguage.googleapis.com',
      apiPath: '/v1beta/openai/chat/completions',
      defaultTextModel: 'gemini-3.6-flash',
      defaultVisionModel: 'gemini-3.6-flash',
    });
    expect(providerCatalogEntry('qwen')).toMatchObject({
      apiHost: 'https://dashscope.aliyuncs.com',
      apiPath: '/compatible-mode/v1/chat/completions',
      defaultTextModel: 'qwen-plus',
      defaultVisionModel: 'qwen-vl-plus',
    });
    expect(providerCatalogEntry('siliconflow')).toMatchObject({
      apiHost: 'https://api.siliconflow.cn',
      apiPath: '/v1/chat/completions',
      defaultTextModel: 'Pro/zai-org/GLM-4.7',
    });
  });
});
