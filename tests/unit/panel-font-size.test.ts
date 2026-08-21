import { describe, expect, it, vi } from 'vitest';

import { defaultUserPreferences } from '../../src/background/prefs-store';
import { installPanelFontSizePreference } from '../../src/panel/font-size';

describe('Panel 字号偏好', () => {
  it('先应用标准字号，再读取偏好并监听本地设置变化', async () => {
    const root = document.createElement('div');
    let listener:
      ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void) | undefined;
    const changes = {
      addListener: vi.fn((next: typeof listener) => {
        listener = next;
      }),
      removeListener: vi.fn(),
    };
    const reader = {
      read: vi.fn(async () => ({ ...defaultUserPreferences(), panelFontSize: 18 as const })),
    };

    const pendingCleanup = installPanelFontSizePreference(root, { reader, changes });
    expect(root.style.fontSize).toBe('16px');
    const cleanup = await pendingCleanup;
    expect(root.style.fontSize).toBe('18px');

    listener?.(
      {
        'preferences:v1': {
          newValue: { ...defaultUserPreferences(), panelFontSize: 14 },
        },
      },
      'local',
    );
    expect(root.style.fontSize).toBe('14px');

    listener?.({ 'preferences:v1': { newValue: undefined } }, 'local');
    expect(root.style.fontSize).toBe('16px');

    cleanup();
    expect(changes.removeListener).toHaveBeenCalledWith(listener);
  });
});
