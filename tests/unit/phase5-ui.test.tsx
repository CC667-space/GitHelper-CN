import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultUserPreferences } from '../../src/background/prefs-store';
import type { ProviderRuntimeView } from '../../src/lib/bridge-protocol';
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
    pageLabel: '等待读取当前 GitHub 页面',
    providers: [],
    sessionHistoryTruncated: false,
    sessionId: undefined,
    selectedTextProviderId: undefined,
    selectedVisionProviderId: undefined,
  });
});

describe('Phase 5 UI', () => {
  it('Panel 重开后恢复会话并提示未展开的早期历史', async () => {
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange, onSessionState) => {
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
