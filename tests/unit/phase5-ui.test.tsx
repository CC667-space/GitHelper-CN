import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultUserPreferences } from '../../src/background/prefs-store';
import type { PanelSessionState, ProviderRuntimeView } from '../../src/lib/bridge-protocol';
import type { OptionsServices } from '../../src/options/services';
import { OptionsApp } from '../../src/options/App';
import { PanelApp } from '../../src/panel/App';
import { usePanelStore } from '../../src/panel/store';

function providers(): ProviderRuntimeView[] {
  return (['deepseek', 'uuapi', 'openrouter'] as const).map((id) => ({
    id,
    label: id,
    apiHost:
      id === 'deepseek'
        ? 'https://api.deepseek.com'
        : id === 'uuapi'
          ? 'https://uuapi.net'
          : 'https://openrouter.ai',
    textModel: 'text-model',
    visionModel: id === 'deepseek' ? undefined : 'vision-model',
    intermediary: id !== 'deepseek',
    availability: 'needs_key',
    capabilities: {
      supportsStreaming: false,
      supportsVision: false,
      supportsToolCalls: false,
      supportsStructuredOutput: false,
      supportsUsage: false,
      supportsAbort: false,
      imageInputFormat: id === 'deepseek' ? 'none' : 'openai_image_url',
      toolCallStreamingFormat: 'none',
      errorResponseFormat: 'custom',
    },
  }));
}

afterEach(() => {
  cleanup();
  usePanelStore.setState({
    activeRequestId: undefined,
    connected: false,
    draft: '',
    messages: [],
    recentSessions: [],
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
    startNewSession: false,
    selectedTextProviderId: undefined,
    selectedVisionProviderId: undefined,
  });
});

