import React, { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ProviderRuntimeView,
  ProviderState,
  StreamEvent,
} from '../../src/lib/bridge-protocol';
import { OptionsApp } from '../../src/options/App';
import type { OptionsServices } from '../../src/options/services';
import { defaultUserPreferences } from '../../src/background/prefs-store';
import { PanelApp } from '../../src/panel/App';
import { usePanelStore } from '../../src/panel/store';

function provider(
  id: ProviderRuntimeView['id'],
  availability: ProviderRuntimeView['availability'],
  options: Partial<ProviderRuntimeView> = {},
): ProviderRuntimeView {
  return {
    id,
    label: id === 'deepseek' ? 'DeepSeek' : id === 'uuapi' ? 'UUAPI' : 'OpenRouter',
    apiHost:
      id === 'deepseek'
        ? 'https://api.deepseek.com'
        : id === 'uuapi'
          ? 'https://uuapi.net'
          : 'https://openrouter.ai',
    textModel: id === 'deepseek' ? 'deepseek-v4-flash' : 'account-model',
    visionModel: id === 'deepseek' ? undefined : 'account-vision-model',
    intermediary: id !== 'deepseek',
    availability,
    capabilities: {
      supportsStreaming: availability === 'available',
      supportsVision: id !== 'deepseek' && availability === 'available',
      supportsToolCalls: false,
      supportsStructuredOutput: false,
      supportsUsage: false,
      supportsAbort: availability === 'available',
      imageInputFormat: id === 'deepseek' ? 'none' : 'openai_image_url',
      toolCallStreamingFormat: 'none',
      errorResponseFormat: 'custom',
    },
    ...options,
  };
}

const phase5ServiceDefaults = {
  loadPreferences: vi.fn(async () => defaultUserPreferences()),
  savePreferences: vi.fn(async (preferences) => preferences),
  getStorageUsage: vi.fn(async () => ({
    bytes: 0,
    softLimitBytes: 6 * 1024 * 1024,
    hardLimitBytes: 9 * 1024 * 1024,
  })),
  clearSessionsAndPreferences: vi.fn(),
  clearAllLocalData: vi.fn(),
} satisfies Pick<
  OptionsServices,
  | 'loadPreferences'
  | 'savePreferences'
  | 'getStorageUsage'
  | 'clearSessionsAndPreferences'
  | 'clearAllLocalData'
>;

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
    sessionHistoryTruncated: false,
    sessionId: undefined,
    selectedTextProviderId: undefined,
    selectedVisionProviderId: undefined,
  });
});

