import { describe, expect, it, vi } from 'vitest';

import { buildMinimalContext } from '../../src/background/context-builder';
import { type ProviderTransport } from '../../src/background/providers/base';
import { DeepSeekProvider } from '../../src/background/providers/deepseek';
import { createLogger } from '../../src/lib/logger';
import type { PageContext } from '../../src/lib/types';

const SECRETS = {
  apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
  githubToken: 'github_pat_abcdefghijklmnopqrstuvwxyz123456',
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
  bearer: 'bearer-secret-value-123',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456',
  urlPassword: 'url-password-value',
  namedSecret: 'structured-secret-value',
  email: 'private.person@example.com',
  phone: '13800138000',
} as const;

function sensitivePage(): PageContext {
  return {
    url: 'https://github.com/octocat/security-fixture',
    pageType: 'repo',
    repository: 'octocat/security-fixture',
    isPrivate: false,
    extracted: {
      readme: [
        SECRETS.apiKey,
        SECRETS.githubToken,
        SECRETS.awsKey,
        `Authorization: Bearer ${SECRETS.bearer}`,
        SECRETS.jwt,
        `https://alice:${SECRETS.urlPassword}@example.com/private`,
        SECRETS.email,
        SECRETS.phone,
      ].join('\n'),
      apiKey: SECRETS.namedSecret,
    },
    capturedAt: '2026-07-24T00:00:00.000Z',
  };
}

describe('敏感信息无明文泄漏', () => {
  it('Provider 上下文只保留遮蔽值并报告发现类型', () => {
    const built = buildMinimalContext(`请解释，但不要发送 ${SECRETS.apiKey}`, sensitivePage());
    const serialized = JSON.stringify(built);

    for (const secret of Object.values(SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
    expect(built.messages[1]?.content).toContain('‹REDACTED:');
    expect(built.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        'API_KEY',
        'GITHUB_TOKEN',
        'CLOUD_KEY',
        'AUTH_HEADER',
        'JWT',
        'URL_CREDENTIAL',
        'NAMED_SECRET',
        'EMAIL',
        'PHONE',
      ]),
    );
  });

  it('日志在字符串、Error、对象与嵌套数组中均不输出敏感明文', () => {
    const sink = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = createLogger(sink, 'debug');

    logger.info(
      `Authorization: Bearer ${SECRETS.bearer}`,
      new Error(`请求失败 ${SECRETS.githubToken}`),
      {
        apiKey: SECRETS.namedSecret,
        nested: [SECRETS.jwt, `https://alice:${SECRETS.urlPassword}@example.com/path`],
      },
    );

    const output = JSON.stringify(sink.info.mock.calls);
    for (const secret of [
      SECRETS.bearer,
      SECRETS.githubToken,
      SECRETS.namedSecret,
      SECRETS.jwt,
      SECRETS.urlPassword,
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('REDACTED');
  });

  it('实际 Provider 请求体不含 sanitizer 已发现的明文', async () => {
    const transport: ProviderTransport = {
      request: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'deepseek-v4-flash',
              choices: [{ message: { content: '已处理' }, finish_reason: 'stop' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    };
    const built = buildMinimalContext('解释页面', sensitivePage());
    const provider = new DeepSeekProvider(transport);

    await provider.chat({
      requestId: 'security-outbound-body',
      model: 'deepseek-v4-flash',
      messages: built.messages,
    });

    const [, , init] = vi.mocked(transport.request).mock.calls[0]!;
    const body = String(init.body);
    for (const secret of Object.values(SECRETS)) {
      expect(body).not.toContain(secret);
    }
    expect(body).toContain('‹REDACTED:');
  });
});
