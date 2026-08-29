import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PanelApp } from '../../src/panel/App';
import type { PanelOperationConfirmationState } from '../../src/lib/bridge-protocol';
import type { connectPanel, PanelConnection } from '../../src/panel/connection';

describe('Panel operation confirmation', () => {
  it('显示搜索确认卡，并只在用户确认后重发 confirmed 请求', async () => {
    const search = vi.fn();
    let emitConfirmation: (state: PanelOperationConfirmationState) => void = () => undefined;
    const connection: PanelConnection = {
      send: vi.fn(),
      abort: vi.fn(),
      search,
      disconnect: vi.fn(),
    };
    const connect = vi.fn((...args: Parameters<typeof connectPanel>) => {
      args[2]?.(true);
      emitConfirmation = args[8] ?? (() => undefined);
      return connection;
    }) as unknown as typeof connectPanel;
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    act(() => {
      emitConfirmation({
        action: 'search',
        requestId: 'confirm-search',
        naturalLanguage: '中文浏览器扩展',
        target: 'repositories',
        providerId: 'deepseek',
      });
    });

    expect(screen.getByTestId('operation-confirmation').textContent).toContain(
      '确认执行本次公开 GitHub 搜索',
    );
    await user.click(screen.getByRole('button', { name: '确认一次' }));

    expect(search).toHaveBeenCalledExactlyOnceWith(
      '中文浏览器扩展',
      'repositories',
      'deepseek',
      true,
    );
    expect(screen.queryByTestId('operation-confirmation')).toBeNull();
  });
});
