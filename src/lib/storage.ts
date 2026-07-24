export const CURRENT_SCHEMA_VERSION = 1;
export const STORAGE_SOFT_LIMIT_BYTES = 6 * 1024 * 1024;
export const STORAGE_HARD_LIMIT_BYTES = 9 * 1024 * 1024;

export interface VersionedRecord {
  schemaVersion: number;
}

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
}

export interface StorageWriteResult {
  bytesBefore: number;
  estimatedBytesAfter: number;
  softLimitExceeded: boolean;
}

export type Migration<T extends VersionedRecord> = (value: T) => T;
export type MigrationMap<T extends VersionedRecord> = Partial<Record<number, Migration<T>>>;

export class StorageCapacityError extends Error {
  readonly code = 'STORAGE_HARD_LIMIT';

  constructor(
    readonly estimatedBytesAfter: number,
    readonly hardLimitBytes: number,
  ) {
    super(`写入后预计占用 ${estimatedBytesAfter} bytes，超过硬上限 ${hardLimitBytes} bytes`);
    this.name = 'StorageCapacityError';
  }
}

function estimateSerializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function migrateVersioned<T extends VersionedRecord>(
  value: T,
  targetVersion: number,
  migrations: MigrationMap<T>,
): T {
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new Error('存储记录缺少有效 schemaVersion');
  }
  if (value.schemaVersion > targetVersion) {
    throw new Error(`存储版本 ${value.schemaVersion} 高于当前支持版本 ${targetVersion}`);
  }

  let migrated = value;
  while (migrated.schemaVersion < targetVersion) {
    const migration = migrations[migrated.schemaVersion];
    if (!migration) {
      throw new Error(`缺少从 schemaVersion ${migrated.schemaVersion} 开始的迁移`);
    }
    const previousVersion = migrated.schemaVersion;
    migrated = migration(migrated);
    if (migrated.schemaVersion <= previousVersion) {
      throw new Error('迁移必须提升 schemaVersion');
    }
  }
  return migrated;
}

export class StorageRepository {
  constructor(
    private readonly area: StorageAreaLike = chrome.storage.local,
    private readonly limits = {
      soft: STORAGE_SOFT_LIMIT_BYTES,
      hard: STORAGE_HARD_LIMIT_BYTES,
    },
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const result = await this.area.get(key);
    return result[key] as T | undefined;
  }

  async getVersioned<T extends VersionedRecord>(
    key: string,
    targetVersion = CURRENT_SCHEMA_VERSION,
    migrations: MigrationMap<T> = {},
  ): Promise<T | undefined> {
    const value = await this.get<T>(key);
    return value ? migrateVersioned(value, targetVersion, migrations) : undefined;
  }

  async set<T extends VersionedRecord>(key: string, value: T): Promise<StorageWriteResult> {
    if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
      throw new Error('持久数据必须包含有效 schemaVersion');
    }
    const [bytesBefore, existing] = await Promise.all([
      this.area.getBytesInUse(null),
      this.area.get(key),
    ]);
    const existingBytes = key in existing ? estimateSerializedBytes({ [key]: existing[key] }) : 0;
    const incomingBytes = estimateSerializedBytes({ [key]: value });
    const estimatedBytesAfter = Math.max(0, bytesBefore - existingBytes + incomingBytes);
    if (estimatedBytesAfter > this.limits.hard) {
      throw new StorageCapacityError(estimatedBytesAfter, this.limits.hard);
    }

    await this.area.set({ [key]: value });
    return {
      bytesBefore,
      estimatedBytesAfter,
      softLimitExceeded: estimatedBytesAfter > this.limits.soft,
    };
  }

  remove(keys: string | string[]): Promise<void> {
    return this.area.remove(keys);
  }

  clear(): Promise<void> {
    return this.area.clear();
  }

  getBytesInUse(keys: string | string[] | null = null): Promise<number> {
    return this.area.getBytesInUse(keys);
  }
}
