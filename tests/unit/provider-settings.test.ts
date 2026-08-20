import { describe, expect, it } from 'vitest';

import {
  createProviderSettingsStore,
  parseProviderSettingsJson,
  ProviderSettingsJsonError,
  serializeProviderSettingsJson,
  type ProviderSettingsArea,
} from '../../src/lib/provider-settings';

class MemorySettingsArea implements ProviderSettingsArea {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return key in this.values ? { [key]: this.values[key] } : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }
}

describe('Provider settings', () => {
  it('读取 v1 旧配置时保留用户模型并补齐 Phase 12 Provider 默认值', async () => {
    const area = new MemorySettingsArea();
    area.values['provider:settings:v1'] = {
      schemaVersion: 1,
      providers: {
        deepseek: { textModel: 'my-deepseek-model' },
        uuapi: { textModel: 'my-uuapi-model' },
        openrouter: { textModel: 'my-openrouter-model', visionModel: 'my-vision-model' },
      },
    };

    const settings = await createProviderSettingsStore(area).read();

    expect(settings.providers.deepseek.textModel).toBe('my-deepseek-model');
    expect(settings.providers.openai).toEqual({
      textModel: 'gpt-5-mini',
      visionModel: 'gpt-5-mini',
    });
    expect(settings.schemaVersion).toBe(2);
    expect(settings.providers.glm.textModel).toBe('glm-5.2');
    expect(settings.providers.custom.textModel).toBe('');
  });

  it('导入仅含部分 Provider 的 JSON 时保留指定模型并补齐其他默认值', () => {
    const settings = parseProviderSettingsJson(`{
      "schemaVersion": 1,
      "providers": {
        "openai": {
          "textModel": "gpt-4.1-mini",
          "visionModel": "gpt-4.1-mini"
        }
      }
    }`);

    expect(settings.providers.openai.textModel).toBe('gpt-4.1-mini');
    expect(settings.providers.deepseek.textModel).toBe('deepseek-v4-flash');
  });

  it('导出的 JSON 只包含模型和 custom 非秘密 URL，不包含凭据', () => {
    const settings = parseProviderSettingsJson(`{
      "schemaVersion": 2,
      "providers": {
        "openai": { "textModel": "gpt-5-mini", "visionModel": "gpt-5-mini" },
        "custom": {
          "baseUrl": "https://api.example.com/v1/chat/completions",
          "textModel": "account-model"
        }
      }
    }`);
    const exported = serializeProviderSettingsJson(settings);

    expect(exported).not.toMatch(/apiKey|authorization|token|apiHost|endpoint/i);
    expect(JSON.parse(exported).providers.custom).toEqual({
      baseUrl: 'https://api.example.com/v1',
      textModel: 'account-model',
    });
    expect(JSON.parse(exported).providers.openai).not.toHaveProperty('baseUrl');
  });

  it('拒绝 Key、未知字段或覆盖内置 endpoint，错误信息不回显输入', () => {
    const secret = 'sk-never-echo-this-value';
    const inputs = [
      `{"schemaVersion":1,"providers":{},"apiKey":"${secret}"}`,
      '{"schemaVersion":2,"providers":{"openai":{"textModel":"x","baseUrl":"https://example.com/v1"}}}',
      '{"schemaVersion":2,"providers":{"custom":{"textModel":"x","baseUrl":"http://example.com/v1"}}}',
    ];

    for (const input of inputs) {
      try {
        parseProviderSettingsJson(input);
        throw new Error('测试输入未被拒绝');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderSettingsJsonError);
        expect(String(error)).not.toContain(secret);
        expect(String(error)).not.toContain('example.com');
      }
    }
  });

  it('设置存储可导入并导出无密钥 JSON', async () => {
    const area = new MemorySettingsArea();
    const store = createProviderSettingsStore(area);

    await store.importJson(
      '{"schemaVersion":2,"providers":{"openai":{"textModel":"gpt-4.1-mini"}}}',
    );
    const exported = await store.exportJson();

    expect(JSON.parse(exported).providers.openai.textModel).toBe('gpt-4.1-mini');
    expect(exported).not.toMatch(/apiKey|authorization|token|baseUrl|endpoint/i);
  });
});
