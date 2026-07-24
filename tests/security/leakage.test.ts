import { describe, expect, it, vi } from 'vitest';

import { buildMinimalContext } from '../../src/background/context-builder';
import { PanelBridge } from '../../src/background/panel-bridge';
import { type ProviderTransport } from '../../src/background/providers/base';
import { DeepSeekProvider } from '../../src/background/providers/deepseek';
import { defaultUserPreferences } from '../../src/background/prefs-store';
import { createEnvelope } from '../../src/lib/messaging';
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

  it('Panel 消息中的敏感文字在会话持久化和 Provider 调用前遮蔽', async () => {
    const apiKey = SECRETS.apiKey;
    const prepareSession = vi.fn(async (_page: unknown, question: string) => ({
      sessionId: 'security-session',
      history: [],
      preferences: defaultUserPreferences(),
      snapshot: {
        sessionId: 'security-session',
        messages: [
          {
            id: 'security-user',
            role: 'user' as const,
            content: question,
            createdAt: '2026-07-24T00:00:00.000Z',
          },
        ],
        truncated: false,
      },
    }));
    const streamAnswer = vi.fn(async function* (input: { question: string }) {
      expect(input.question).not.toContain(apiKey);
      expect(input.question).toContain('‹REDACTED:API_KEY›');
      yield '已安全处理';
    });
    const emitSessionState = vi.fn();
    const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';
    const bridge = new PanelBridge(runtimeId, {
      requestPageInfo: vi.fn(async () => ({
        url: 'https://github.com/octocat/security-fixture',
        title: 'octocat/security-fixture',
        placeholder: false,
        capturedAt: '2026-07-24T00:00:00.000Z',
        pageContext: sensitivePage(),
      })),
      prepareSession,
      streamAnswer,
      saveAssistant: vi.fn(),
      abort: vi.fn(() => false),
      emit: vi.fn(),
      emitSessionState,
    });

    await bridge.dispatch(
      createEnvelope('PANEL_MESSAGE', {
        text: `请勿保存 ${apiKey}`,
      }),
      {
        id: runtimeId,
        url: `chrome-extension://${runtimeId}/src/panel/index.html`,
      },
    );

    const boundaryOutput = JSON.stringify({
      sessionQuestion: prepareSession.mock.calls[0]?.[1],
      providerQuestion: streamAnswer.mock.calls[0]?.[0]?.question,
      emittedSessionState: emitSessionState.mock.calls,
    });
    expect(boundaryOutput).not.toContain(apiKey);
    expect(boundaryOutput).toContain('‹REDACTED:API_KEY›');
  });
});
