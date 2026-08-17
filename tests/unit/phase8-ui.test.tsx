import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PanelSearchState } from '../../src/lib/bridge-protocol';
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
    searchDraft: '',
    searchTarget: 'auto',
    searchStatus: 'idle',
    searchError: undefined,
    searchResult: undefined,
    sessionHistoryTruncated: false,
    sessionId: undefined,
    selectedTextProviderId: undefined,
    selectedVisionProviderId: undefined,
  });
});

describe('Phase 8 Panel GitHub search', () => {
  it('提交中文描述、展示查询解释与仓库结果，并经安全消息打开 GitHub 页面', async () => {
    const search = vi.fn();
    const openGitHubPage = vi.fn();
    let emitSearchState: ((state: PanelSearchState) => void) | undefined;
    const connect = vi.fn(
      (
        _onEvent,
        _onProviderState,
        onConnectionChange,
        _onSessionState,
        _onPickState,
        _onRegionState,
        onSearchState,
      ) => {
        emitSearchState = onSearchState;
        onConnectionChange(true);
        return {
          send: vi.fn(),
          abort: vi.fn(),
          search,
          openGitHubPage,
          disconnect: vi.fn(),
        };
      },
    );
    usePanelStore.setState({ selectedTextProviderId: 'deepseek' });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('tab', { name: '中文搜索' }));
    expect(screen.queryByText('不调用 AI Provider')).toBeNull();
    expect(screen.getByText('使用当前文本 Provider · 本地安全校验')).toBeTruthy();
    expect(screen.getByText(/每次搜索最多调用 1 次/)).toBeTruthy();
    await user.type(
      screen.getByLabelText('描述要搜索的仓库或 Issue'),
      'Star 超过 1000 的 Python 项目',
    );
    await user.click(screen.getByRole('button', { name: '搜索' }));
    expect(search).toHaveBeenCalledExactlyOnceWith(
      'Star 超过 1000 的 Python 项目',
      'auto',
      'deepseek',
    );

    act(() =>
      emitSearchState?.({
        status: 'done',
        requestId: 'search-1',
        result: {
          status: 'ok',
          conversion: {
            naturalLanguage: 'Star 超过 1000 的 Python 项目',
            target: 'repositories',
            query: 'language:Python stars:>1000',
            explanation: '搜索公开仓库；语言为 Python；Star >1000。',
          },
          totalCount: 20,
          notice: '已由 DeepSeek 理解中文需求，并由本地规则校验后执行；本次调用可能产生少量费用。',
          items: [
            {
              kind: 'repository',
              id: 1,
              title: 'octocat/demo',
              url: 'https://github.com/octocat/demo',
              description: 'Demo repository',
              language: 'Python',
              stars: 1_234,
              updatedAt: '2026-07-24T00:00:00.000Z',
              archived: false,
            },
          ],
        },
      }),
    );

    expect(screen.getByText('language:Python stars:>1000')).toBeTruthy();
    expect(screen.getByText(/已由 DeepSeek 理解中文需求/)).toBeTruthy();
    expect(screen.getByText('octocat/demo')).toBeTruthy();
    expect(screen.getByText(/1,234/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开' }));
    expect(openGitHubPage).toHaveBeenCalledWith('https://github.com/octocat/demo');
  });

  it('限流降级显示可读原因和 GitHub 网页搜索入口', async () => {
    const openGitHubPage = vi.fn();
    let emitSearchState: ((state: PanelSearchState) => void) | undefined;
    const connect = vi.fn(
      (
        _onEvent,
        _onProviderState,
        onConnectionChange,
        _onSessionState,
        _onPickState,
        _onRegionState,
        onSearchState,
      ) => {
        emitSearchState = onSearchState;
        onConnectionChange(true);
        return {
          send: vi.fn(),
          abort: vi.fn(),
          search: vi.fn(),
          openGitHubPage,
          disconnect: vi.fn(),
        };
      },
    );
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);
    await user.click(screen.getByRole('tab', { name: '中文搜索' }));
    act(() =>
      emitSearchState?.({
        status: 'done',
        requestId: 'search-2',
        result: {
          status: 'fallback',
          conversion: {
            naturalLanguage: '开放 bug issue',
            target: 'issues',
            query: 'is:issue is:open label:bug',
            explanation: '搜索公开 Issue；仅开放 Issue；标签为 bug。',
          },
          totalCount: 0,
          items: [],
          fallbackUrl: 'https://github.com/search?q=is%3Aissue+is%3Aopen+label%3Abug&type=issues',
          notice: 'GitHub search 匿名配额暂不可用；未重复请求 API。',
        },
      }),
    );
    expect(screen.getByText(/匿名配额暂不可用/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '在 GitHub 网页继续搜索' }));
    expect(openGitHubPage).toHaveBeenCalledOnce();
  });
});