describe('Phase 4 trusted UI', () => {
  it('Options 保存后立即清空明文，重读只展示掩码', async () => {
    let saved = false;
    const saveKey = vi.fn(async () => {
      saved = true;
    });
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', saved ? 'pending_probe' : 'needs_key', {
          keyMask: saved ? '••••7890' : undefined,
        }),
        provider('uuapi', 'needs_key'),
        provider('openrouter', 'needs_key'),
      ]),
      saveKey,
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    const user = userEvent.setup();
    const firstRender = render(<OptionsApp services={services} />);
    const input = (await screen.findByLabelText('DeepSeek API Key')) as HTMLInputElement;
    const secret = 'sk-test-secret-1234567890';
    await user.type(input, secret);
    const card = input.closest('article');
    expect(card).not.toBeNull();
    await user.click(within(card!).getByRole('button', { name: '保存 Key' }));

    await waitFor(() => expect(input.value).toBe(''));
    expect(saveKey).toHaveBeenCalledWith('deepseek', secret);
    expect(document.body.textContent).not.toContain(secret);
    expect(await screen.findByText('已存：••••7890')).toBeTruthy();

    firstRender.unmount();
    render(<OptionsApp services={services} />);
    const reopened = (await screen.findByLabelText('DeepSeek API Key')) as HTMLInputElement;
    expect(reopened.value).toBe('');
    expect(document.body.textContent).not.toContain(secret);
    expect(await screen.findByText('已存：••••7890')).toBeTruthy();
  });

  it('Options 点击真实探针后在按钮区域立即显示运行状态并阻止重复提交', async () => {
    let finishProbe: (() => void) | undefined;
    const runProbes = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          finishProbe = resolve;
        }),
    );
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'pending_probe', { keyMask: '••••7890' }),
        provider('uuapi', 'needs_key'),
        provider('openrouter', 'needs_key'),
      ]),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes,
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    const button = await screen.findByRole('button', { name: '运行真实能力探针' });
    const probeCard = button.closest('div');
    expect(probeCard).not.toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);

    await user.click(button);

    expect(runProbes).toHaveBeenCalledTimes(1);
    expect(
      within(probeCard!).getByText('正在复测全部已配置 Provider；会消耗少量 Provider 额度…'),
    ).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toContain('探针运行中');

    finishProbe?.();
    await waitFor(() =>
      expect(within(probeCard!).getByText('全部已配置 Provider的能力探针已完成')).toBeTruthy(),
    );
  });

  it('Options 可只复测单个 Provider，避免调用其他已配置端点', async () => {
    const runProbes = vi.fn(async () => undefined);
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'disabled', {
          disabledReason: '文本探针失败',
          keyMask: '••••7890',
        }),
        provider('uuapi', 'available', { keyMask: '••••2345' }),
        provider('openrouter', 'available', { keyMask: '••••4321' }),
      ]),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes,
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    const deepseekHeading = await screen.findByRole('heading', { name: 'DeepSeek' });
    const deepseekCard = deepseekHeading.closest('article');
    expect(deepseekCard).not.toBeNull();
    await user.click(within(deepseekCard!).getByRole('button', { name: '仅复测 DeepSeek' }));

    await waitFor(() => expect(runProbes).toHaveBeenCalledWith('deepseek'));
  });

  it('Options 在 Provider 卡片展示文本/视觉验证结果与失败原因', async () => {
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'disabled', {
          disabledReason: '401 Unauthorized',
          keyMask: '••••7890',
          visionFailureReason: '模型 text-only 不接受图像输入',
        }),
        provider('uuapi', 'pending_probe'),
        provider('openrouter', 'available', { keyMask: '••••4321' }),
      ]),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    render(<OptionsApp services={services} />);

    const deepseekHeading = await screen.findByRole('heading', { name: 'DeepSeek' });
    const deepseekCard = deepseekHeading.closest('article');
    expect(deepseekCard).not.toBeNull();
    expect(within(deepseekCard!).getByText('文本：未验证/不可用')).toBeTruthy();
    expect(within(deepseekCard!).getByText('视觉：未验证/不支持')).toBeTruthy();
    expect(within(deepseekCard!).getByText('失败原因：401 Unauthorized')).toBeTruthy();
    expect(
      within(deepseekCard!).getByText('视觉失败原因：模型 text-only 不接受图像输入'),
    ).toBeTruthy();

    const openrouterHeading = screen.getByRole('heading', { name: 'OpenRouter' });
    const openrouterCard = openrouterHeading.closest('article');
    expect(openrouterCard).not.toBeNull();
    expect(within(openrouterCard!).getByText('文本：已验证')).toBeTruthy();
    expect(within(openrouterCard!).getByText('视觉：已验证')).toBeTruthy();
  });

  it('Panel 分列展示文本/视觉 Provider，并禁用未探针项', async () => {
    const state: ProviderState = {
      providers: [
        provider('deepseek', 'available'),
        provider('uuapi', 'pending_probe'),
        provider('openrouter', 'disabled'),
      ],
    };
    const connect = vi.fn((onEvent, onProviderState, onConnectionChange) => {
      onProviderState(state);
      onConnectionChange(true);
      return {
        send: vi.fn(),
        abort: vi.fn(),
        disconnect: vi.fn(),
      };
    });
    render(<PanelApp connect={connect} />);

    expect(await screen.findByLabelText('文本 Provider')).toBeTruthy();
    expect(screen.getByLabelText('视觉 Provider')).toBeTruthy();
    const pendingOptions = screen.getAllByRole('option', { name: /UUAPI/ });
    expect(pendingOptions.every((option) => (option as HTMLOptionElement).disabled)).toBe(true);
    expect(JSON.stringify(usePanelStore.getState())).not.toMatch(/apiKey|secret/i);
  });

  it('Panel 在 React StrictMode 重挂载时忽略旧连接的延迟断开事件', async () => {
    let connectionSequence = 0;
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange) => {
      connectionSequence += 1;
      const ownSequence = connectionSequence;
      onConnectionChange(true);
      return {
        send: vi.fn(),
        abort: vi.fn(),
        disconnect: vi.fn(() => {
          if (ownSequence === 1) {
            queueMicrotask(() => onConnectionChange(false));
          }
        }),
      };
    });
    const user = userEvent.setup();
    render(
      <StrictMode>
        <PanelApp connect={connect} />
      </StrictMode>,
    );

    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    await user.type(screen.getByLabelText('输入问题'), '请说明当前页面');

    expect(screen.getByTitle('Background 已连接')).toBeTruthy();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('Panel 用 Enter 发送、Shift+Enter 换行', async () => {
    const send = vi.fn();
    const connect = vi.fn((_onEvent, _onProviderState, onConnectionChange) => {
      onConnectionChange(true);
      return {
        send,
        abort: vi.fn(),
        disconnect: vi.fn(),
      };
    });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);
    const textarea = screen.getByLabelText('输入问题') as HTMLTextAreaElement;

    await user.type(textarea, '第一行');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, '第二行');
    expect(send).not.toHaveBeenCalled();
    expect(textarea.value).toBe('第一行\n第二行');

    await user.keyboard('{Enter}');
    expect(send).toHaveBeenCalledExactlyOnceWith('第一行\n第二行', undefined);
  });

  it('Panel 将助手 Markdown 渲染为可读结构且阻止 HTML、图片与可点击外链', async () => {
    let emitEvent: ((event: StreamEvent) => void) | undefined;
    const connect = vi.fn((onEvent, _onProviderState, onConnectionChange) => {
      emitEvent = onEvent;
      onConnectionChange(true);
      return {
        send: vi.fn(),
        abort: vi.fn(),
        disconnect: vi.fn(),
      };
    });
    render(<PanelApp connect={connect} />);

    act(() => {
      emitEvent?.({ requestId: 'markdown-1', kind: 'start' });
      emitEvent?.({
        requestId: 'markdown-1',
        kind: 'delta',
        text: [
          '## 页面摘要',
          '',
          '1. **Explore**：发现项目',
          '2. `Topics`：按主题浏览',
          '',
          '<script>alert("xss")</script>',
          '![跟踪图片](https://example.com/pixel.png)',
          '[外部链接](https://example.com/)',
        ].join('\n'),
      });
      emitEvent?.({ requestId: 'markdown-1', kind: 'done' });
    });

    const conversation = screen.getByTestId('conversation');
    expect(within(conversation).getByRole('heading', { name: '页面摘要' })).toBeTruthy();
    expect(within(conversation).getByText('Explore').tagName).toBe('STRONG');
    expect(within(conversation).getAllByRole('listitem')).toHaveLength(2);
    expect(conversation.querySelector('script')).toBeNull();
    expect(conversation.querySelector('img')).toBeNull();
    expect(conversation.querySelector('a')).toBeNull();
  });
});
