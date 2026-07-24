import { describe, expect, it, vi } from 'vitest';

import { DeepSeekProvider } from '../../src/background/providers/deepseek';
import { OpenRouterProvider } from '../../src/background/providers/openrouter';
import type {
  Provider,
  ProviderChatRequest,
  ProviderTransport,
} from '../../src/background/providers/base';
import { UuapiProvider } from '../../src/background/providers/uuapi';

const factories = [
  {
    id: 'deepseek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-v4-flash',
    create: (transport: ProviderTransport): Provider => new DeepSeekProvider(transport),
  },
  {
    id: 'uuapi',
    endpoint: 'https://uuapi.net/v1/chat/completions',
    model: 'vision-model-account-id',
    create: (transport: ProviderTransport): Provider => new UuapiProvider(transport),
  },
  {
    id: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: '~openai/gpt-latest',
    create: (transport: ProviderTransport): Provider => new OpenRouterProvider(transport),
  },
] as const;

function request(id: string, model: string): ProviderChatRequest {
  return {
    requestId: id,
    model,
    messages: [{ role: 'user', content: 'hello' }],
  };
}

describe.each(factories)('$id adapter', ({ id, endpoint, model, create }) => {
  it('固定 Host/路径并组装 OpenAI ChatCompletions 请求', async () => {
    const transport: ProviderTransport = {
      request: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model,
              choices: [{ message: { content: '你好' } }],
              usage: { prompt_tokens: 2, completion_tokens: 3 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    };
    const provider = create(transport);
    const response = await provider.chat(request(`${id}:chat`, model));

    expect(response.content).toBe('你好');
    expect(response.usage).toEqual({ promptTokens: 2, completionTokens: 3 });
    expect(transport.request).toHaveBeenCalledOnce();
    const [providerId, url, init] = vi.mocked(transport.request).mock.calls[0]!;
    expect(providerId).toBe(id);
    expect(url).toBe(endpoint);
    expect(JSON.parse(String(init.body))).toMatchObject({
      model,
      stream: false,
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('解析 SSE 流式增量与 usage', async () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const transport: ProviderTransport = {
      request: vi.fn(
        async () =>
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    };
    const provider = create(transport);
    const chunks = [];
    for await (const chunk of provider.chatStream(request(`${id}:stream`, model))) {
      chunks.push(chunk);
    }
    expect(
      chunks
        .map((chunk) => chunk.delta)
        .filter(Boolean)
        .join(''),
    ).toBe('你好');
    expect(chunks.some((chunk) => chunk.done)).toBe(true);
    expect(chunks.find((chunk) => chunk.usage)?.usage).toEqual({
      promptTokens: 2,
      completionTokens: 2,
    });
  });

  it('按 requestId 取消进行中的请求', async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const transport: ProviderTransport = {
      request: vi.fn(
        async (_providerId, _url, _init, signal) =>
          await new Promise<Response>((_resolve, reject) => {
            markStarted?.();
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          }),
      ),
    };
    const provider = create(transport);
    const requestId = `${id}:abort`;
    const pending = provider.chatStream(request(requestId, model))[Symbol.asyncIterator]().next();
    await started;
    expect(provider.abort(requestId)).toBe(true);
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('Provider-specific behavior', () => {
  it('DeepSeek V4 显式关闭默认思考模式以避免简单文本请求浪费输出预算', async () => {
    const transport: ProviderTransport = {
      request: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'deepseek-v4-flash',
              choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    };
    const provider = new DeepSeekProvider(transport);

    await provider.chat(request('deepseek:non-thinking', 'deepseek-v4-flash'));

    const [, , init] = vi.mocked(transport.request).mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toMatchObject({
      thinking: { type: 'disabled' },
    });
  });

  it('DeepSeek 拒绝停用别名和图像输入', async () => {
    const transport: ProviderTransport = {
      request: vi.fn(),
    };
    const provider = new DeepSeekProvider(transport);
    await expect(provider.chat(request('legacy', 'deepseek-chat'))).rejects.toThrow(/已停用/);
    await expect(
      provider.chat({
        ...request('vision', 'deepseek-v4-flash'),
        images: ['data:image/png;base64,AA=='],
      }),
    ).rejects.toThrow(/不支持图像/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('各适配器将 HTTP 错误映射为可读类型', async () => {
    for (const factory of factories) {
      const provider = factory.create({
        request: vi.fn(
          async () =>
            new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      });
      await expect(
        provider.chat(request(`${factory.id}:error`, factory.model)),
      ).rejects.toMatchObject({ code: 'AUTH', status: 401 });

      const limited = factory.create({
        request: vi.fn(
          async () =>
            new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': '12',
              },
            }),
        ),
      });
      await expect(
        limited.chat(request(`${factory.id}:limit`, factory.model)),
      ).rejects.toMatchObject({
        code: 'RATE_LIMIT',
        status: 429,
        retryAfterSeconds: 12,
      });
    }
  });
});
