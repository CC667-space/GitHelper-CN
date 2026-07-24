import type { PageContext } from '../lib/types';

export class PrivateContextBlockedError extends Error {
  readonly code = 'PRIVATE_CONTEXT_BLOCKED';
  readonly userMessage = '该页面不在当前版本支持范围内，不会发送任何页面数据。';

  constructor() {
    super('检测到私有仓库或无权限页面，已执行零出站阻断');
    this.name = 'PrivateContextBlockedError';
  }
}

export function assertPublicContext(context: Pick<PageContext, 'isPrivate'>): void {
  if (context.isPrivate) {
    throw new PrivateContextBlockedError();
  }
}

export async function withPublicContext<T>(
  context: Pick<PageContext, 'isPrivate'>,
  outbound: () => Promise<T>,
): Promise<T> {
  assertPublicContext(context);
  return outbound();
}
