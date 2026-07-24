import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PanelRegionState } from '../../src/lib/bridge-protocol';
import type { SelectedRegion } from '../../src/lib/types';
import { PanelApp } from '../../src/panel/App';
import { usePanelStore } from '../../src/panel/store';

function region(needsVision: boolean): SelectedRegion {
  return {
    text: needsVision ? '' : '足够的结构化文字'.repeat(12),
    links: [],
    codeBlocks: [],
    buttons: [],
    htmlOutline: needsVision ? '<img>' : '<p>',
    nearbyContext: 'README',
    needsVision,
    sourceUrl: 'https://github.com/openai/openai-node',
    rect: { x: 10, y: 20, width: 220, height: 120 },
    viewport: { cssWidth: 800, cssHeight: 600 },
    scroll: { x: 0, y: 0 },
    devicePixelRatio: 1.5,
    zoomFactor: 1,
  };
}

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

describe('Phase 7 Panel region selection', () => {
  it('框选状态可取消，视觉路径显示费用提示并使用视觉 Provider', async () => {
    const startRegion = vi.fn();
    const cancelRegion = vi.fn();
    const send = vi.fn();
    let emitRegionState: ((state: PanelRegionState) => void) | undefined;
    const connect = vi.fn(
      (
        _onEvent,
        _onProviderState,
        onConnectionChange,
        _onSessionState,
        _onPickState,
        onRegionState,
      ) => {
        emitRegionState = onRegionState;
        onConnectionChange(true);
        return {
          send,
          abort: vi.fn(),
          startRegion,
          cancelRegion,
          disconnect: vi.fn(),
        };
      },
    );
    usePanelStore.setState({ selectedVisionProviderId: 'openrouter' });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('button', { name: '框选页面区域提问' }));
    expect(startRegion).toHaveBeenCalledOnce();
    act(() => emitRegionState?.({ status: 'active' }));
    expect(screen.getByText('请在 GitHub 页面拖动框选区域')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消区域框选' }));
    expect(cancelRegion).toHaveBeenCalledOnce();

    const visualRegion = region(true);
    act(() => emitRegionState?.({ status: 'selected', region: visualRegion }));
    expect(screen.getByText(/调用视觉 Provider，可能产生费用/)).toBeTruthy();
    await user.type(screen.getByLabelText('输入问题'), '解释这张图');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(send).toHaveBeenCalledExactlyOnceWith(
      '解释这张图',
      'openrouter',
      undefined,
      visualRegion,
    );
  });

  it('结构充分时明确显示不截图', () => {
    let emitRegionState: ((state: PanelRegionState) => void) | undefined;
    const connect = vi.fn(
      (
        _onEvent,
        _onProviderState,
        onConnectionChange,
        _onSessionState,
        _onPickState,
        onRegionState,
      ) => {
        emitRegionState = onRegionState;
        onConnectionChange(true);
        return {
          send: vi.fn(),
          abort: vi.fn(),
          disconnect: vi.fn(),
        };
      },
    );
    render(<PanelApp connect={connect} />);
    act(() => emitRegionState?.({ status: 'selected', region: region(false) }));
    expect(screen.getByText(/只发送提取文本，不截图/)).toBeTruthy();
  });
});