describe('Phase 5 UI', () => {
  it('Panel 以四个分段导航切换功能区，问答区不再提供整体收起按钮', async () => {
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange) => {
      onConnectionChange(true);
      return {
        send: vi.fn(),
        abort: vi.fn(),
        disconnect: vi.fn(),
      };
    });
    const user = userEvent.setup();

    render(<PanelApp connect={connect} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '页面提问',
      '仓库分析',
      '中文搜索',
      '问答',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('page-question').hasAttribute('hidden')).toBe(false);
    expect(screen.getByTestId('question-answer').hasAttribute('hidden')).toBe(true);

    await user.click(screen.getByRole('tab', { name: '问答' }));

    expect(screen.getByRole('tab', { name: '问答' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('question-answer').hasAttribute('hidden')).toBe(false);
    expect(screen.getByTestId('page-question').hasAttribute('hidden')).toBe(true);
    expect(screen.getByTestId('repository-analysis').hasAttribute('hidden')).toBe(true);
    expect(screen.queryByRole('button', { name: '收起问答' })).toBeNull();
  });

  it('Panel 重开后恢复会话并提示未展开的早期历史', async () => {
    let emitSessionState: ((state: PanelSessionState) => void) | undefined;
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange, onSessionState) => {
      emitSessionState = onSessionState;
      onConnectionChange(true);
      onSessionState({
        sessionId: 'session-restored',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: '此前的问题',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
          {
            id: 'message-2',
            role: 'assistant',
            content: '此前的回答',
            createdAt: '2026-07-24T00:00:01.000Z',
          },
        ],
        truncated: true,
      });
      return {
        send: vi.fn(),
        abort: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    render(<PanelApp connect={connect} />);

    expect(await screen.findByText('此前的问题')).toBeTruthy();
    expect(screen.getByText('此前的回答')).toBeTruthy();
    expect(screen.getByText(/较早消息已摘要/)).toBeTruthy();

    act(() => {
      emitSessionState?.({
        messages: [],
        truncated: false,
      });
    });
    expect(screen.getByText('此前的问题')).toBeTruthy();
    expect(screen.getByText('此前的回答')).toBeTruthy();

    act(() => {
      emitSessionState?.({
        sessionId: 'session-from-new-page',
        cause: 'hydrate',
        messages: [
          {
            id: 'message-other',
            role: 'assistant',
            content: '其他页面自动匹配的会话',
            createdAt: '2026-07-24T00:00:02.000Z',
          },
        ],
        truncated: false,
      });
    });
    expect(screen.getByText('此前的问题')).toBeTruthy();
    expect(screen.queryByText('其他页面自动匹配的会话')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '问答' }));
    const qaPanel = screen.getByRole('tabpanel', { name: '问答' });
    expect(screen.getByTestId('conversation')).toBeTruthy();
    expect(screen.getByLabelText('输入问题')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '收起问答' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: '页面提问' }));
    expect(qaPanel.hidden).toBe(true);
    await user.click(screen.getByRole('tab', { name: '问答' }));
    expect(qaPanel.hidden).toBe(false);
    expect(screen.getByText('此前的问题')).toBeTruthy();
  });

  it('Panel 可选择最近会话并显式新建隔离会话', async () => {
    const selectSession = vi.fn();
    const newSession = vi.fn();
    const send = vi.fn();
    let emitSessionState: ((state: PanelSessionState) => void) | undefined;
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange, onSessionState) => {
      emitSessionState = onSessionState;
      onConnectionChange(true);
      onSessionState({
        sessionId: 'session-1',
        cause: 'hydrate',
        recentSessions: [
          {
            sessionId: 'session-1',
            title: '第一个主题',
            repository: 'openai/openai-node',
            updatedAt: '2026-07-24T00:00:02.000Z',
            messageCount: 2,
          },
          {
            sessionId: 'session-2',
            title: '第二个主题',
            repository: 'microsoft/vscode',
            updatedAt: '2026-07-24T00:00:01.000Z',
            messageCount: 2,
          },
        ],
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            content: '第一个会话',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
        ],
        truncated: false,
      });
      return {
        send,
        abort: vi.fn(),
        selectSession,
        newSession,
        disconnect: vi.fn(),
      };
    });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('tab', { name: '问答' }));
    expect(await screen.findByRole('option', { name: /第一个主题/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /第二个主题/ })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('当前会话'), 'session-2');
    expect(selectSession).toHaveBeenCalledWith('session-2');

    act(() => {
      emitSessionState?.({
        sessionId: 'session-2',
        cause: 'select',
        messages: [
          {
            id: 'message-2',
            role: 'assistant',
            content: '第二个会话',
            createdAt: '2026-07-24T00:00:01.000Z',
          },
        ],
        truncated: false,
      });
    });
    expect(screen.getByText('第二个会话')).toBeTruthy();
    await user.type(screen.getByLabelText('输入问题'), '继续第二个主题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(send).toHaveBeenLastCalledWith(
      '继续第二个主题',
      undefined,
      undefined,
      undefined,
      'session-2',
      false,
    );

    await user.click(screen.getByRole('button', { name: '新建会话' }));
    expect(newSession).toHaveBeenCalledOnce();
    expect(screen.queryByText('第二个会话')).toBeNull();
    expect(screen.getByText(/开始询问当前 GitHub 页面/)).toBeTruthy();
    await user.type(screen.getByLabelText('输入问题'), '独立的新主题');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(send).toHaveBeenLastCalledWith(
      '独立的新主题',
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );
  });

  it('每轮问答可独立收展，并经二次确认删除该轮', async () => {
    const deleteTurn = vi.fn();
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange, onSessionState) => {
      onConnectionChange(true);
      onSessionState({
        sessionId: 'session-1',
        cause: 'hydrate',
        messages: [
          {
            id: 'question-1',
            role: 'user',
            content: '第一个问题',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
          {
            id: 'answer-1',
            role: 'assistant',
            content: '第一个回答',
            createdAt: '2026-07-24T00:00:01.000Z',
          },
          {
            id: 'question-2',
            role: 'user',
            content: '第二个问题',
            createdAt: '2026-07-24T00:00:02.000Z',
          },
          {
            id: 'answer-2',
            role: 'assistant',
            content: '第二个回答',
            createdAt: '2026-07-24T00:00:03.000Z',
          },
        ],
        truncated: false,
      });
      return {
        send: vi.fn(),
        abort: vi.fn(),
        deleteTurn,
        disconnect: vi.fn(),
      };
    });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('tab', { name: '问答' }));
    const questionBubble = screen.getByText('第一个问题').closest('article');
    expect(questionBubble?.className).toContain('bg-[#c7d0d9]');
    expect(questionBubble?.className).toContain('text-[#172238]');
    expect(screen.getByTestId('session-controls').className).toContain('mb-2.5');

    await user.click(screen.getByRole('button', { name: '收起问答：第一个问题' }));
    expect(screen.queryByText('第一个回答')).toBeNull();
    expect(screen.getByText('第二个回答')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '展开问答：第一个问题' }));
    expect(screen.getByText('第一个回答')).toBeTruthy();

    const turnActions = screen.getAllByTestId('turn-actions').at(0);
    expect(turnActions).toBeTruthy();
    if (!turnActions) {
      throw new Error('未找到问答操作栏');
    }
    expect(turnActions.className).not.toContain('absolute');
    const deleteTurnButton = screen.getByRole('button', { name: '删除问答：第一个问题' });
    expect(deleteTurnButton.querySelector('[data-icon="trash"]')).toBeTruthy();
    await user.click(deleteTurnButton);
    expect(deleteTurn).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('button', { name: '确认删除问答：第一个问题' })
        .querySelector('[data-icon="check"]'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: '取消删除问答：第一个问题' })
        .querySelector('[data-icon="close"]'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消删除问答：第一个问题' }));
    expect(screen.queryByRole('button', { name: '确认删除问答：第一个问题' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '删除问答：第一个问题' }));
    await user.click(screen.getByRole('button', { name: '确认删除问答：第一个问题' }));
    expect(deleteTurn).toHaveBeenCalledWith('session-1', 'question-1');
  });

  it('会话管理列表通过勾叉二次确认删除整个 session', async () => {
    const deleteSession = vi.fn();
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange, onSessionState) => {
      onConnectionChange(true);
      onSessionState({
        sessionId: 'session-1',
        cause: 'hydrate',
        recentSessions: [
          {
            sessionId: 'session-1',
            title: '第一个主题',
            repository: 'openai/openai-node',
            updatedAt: '2026-07-24T00:00:02.000Z',
            messageCount: 2,
          },
          {
            sessionId: 'session-2',
            title: '第二个主题',
            repository: 'microsoft/vscode',
            updatedAt: '2026-07-24T00:00:01.000Z',
            messageCount: 2,
          },
        ],
        messages: [],
        truncated: false,
      });
      return {
        send: vi.fn(),
        abort: vi.fn(),
        deleteSession,
        disconnect: vi.fn(),
      };
    });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('tab', { name: '问答' }));
    await user.click(screen.getByText('管理会话（2）'));
    const deleteSessionButton = screen.getByRole('button', { name: '删除会话：第一个主题' });
    expect(deleteSessionButton.querySelector('[data-icon="trash"]')).toBeTruthy();
    await user.click(deleteSessionButton);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('button', { name: '确认删除会话：第一个主题' })
        .querySelector('[data-icon="check"]'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: '取消删除会话：第一个主题' })
        .querySelector('[data-icon="close"]'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消删除会话：第一个主题' }));
    expect(screen.queryByRole('button', { name: '确认删除会话：第一个主题' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '删除会话：第一个主题' }));
    await user.click(screen.getByRole('button', { name: '确认删除会话：第一个主题' }));
    expect(deleteSession).toHaveBeenCalledWith('session-1');
  });

  it('Options 保存收紧偏好，并以独立入口执行两类批量清除', async () => {
    const savePreferences = vi.fn(async (value) => value);
    const clearSessionsAndPreferences = vi.fn();
    const clearAllLocalData = vi.fn();
    const services: OptionsServices = {
      loadProviders: vi.fn(async () => providers()),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      importProviderSettings: vi.fn(),
      exportProviderSettings: vi.fn(async () => '{"schemaVersion":1,"providers":{}}'),
      runProbes: vi.fn(),
      loadPreferences: vi.fn(async () => defaultUserPreferences()),
      savePreferences,
      getStorageUsage: vi.fn(async () => ({
        bytes: 512 * 1024,
        softLimitBytes: 6 * 1024 * 1024,
        hardLimitBytes: 9 * 1024 * 1024,
      })),
      clearSessionsAndPreferences,
      clearAllLocalData,
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    expect(await screen.findByText(/当前占用：0.50 MB/)).toBeTruthy();
    const downloads = screen.getByLabelText('下载') as HTMLSelectElement;
    expect(Array.from(downloads.options).map((option) => option.value)).toEqual([
      'confirm',
      'deny',
    ]);
    await user.selectOptions(screen.getByLabelText('技术水平'), 'advanced');
    await user.selectOptions(downloads, 'deny');
    await user.click(screen.getByRole('button', { name: '保存偏好' }));
    await waitFor(() =>
      expect(savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          technicalLevel: 'advanced',
          operationPolicy: expect.objectContaining({
            downloads: 'deny',
            accountChanges: 'deny',
          }),
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: '清除会话与偏好' }));
    await waitFor(() => expect(clearSessionsAndPreferences).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: '清除全部本地数据' }));
    expect(clearAllLocalData).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认清除全部' }));
    await waitFor(() => expect(clearAllLocalData).toHaveBeenCalledOnce());
  });
});
