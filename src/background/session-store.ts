import { z } from 'zod';

import {
  CURRENT_SCHEMA_VERSION,
  StorageCapacityError,
  StorageRepository,
  type StorageAreaLike,
} from '../lib/storage';
import type { Message, PageContext, Session } from '../lib/types';

export const SESSION_STORAGE_KEY = 'sessions:v1';
export const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const MAX_RECENT_SESSIONS = 50;
export const MAX_SESSION_MESSAGES = 200;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const SUMMARY_MESSAGE_THRESHOLD = 40;
export const SUMMARY_TOKEN_THRESHOLD = 8_000;
export const SESSION_CONTEXT_BYTES = 12 * 1024;
export const PANEL_SESSION_BYTES = 48 * 1024;

const messageSchema = z
  .object({
    id: z.string().min(1).max(128),
    role: z.enum(['user', 'assistant', 'tool', 'system']),
    content: z.string(),
    toolCall: z
      .object({
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
      })
      .optional(),
    toolResult: z
      .object({
        name: z.string(),
        ok: z.boolean(),
        data: z.unknown().optional(),
        error: z.string().optional(),
      })
      .optional(),
    createdAt: z.iso.datetime(),
  })
  .strict();

const sessionSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    sessionId: z.string().min(1).max(128),
    pageUrl: z.url(),
    pageType: z.string().min(1).max(50),
    repository: z.string().max(500).optional(),
    messages: z.array(messageSchema).max(MAX_SESSION_MESSAGES),
    pageSummary: z
      .string()
      .max(32 * 1024)
      .optional(),
    historySummary: z
      .string()
      .max(16 * 1024)
      .optional(),
    updatedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();

const sessionCollectionSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    sessions: z.array(sessionSchema),
  })
  .strict();

interface SessionCollection {
  schemaVersion: 1;
  sessions: Session[];
}

export interface SessionPromptContext {
  history: Message[];
  historySummary?: string;
}

export interface PreparedSession extends SessionPromptContext {
  session: Session;
}

export interface PanelSessionSnapshot {
  sessionId?: string;
  messages: Array<Pick<Message, 'id' | 'role' | 'content' | 'createdAt'>>;
  truncated: boolean;
}

