import { describe, expect, it } from 'vitest';

import {
  createBackgroundCredentialStore,
  createOptionsCredentialStore,
  type CredentialStorageArea,
} from '../../src/background/credential-store';

class MemoryCredentialArea implements CredentialStorageArea {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return key in this.values ? { [key]: this.values[key] } : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }

  async remove(key: string | string[]): Promise<void> {
    for (const item of Array.isArray(key) ? key : [key]) {
      delete this.values[item];
    }
  }
}

describe('credential-store', () => {
  it('Options 只写入/删除，Background 只读取/掩码/注入 Header', async () => {
    const area = new MemoryCredentialArea();
    const options = createOptionsCredentialStore(area);
    const background = createBackgroundCredentialStore(area);
    const apiKey = 'sk-dedicated-test-key-123456';

    await options.write('deepseek', apiKey);
    await expect(background.getMask('deepseek')).resolves.toBe('••••3456');
    await expect(background.getRevision('deepseek')).resolves.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    const headers = await background.injectAuthorization('deepseek', {
      Accept: 'application/json',
    });
    expect(headers.get('Authorization')).toBe(`Bearer ${apiKey}`);
    expect(JSON.stringify(await background.getMask('deepseek'))).not.toContain(apiKey);

    await options.delete('deepseek');
    await expect(background.read('deepseek')).resolves.toBeUndefined();
  });

  it('每次重写 Key 都生成新的非秘密修订号，旧凭据仍有稳定兼容修订号', async () => {
    const area = new MemoryCredentialArea();
    const options = createOptionsCredentialStore(area);
    const background = createBackgroundCredentialStore(area);

    await options.write('deepseek', 'deepseek-test-key-one');
    const first = await background.getRevision('deepseek');
    await options.write('deepseek', 'deepseek-test-key-two');
    const second = await background.getRevision('deepseek');

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    area.values['credential:provider:deepseek'] = {
      providerId: 'deepseek',
      apiKey: 'legacy-deepseek-key',
    };
    await expect(background.getRevision('deepseek')).resolves.toBe('legacy-v1');
  });

  it('批量删除只移除目录内全部 Provider 凭据', async () => {
    const area = new MemoryCredentialArea();
    const options = createOptionsCredentialStore(area);
    await options.write('deepseek', 'deepseek-test-key');
    await options.write('uuapi', 'uuapi-test-key');
    await options.write('openrouter', 'openrouter-test-key');
    await options.write('openai', 'openai-test-key');
    area.values['preferences:v1'] = { schemaVersion: 1 };

    await options.deleteAll();

    expect(Object.keys(area.values)).toEqual(['preferences:v1']);
  });

  it('拒绝无效 Key 且从不把已存明文放进错误', async () => {
    const area = new MemoryCredentialArea();
    const options = createOptionsCredentialStore(area);
    await expect(options.write('uuapi', 'short')).rejects.toThrow('长度无效');
    await expect(
      createBackgroundCredentialStore(area).injectAuthorization('uuapi'),
    ).rejects.not.toThrow(/short/);
  });
});
