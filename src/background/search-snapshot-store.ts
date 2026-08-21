import { z } from 'zod';

import { githubSearchResultSchema, searchTargetSchema } from '../lib/github-search';
import { CURRENT_SCHEMA_VERSION, type StorageAreaLike } from '../lib/storage';

export const SEARCH_SNAPSHOT_STORAGE_KEY = 'panel:search-snapshots:v1';
export const SEARCH_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1_000;
const MAX_SEARCH_SNAPSHOTS = 10;

const searchSnapshotSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(128),
    naturalLanguage: z.string().min(1).max(500),
    target: searchTargetSchema,
    result: githubSearchResultSchema,
    savedAt: z.iso.datetime(),
  })
  .strict();

const searchSnapshotCollectionSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    items: z.array(searchSnapshotSchema).max(MAX_SEARCH_SNAPSHOTS),
  })
  .strict();

export type SearchSnapshot = z.infer<typeof searchSnapshotSchema>;
export type SearchSnapshotInput = Omit<SearchSnapshot, 'savedAt'>;

export class SearchSnapshotStore {
  constructor(
    private readonly area: StorageAreaLike = chrome.storage.session,
    private readonly now: () => number = Date.now,
  ) {}

  async read(tabId: number): Promise<SearchSnapshot | undefined> {
    return (await this.readCurrent()).find((item) => item.tabId === tabId);
  }

  async save(input: SearchSnapshotInput): Promise<SearchSnapshot> {
    const snapshot = searchSnapshotSchema.parse({
      ...input,
      savedAt: new Date(this.now()).toISOString(),
    });
    const current = await this.readCurrent();
    await this.persist(
      [snapshot, ...current.filter((item) => item.tabId !== snapshot.tabId)].slice(
        0,
        MAX_SEARCH_SNAPSHOTS,
      ),
    );
    return snapshot;
  }

  async clear(tabId: number): Promise<void> {
    const current = await this.readCurrent();
    await this.persist(current.filter((item) => item.tabId !== tabId));
  }

  async clearAll(): Promise<void> {
    await this.area.remove(SEARCH_SNAPSHOT_STORAGE_KEY);
  }

  private async readCurrent(): Promise<SearchSnapshot[]> {
    const raw = (await this.area.get(SEARCH_SNAPSHOT_STORAGE_KEY))[SEARCH_SNAPSHOT_STORAGE_KEY];
    if (raw === undefined) {
      return [];
    }
    const parsed = searchSnapshotCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      await this.area.remove(SEARCH_SNAPSHOT_STORAGE_KEY);
      return [];
    }
    const expiresAfter = this.now() - SEARCH_SNAPSHOT_TTL_MS;
    const current = parsed.data.items.filter((item) => Date.parse(item.savedAt) >= expiresAfter);
    if (current.length !== parsed.data.items.length) {
      await this.persist(current);
    }
    return current;
  }

  private async persist(items: SearchSnapshot[]): Promise<void> {
    if (items.length === 0) {
      await this.area.remove(SEARCH_SNAPSHOT_STORAGE_KEY);
      return;
    }
    await this.area.set({
      [SEARCH_SNAPSHOT_STORAGE_KEY]: searchSnapshotCollectionSchema.parse({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        items,
      }),
    });
  }
}
