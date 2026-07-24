import { describe, expect, it } from 'vitest';

import {
  MAX_RECENT_SESSIONS,
  PANEL_SESSION_BYTES,
  SESSION_RETENTION_MS,
  SESSION_STORAGE_KEY,
  SessionStore,
} from '../../src/background/session-store';
import type { StorageAreaLike } from '../../src/lib/storage';
import type { Message, PageContext, Session } from '../../src/lib/types';

class MemoryArea implements StorageAreaLike {
  values: Record<string, unknown> = {};
  getBytesCalls = 0;

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === undefined || keys === null) {
      return { ...this.values };
    }
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in this.values).map((key) => [key, this.values[key]]),
    );
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.values[key];
    }
  }

  async clear(): Promise<void> {
    this.values = {};
  }

  async getBytesInUse(): Promise<number> {
    this.getBytesCalls += 1;
    return new TextEncoder().encode(JSON.stringify(this.values)).byteLength;
  }
}

const NOW = new Date('2026-07-24T12:00:00.000Z');

function page(overrides: Partial<PageContext> = {}): PageContext {
  return {
    url: 'https://github.com/openai/openai-node',
    pageType: 'repo',
    repository: 'openai/openai-node',
    isPrivate: false,
    extracted: {},
    capturedAt: NOW.toISOString(),
    ...overrides,
  };
}

function storedSession(
  index: number,
  updatedAt: string,
  overrides: Partial<Session> = {},
): Session {
  return {
    schemaVersion: 1,
    sessionId: `session-${index}`,
    pageUrl: `https://github.com/example/repo-${index}`,
    pageType: 'repo',
    repository: `example/repo-${index}`,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

describe('SessionStore', () => {
  it('完成新建、同仓库继续、最近列表、页面关联与删除', async () => {
    const area = new MemoryArea();
    const store = new SessionStore(area, { now: () => NOW });
    const prepared = await store.prepare(page(), '这个仓库是什么？');
    await store.appendAssistant(prepared.session.sessionId, '这是一个公开仓库。');

    const continued = await store.prepare(
      page({
        url: 'https://github.com/openai/openai-node/issues/1',
        pageType: 'issue',
      }),
      '这个 Issue 呢？',
    );

    expect(continued.session.sessionId).toBe(prepared.session.sessionId);
    expect(continued.history.map((message) => message.content)).toEqual([
      '这个仓库是什么？',
      '这是一个公开仓库。',
    ]);
    expect((await store.listRecent())[0]?.pageUrl).toContain('/issues/1');
    expect(await store.delete(prepared.session.sessionId)).toBe(true);
    expect(await store.get(prepared.session.sessionId)).toBeUndefined();
    expect(area.getBytesCalls).toBeGreaterThan(0);
  });

  it('自动删除 30 天过期会话并只保留最近 50 个', async () => {
    const area = new MemoryArea();
    const validSessions = Array.from({ length: MAX_RECENT_SESSIONS + 1 }, (_, index) =>
      storedSession(index, new Date(NOW.getTime() - index * 60_000).toISOString()),
    );
    const expired = storedSession(
      999,
      new Date(NOW.getTime() - SESSION_RETENTION_MS - 1).toISOString(),
    );
    await area.set({
      [SESSION_STORAGE_KEY]: {
        schemaVersion: 1,
        sessions: [...validSessions, expired],
      },
    });

    const recent = await new SessionStore(area, { now: () => NOW }).listRecent();

    expect(recent).toHaveLength(MAX_RECENT_SESSIONS);
    expect(recent.some((session) => session.sessionId === expired.sessionId)).toBe(false);
    expect(recent[0]?.sessionId).toBe('session-0');
  });

  it('长对话生成本地摘要，并限制 Provider 与 Panel 恢复载荷', async () => {
    const area = new MemoryArea();
    const store = new SessionStore(area, { now: () => NOW });
    let sessionId = '';
    for (let index = 0; index < 24; index += 1) {
      const prepared = await store.prepare(page(), `问题 ${index} ${'问'.repeat(280)}`);
      sessionId = prepared.session.sessionId;
      await store.appendAssistant(sessionId, `回答 ${index} ${'答'.repeat(280)}`);
    }

    const session = await store.get(sessionId);
    expect(session?.historySummary).toContain('[用户]');
    expect(session!.messages.length).toBeLessThan(40);
    const context = store.promptContext(session!);
    expect(
      new TextEncoder().encode(JSON.stringify(context.history)).byteLength,
    ).toBeLessThanOrEqual(12 * 1024 + 512);
    const panel = store.panelSnapshot(session);
    expect(new TextEncoder().encode(JSON.stringify(panel.messages)).byteLength).toBeLessThanOrEqual(
      PANEL_SESSION_BYTES + 512,
    );
  });

  it('逼近硬上限时先丢已摘要正文，再丢页面摘要，偏好键保持不变', async () => {
    const area = new MemoryArea();
    const updatedAt = NOW.toISOString();
    const messages: Message[] = Array.from({ length: 6 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: '正文'.repeat(350),
      createdAt: updatedAt,
    }));
    await area.set({
      [SESSION_STORAGE_KEY]: {
        schemaVersion: 1,
        sessions: [
          storedSession(1, updatedAt, {
            historySummary: '已有摘要',
            pageSummary: '页面摘要'.repeat(500),
            messages,
          }),
        ],
      },
      'preferences:v1': { schemaVersion: 1, marker: 'keep' },
    });
    const store = new SessionStore(area, {
      now: () => NOW,
      storageLimits: { soft: 8_500, hard: 12_000 },
    });

    await store.appendAssistant('session-1', '新的回答');

    const saved = (area.values[SESSION_STORAGE_KEY] as { sessions: Session[] }).sessions[0]!;
    expect(saved.messages.length).toBeLessThanOrEqual(4);
    expect(saved.pageSummary).toBeUndefined();
    expect(area.values['preferences:v1']).toEqual({ schemaVersion: 1, marker: 'keep' });
  });
});
