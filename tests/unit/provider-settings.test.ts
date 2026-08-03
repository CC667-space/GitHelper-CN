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
  it('读取旧三家配置时保留用户模型并为 OpenAI 补齐默认值', async () => {
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

  it('导出的 JSON 只包含 Provider 模型绑定，不包含凭据或端点', () => {
    const settings = parseProviderSettingsJson(`{
      "schemaVersion": 1,
      "providers": {
        "openai": { "textModel": "gpt-5-mini", "visionModel": "gpt-5-mini" }
      }
    }`);
    const exported = serializeProviderSettingsJson(settings);

    expect(exported).not.toMatch(/apiKey|authorization|token|baseUrl|apiHost|endpoint/i);
    expect(JSON.parse(exported)).toEqual(settings);
  });

  it('拒绝包含 Key 或自定义端点的 JSON，错误信息不回显敏感值', () => {
    const secret = 'sk-never-echo-this-value';
    const inputs = [
      `{"schemaVersion":1,"providers":{},"apiKey":"${secret}"}`,
      '{"schemaVersion":1,"providers":{},"baseUrl":"https://example.com/v1"}',
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
      '{"schemaVersion":1,"providers":{"openai":{"textModel":"gpt-4.1-mini"}}}',
    );
    const exported = await store.exportJson();

    expect(JSON.parse(exported).providers.openai.textModel).toBe('gpt-4.1-mini');
    expect(exported).not.toMatch(/apiKey|authorization|token|baseUrl|endpoint/i);
  });
});
