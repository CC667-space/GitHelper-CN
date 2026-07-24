import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { MessageRouter } from '../../src/background/router';
import { createEnvelope } from '../../src/lib/messaging';

const runtimeId = 'abcdefghijklmnopabcdefghijklmnop';
const contentSender = {
  id: runtimeId,
  frameId: 0,
  url: 'https://github.com/openai/openai-node',
  tab: { id: 1, url: 'https://github.com/openai/openai-node' },
} as chrome.runtime.MessageSender;

describe('MessageRouter', () => {
  const router = new MessageRouter(
    {
      PAGE_CONTEXT: {
        source: 'content',
        payloadSchema: z.object({ url: z.string().url() }),
        handler: (payload) => payload,
      },
    },
    runtimeId,
    { maxPayloadBytes: 512, timeoutMs: 20 },
  );

  it('校验来源与 Schema，并保持响应 request ID', async () => {
    const request = createEnvelope(
      'PAGE_CONTEXT',
      { url: 'https://github.com/openai/openai-node' },
      { id: 'request-1' },
    );
    const response = await router.dispatch(request, contentSender);
    expect(response.id).toBe('request-1');
    expect(response.type).toBe('PAGE_CONTEXT:response');

    await expect(router.dispatch(request, { ...contentSender, id: 'other' })).rejects.toMatchObject(
      { code: 'INVALID_MESSAGE_SOURCE' },
    );
    await expect(
      router.dispatch(createEnvelope('PAGE_CONTEXT', { url: 42 }), contentSender),
    ).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' });
  });

  it('拒绝凭据字段、超载荷和超时', async () => {
    await expect(
      router.dispatch(
        createEnvelope('PAGE_CONTEXT', {
          url: 'https://github.com',
          apiKey: 'plain-secret',
        }),
        contentSender,
      ),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_IN_MESSAGE' });

    const oversized = createEnvelope('PAGE_CONTEXT', {
      url: `https://github.com/${'x'.repeat(600)}`,
    });
    await expect(router.dispatch(oversized, contentSender)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });

    const slowRouter = new MessageRouter(
      {
        SLOW: {
          source: 'content',
          payloadSchema: z.object({}),
          handler: () => new Promise(() => undefined),
        },
      },
      runtimeId,
      { maxPayloadBytes: 512, timeoutMs: 1 },
    );
    await expect(
      slowRouter.dispatch(createEnvelope('SLOW', {}), contentSender),
    ).rejects.toMatchObject({ code: 'MESSAGE_TIMEOUT' });
  });
});