export interface SessionStoreOptions {
  now?: () => Date;
  storageLimits?: {
    soft: number;
    hard: number;
  };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) {
    return value;
  }
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (byteLength(value.slice(0, middle)) <= maxBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${value.slice(0, Math.max(0, low - 32))}\n‹MESSAGE_TRUNCATED›`;
}

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    content: truncateUtf8(message.content, MAX_MESSAGE_BYTES),
  };
}

function estimateTokens(messages: Message[], summary?: string): number {
  const characters =
    messages.reduce((total, message) => total + message.content.length, 0) + (summary?.length ?? 0);
  return Math.ceil(characters / 2);
}

function summaryLine(message: Message): string {
  const label =
    message.role === 'user'
      ? '用户'
      : message.role === 'assistant'
        ? '助手'
        : message.role === 'tool'
          ? '工具'
          : '系统';
  const oneLine = message.content.replace(/\s+/g, ' ').trim();
  return `[${label}] ${oneLine.slice(0, 320)}`;
}

function compactLongConversation(session: Session): Session {
  const normalizedMessages = session.messages.slice(-MAX_SESSION_MESSAGES).map(normalizeMessage);
  if (
    normalizedMessages.length <= SUMMARY_MESSAGE_THRESHOLD &&
    estimateTokens(normalizedMessages, session.historySummary) <= SUMMARY_TOKEN_THRESHOLD
  ) {
    return { ...session, messages: normalizedMessages };
  }

  const recentCount = Math.min(12, Math.max(4, Math.floor(normalizedMessages.length / 2)));
  const older = normalizedMessages.slice(0, -recentCount);
  if (older.length === 0) {
    return { ...session, messages: normalizedMessages };
  }
  const nextSummary = [session.historySummary, older.map(summaryLine).join('\n')]
    .filter(Boolean)
    .join('\n');
  return {
    ...session,
    historySummary: truncateUtf8(nextSummary, 12 * 1024),
    messages: normalizedMessages.slice(-recentCount),
  };
}

function sessionMatchesPage(session: Session, page: PageContext): boolean {
  if (session.pageUrl === page.url) {
    return true;
  }
  return Boolean(page.repository && session.repository === page.repository);
}

function newestFirst(left: Session, right: Session): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function projectMessages(messages: Message[], maxBytes: number): PanelSessionSnapshot['messages'] {
  const projected: PanelSessionSnapshot['messages'] = [];
  let bytes = 0;
  for (const message of [...messages].reverse()) {
    if (projected.length >= 40) {
      break;
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    const candidate = {
      id: message.id,
      role: message.role,
      content: truncateUtf8(message.content, Math.max(1_024, maxBytes - 512)),
      createdAt: message.createdAt,
    };
    const candidateBytes = byteLength(JSON.stringify(candidate));
    if (projected.length > 0 && bytes + candidateBytes > maxBytes) {
      break;
    }
    projected.push(candidate);
    bytes += candidateBytes;
  }
  return projected.reverse();
}

export class SessionStore {
  private readonly storage: StorageRepository;
  private readonly now: () => Date;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(area: StorageAreaLike = chrome.storage.local, options: SessionStoreOptions = {}) {
    this.storage = new StorageRepository(area, options.storageLimits);
    this.now = options.now ?? (() => new Date());
  }

  async create(page: PageContext): Promise<Session> {
    return this.mutate((sessions) => {
      const now = this.now().toISOString();
      const session: Session = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessionId: crypto.randomUUID(),
        pageUrl: page.url,
        pageType: page.pageType,
        repository: page.repository,
        messages: [],
        pageSummary: page.pageSummary,
        createdAt: now,
        updatedAt: now,
      };
      sessions.push(session);
      return session;
    });
  }

  async get(sessionId: string): Promise<Session | undefined> {
    const sessions = await this.loadAndMaintain();
    return sessions.find((session) => session.sessionId === sessionId);
  }

  async findForPage(page: PageContext): Promise<Session | undefined> {
    const sessions = await this.loadAndMaintain();
    return sessions.filter((session) => sessionMatchesPage(session, page)).sort(newestFirst)[0];
  }

  async listRecent(): Promise<Session[]> {
    return (await this.loadAndMaintain()).sort(newestFirst);
  }

  async prepare(page: PageContext, question: string): Promise<PreparedSession> {
    return this.mutate((sessions) => {
      const now = this.now().toISOString();
      let session = sessions.filter((item) => sessionMatchesPage(item, page)).sort(newestFirst)[0];
      if (!session) {
        session = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          sessionId: crypto.randomUUID(),
          pageUrl: page.url,
          pageType: page.pageType,
          repository: page.repository,
          messages: [],
          pageSummary: page.pageSummary,
          createdAt: now,
          updatedAt: now,
        };
        sessions.push(session);
      }
      const promptContext = this.promptContext(session);
      const next = compactLongConversation({
        ...session,
        pageUrl: page.url,
        pageType: page.pageType,
        repository: page.repository,
        pageSummary: page.pageSummary ?? session.pageSummary,
        messages: [
          ...session.messages,
          normalizeMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: question,
            createdAt: now,
          }),
        ],
        updatedAt: now,
      });
      const index = sessions.findIndex((item) => item.sessionId === next.sessionId);
      sessions[index] = next;
      return { session: next, ...promptContext };
    });
  }

  async appendAssistant(sessionId: string, content: string): Promise<Session> {
    return this.mutate((sessions) => {
      const index = sessions.findIndex((session) => session.sessionId === sessionId);
      if (index < 0) {
        throw new Error('要更新的会话不存在');
      }
      const now = this.now().toISOString();
      const next = compactLongConversation({
        ...sessions[index]!,
        messages: [
          ...sessions[index]!.messages,
          normalizeMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content,
            createdAt: now,
          }),
        ],
        updatedAt: now,
      });
      sessions[index] = next;
      return next;
    });
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.mutate((sessions) => {
      const index = sessions.findIndex((session) => session.sessionId === sessionId);
      if (index < 0) {
        return false;
      }
      sessions.splice(index, 1);
      return true;
    });
  }

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      await this.storage.remove(SESSION_STORAGE_KEY);
    });
  }

  async bytesInUse(): Promise<number> {
    return await this.storage.getBytesInUse(null);
  }

  promptContext(session: Session): SessionPromptContext {
    const history = projectMessages(session.messages, SESSION_CONTEXT_BYTES) as Message[];
    return {
      history,
      historySummary: session.historySummary,
    };
  }

  panelSnapshot(session?: Session): PanelSessionSnapshot {
    if (!session) {
      return { messages: [], truncated: false };
    }
    const messages = projectMessages(session.messages, PANEL_SESSION_BYTES);
    return {
      sessionId: session.sessionId,
      messages,
      truncated:
        messages.length <
        session.messages.filter(
          (message) => message.role === 'user' || message.role === 'assistant',
        ).length,
    };
  }

  private async loadAndMaintain(): Promise<Session[]> {
    return this.enqueue(async () => {
      const sessions = await this.readSessions();
      const maintained = this.maintain(sessions);
      if (JSON.stringify(maintained) !== JSON.stringify(sessions)) {
        await this.saveSessions(maintained);
      }
      return maintained;
    });
  }

  private async mutate<T>(mutation: (sessions: Session[]) => T): Promise<T> {
    return this.enqueue(async () => {
      const sessions = this.maintain(await this.readSessions());
      const result = mutation(sessions);
      await this.saveSessions(this.maintain(sessions));
      return result;
    });
  }

  private async readSessions(): Promise<Session[]> {
    const stored = await this.storage.get<unknown>(SESSION_STORAGE_KEY);
    if (stored === undefined) {
      return [];
    }
    return sessionCollectionSchema.parse(stored).sessions;
  }

  private maintain(sessions: Session[]): Session[] {
    const expiry = this.now().getTime() - SESSION_RETENTION_MS;
    return sessions
      .filter((session) => Date.parse(session.updatedAt) >= expiry)
      .map(compactLongConversation)
      .sort(newestFirst)
      .slice(0, MAX_RECENT_SESSIONS);
  }

  private async saveSessions(sessions: Session[]): Promise<void> {
    let candidate = sessions;
    try {
      const result = await this.writeCollection(candidate);
      if (!result.softLimitExceeded) {
        return;
      }
    } catch (error: unknown) {
      if (!(error instanceof StorageCapacityError)) {
        throw error;
      }
    }

    candidate = candidate.map((session) =>
      session.historySummary && session.messages.length > 4
        ? { ...session, messages: session.messages.slice(-4) }
        : session,
    );
    try {
      const result = await this.writeCollection(candidate);
      if (!result.softLimitExceeded) {
        return;
      }
    } catch (error: unknown) {
      if (!(error instanceof StorageCapacityError)) {
        throw error;
      }
    }

    candidate = candidate.map((session) => {
      const withoutPageSummary = { ...session };
      delete withoutPageSummary.pageSummary;
      return withoutPageSummary;
    });
    await this.writeCollection(candidate);
  }

  private writeCollection(sessions: Session[]) {
    const collection: SessionCollection = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sessions,
    };
    return this.storage.set(SESSION_STORAGE_KEY, collection);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

let defaultSessionStore: SessionStore | undefined;

export function sessionStore(): SessionStore {
  defaultSessionStore ??= new SessionStore();
  return defaultSessionStore;
}
