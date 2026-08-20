import { describe, expect, it, vi } from 'vitest';

import {
  ProviderManager,
  type CapabilityProbeSummary,
} from '../../src/background/provider-manager';
import type { Provider, ProviderStreamChunk } from '../../src/background/providers/base';
import type { ProviderCapabilities, ProviderId } from '../../src/lib/types';

function fakeProvider(id: ProviderId): Provider {
  const capabilities: ProviderCapabilities = {
    supportsStreaming: false,
    supportsVision: false,
    supportsToolCalls: false,
    supportsStructuredOutput: false,
    supportsUsage: false,
    supportsAbort: false,
    imageInputFormat: id === 'deepseek' ? 'none' : 'openai_image_url',
    toolCallStreamingFormat: 'none',
    errorResponseFormat: 'custom',
  };
  return {
    id,
    label: id,
    apiHost: `https://${id}.example`,
    capabilities,
    chat: vi.fn(),
    chatStream: vi.fn(async function* (): AsyncIterable<ProviderStreamChunk> {
      yield { delta: id };
      yield { done: true };
    }),
    abort: vi.fn(() => false),
    listModels: vi.fn(async () => []),
  };
}

function probe(
  providerId: ProviderId,
  options: Partial<CapabilityProbeSummary> = {},
): CapabilityProbeSummary {
  return {
    providerId,
    text: true,
    streaming: true,
    abort: true,
    vision: providerId !== 'deepseek',
    toolCalls: true,
    structuredOutput: true,
    usage: true,
    errorFormat: true,
    rateLimitFormat: true,
    probedAt: '2026-07-24T00:00:00.000Z',
    ...options,
  };
}

describe('ProviderManager', () => {
  it('默认路由文本/视觉，手动覆盖优先', () => {
    const providers = new Map<ProviderId, Provider>([
      ['deepseek', fakeProvider('deepseek')],
      ['uuapi', fakeProvider('uuapi')],
      ['openrouter', fakeProvider('openrouter')],
    ]);
    const manager = new ProviderManager(providers);
    for (const providerId of providers.keys()) {
      manager.setProbeResult(probe(providerId));
    }
    expect(manager.resolve({ needsVision: false }).id).toBe('deepseek');
    expect(manager.resolve({ needsVision: true }).id).toBe('openrouter');
    manager.setManualOverride('openrouter');
    expect(manager.resolve({ needsVision: false }).id).toBe('openrouter');
    expect(manager.resolve({ needsVision: false, manualOverrideId: 'uuapi' }).id).toBe('uuapi');
  });

  it('未探针能力、视觉不支持与失败禁用均硬阻断', () => {
    const providers = new Map<ProviderId, Provider>([
      ['deepseek', fakeProvider('deepseek')],
      ['uuapi', fakeProvider('uuapi')],
    ]);
    const manager = new ProviderManager(providers);
    expect(() => manager.resolve({ needsVision: false })).toThrow(/尚未完成真实文本能力探针/);
    manager.setProbeResult(probe('deepseek'));
    expect(() => manager.resolve({ needsVision: true, manualOverrideId: 'deepseek' })).toThrow(
      /图像输入探针/,
    );
    manager.setProbeResult(probe('uuapi', { text: false, failureReason: '401' }));
    expect(() => manager.resolve({ needsVision: false, manualOverrideId: 'uuapi' })).toThrow(
      /当前不可用/,
    );
  });

  it('清除全部本地数据后丢弃内存中的探针与手动路由状态', () => {
    const providers = new Map<ProviderId, Provider>([
      ['deepseek', fakeProvider('deepseek')],
      ['openrouter', fakeProvider('openrouter')],
    ]);
    const manager = new ProviderManager(providers);
    manager.setProbeResult(probe('deepseek'));
    manager.setProbeResult(probe('openrouter'));
    manager.setManualOverride('openrouter');

    manager.reset();

    expect(manager.state('deepseek').probe).toBeUndefined();
    expect(manager.state('openrouter').probe).toBeUndefined();
    expect(() => manager.resolve({ needsVision: false })).toThrow(/尚未完成真实文本能力探针/);
  });
});
