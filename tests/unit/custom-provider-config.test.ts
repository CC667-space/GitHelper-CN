import { describe, expect, it } from 'vitest';

import {
  CustomProviderUrlError,
  normalizeCustomProviderUrl,
} from '../../src/lib/custom-provider-config';

describe('custom Provider URL', () => {
  it('接受公网 HTTPS Base URL 或完整 Chat Completions URL并推导固定端点', () => {
    expect(normalizeCustomProviderUrl('https://api.example.com/v1/')).toEqual({
      baseUrl: 'https://api.example.com/v1',
      apiHost: 'https://api.example.com',
      chatEndpoint: 'https://api.example.com/v1/chat/completions',
      modelsEndpoint: 'https://api.example.com/v1/models',
      permissionOrigin: 'https://api.example.com/*',
    });
    expect(
      normalizeCustomProviderUrl('https://gateway.example.cn/openai/v1/chat/completions'),
    ).toMatchObject({
      baseUrl: 'https://gateway.example.cn/openai/v1',
      chatEndpoint: 'https://gateway.example.cn/openai/v1/chat/completions',
      modelsEndpoint: 'https://gateway.example.cn/openai/v1/models',
    });
    expect(normalizeCustomProviderUrl('https://8.8.8.8/v1').apiHost).toBe('https://8.8.8.8');
    expect(normalizeCustomProviderUrl('https://api.example.com').chatEndpoint).toBe(
      'https://api.example.com/chat/completions',
    );
  });

  it.each([
    'http://api.example.com/v1',
    'https://user:secret@api.example.com/v1',
    'https://api.example.com:8443/v1',
    'https://api.example.com/v1?token=secret',
    'https://api.example.com/v1#fragment',
    'https://localhost/v1',
    'https://localhost./v1',
    'https://service.local/v1',
    'https://10.0.0.1/v1',
    'https://127.0.0.1/v1',
    'https://169.254.169.254/v1',
    'https://192.168.1.2/v1',
    'https://198.51.100.5/v1',
    'https://203.0.113.5/v1',
    'https://[::1]/v1',
  ])('拒绝非公网或可携带秘密的 URL：%s', (value) => {
    expect(() => normalizeCustomProviderUrl(value)).toThrow(CustomProviderUrlError);
  });
});
