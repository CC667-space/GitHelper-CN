import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PanelPickState } from '../../src/lib/bridge-protocol';
import { PanelApp } from '../../src/panel/App';
import { usePanelStore } from '../../src/panel/store';

afterEach(() => {
  cleanup();
  usePanelStore.setState({
    activeRequestId: undefined,
    connected: false,
    draft: '',
    messages: [],
    pageLabel: '等待读取当前 GitHub 页面',
    providers: [],
    pickStatus: 'idle',
    pickStatusMessage: undefined,
    selectedElement: undefined,
    regionStatus: 'idle',
    regionStatusMessage: undefined,
    selectedRegion: undefined,
    sessionHistoryTruncated: false,
    sessionId: undefined,
    selectedTextProviderId: undefined,
    selectedVisionProviderId: undefined,
  });
});

describe('Phase 6 Panel click selection', () => {
  it('进入/取消 pick，并把已选元素随问题交给 Background', async () => {
    const startPick = vi.fn();
    const cancelPick = vi.fn();
    const send = vi.fn();
    let emitPickState: ((state: PanelPickState) => void) | undefined;
    const connect = vi.fn(
      (_onEvent, _onProviderState, onConnectionChange, _onSessionState, onPickState) => {
        emitPickState = onPickState;
        onConnectionChange(true);
        return {
          send,
          abort: vi.fn(),
          startPick,
          cancelPick,
          disconnect: vi.fn(),
        };
      },
    );
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('button', { name: '点击页面元素提问' }));
    expect(startPick).toHaveBeenCalledOnce();
    act(() => emitPickState?.({ status: 'active' }));
    expect(screen.getByText('请在 GitHub 页面点击要提问的元素')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消点击选择' }));
    expect(cancelPick).toHaveBeenCalledOnce();

    const element = {
      tag: 'a',
      role: 'link',
      text: 'Issues 42',
      href: 'https://github.com/openai/openai-node/issues',
      attrs: { 'aria-label': 'Issues' },
      nearbyContext: 'Repository navigation Issues 42',
      pageType: 'repo' as const,
    };
    act(() => emitPickState?.({ status: 'selected', element }));
    expect(screen.getByText(/已选择 <a>/)).toBeTruthy();
    await user.type(screen.getByLabelText('输入问题'), '这个入口有什么用？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(send).toHaveBeenCalledExactlyOnceWith('这个入口有什么用？', undefined, element);
  });
});
