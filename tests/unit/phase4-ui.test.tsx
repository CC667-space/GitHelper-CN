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
  importProviderSettings: vi.fn(),
  exportProviderSettings: vi.fn(async () => '{"schemaVersion":1,"providers":{}}'),
} satisfies Pick<
  OptionsServices,
  | 'loadPreferences'
  | 'savePreferences'
  | 'getStorageUsage'
  | 'clearSessionsAndPreferences'
  | 'clearAllLocalData'
  | 'importProviderSettings'
  | 'exportProviderSettings'
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
    regionStatus: 'idle',
    regionStatusMessage: undefined,
    selectedRegion: undefined,
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
    const textCard = await screen.findByTestId('text-model-card');
    const input = within(textCard).getByLabelText('DeepSeek API Key') as HTMLInputElement;
    const secret = 'sk-test-secret-1234567890';
    await user.type(input, secret);
    await user.click(within(textCard).getByRole('button', { name: '保存 Key' }));

    await waitFor(() => expect(input.value).toBe(''));
    expect(saveKey).toHaveBeenCalledWith('deepseek', secret);
    expect(document.body.textContent).not.toContain(secret);
    expect(await within(textCard).findByText('已存：••••7890')).toBeTruthy();

    firstRender.unmount();
    render(<OptionsApp services={services} />);
    const reopenedCard = await screen.findByTestId('text-model-card');
    const reopened = within(reopenedCard).getByLabelText('DeepSeek API Key') as HTMLInputElement;
    expect(reopened.value).toBe('');
    expect(document.body.textContent).not.toContain(secret);
    expect(await within(reopenedCard).findByText('已存：••••7890')).toBeTruthy();
  });

  it('Options 仅用文本与视觉两张配置卡组织内置 Provider', async () => {
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'needs_key'),
        provider('uuapi', 'needs_key'),
        provider('openrouter', 'needs_key'),
      ]),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    render(<OptionsApp services={services} />);

    const providerSection = await screen.findByTestId('provider-model-settings');
    expect(within(providerSection).getAllByRole('article')).toHaveLength(2);
    expect(within(providerSection).getByRole('heading', { name: '文本 Model' })).toBeTruthy();
    expect(within(providerSection).getByRole('heading', { name: '视觉 Model' })).toBeTruthy();

    const textProvider = within(providerSection).getByLabelText('文本 Provider');
    const visionProvider = within(providerSection).getByLabelText('视觉 Provider');
    expect(within(textProvider).getAllByRole('option')).toHaveLength(11);
    expect(within(visionProvider).getAllByRole('option')).toHaveLength(10);
    expect(within(visionProvider).queryByRole('option', { name: 'DeepSeek' })).toBeNull();
    expect(
      within(textProvider).getByRole('option', { name: 'ChatGPT（OpenAI API）' }),
    ).toBeTruthy();
    expect(
      within(textProvider).getByRole('option', { name: 'Claude（Anthropic API）' }),
    ).toBeTruthy();
    expect(within(textProvider).getByRole('option', { name: /自定 Provider/ })).toBeTruthy();
    expect(within(textProvider).getByRole('option', { name: /GLM/ })).toBeTruthy();
    expect(within(textProvider).getByRole('option', { name: /Kimi/ })).toBeTruthy();
    expect(within(textProvider).getByRole('option', { name: /Grok/ })).toBeTruthy();
    expect(within(textProvider).queryByRole('option', { name: /UUAPI/ })).toBeNull();
  });

  it('Options 按所选 Provider 提供模型预设和手填 Model ID', async () => {
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'needs_key'),
        provider('uuapi', 'needs_key'),
        provider('openrouter', 'needs_key'),
      ]),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    const textCard = await screen.findByTestId('text-model-card');
    await user.selectOptions(within(textCard).getByLabelText('文本 Provider'), 'openai');
    expect(within(textCard).getByText('https://api.openai.com/v1/chat/completions')).toBeTruthy();
    expect(within(textCard).getByLabelText('ChatGPT（OpenAI API） API Key')).toBeTruthy();

    const modelSelector = within(textCard).getByLabelText('文本 Model 候选');
    expect(within(modelSelector).getByRole('option', { name: 'gpt-6-astra' })).toBeTruthy();
    expect(within(modelSelector).getByRole('option', { name: 'gpt-5.6-terra' })).toBeTruthy();
    expect(within(modelSelector).getByRole('option', { name: 'gpt-5.6-luna' })).toBeTruthy();
    await user.selectOptions(modelSelector, '__custom__');
    const customModel = within(textCard).getByLabelText('自行填写文本 Model ID');
    await user.type(customModel, 'account/custom-model');
    await user.click(within(textCard).getByRole('button', { name: '保存模型配置' }));
    await waitFor(() =>
      expect(services.saveModels).toHaveBeenCalledWith(
        'openai',
        expect.objectContaining({ textModel: 'account/custom-model' }),
      ),
    );
  });

  it('Options 为 custom 分离保存 URL/model 与 Key，并展示安全提示', async () => {
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'needs_key'),
        provider('openrouter', 'needs_key'),
        provider('custom', 'needs_key', {
          label: '自定 Provider（OpenAI-compatible）',
          apiHost: '',
          baseUrl: undefined,
          textModel: '',
          visionModel: '',
          intermediary: true,
        }),
      ]),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    const textCard = await screen.findByTestId('text-model-card');
    await user.selectOptions(within(textCard).getByLabelText('文本 Provider'), 'custom');
    await user.type(
      within(textCard).getByRole('textbox', { name: /API Base URL 或 Chat Completions URL/ }),
      'https://gateway.example.com/v1',
    );
    await user.type(within(textCard).getByLabelText('自行填写文本 Model ID'), 'account-model');
    await user.click(within(textCard).getByRole('button', { name: '保存模型配置' }));

    await waitFor(() =>
      expect(services.saveModels).toHaveBeenCalledWith('custom', {
        baseUrl: 'https://gateway.example.com/v1',
        textModel: 'account-model',
        visionModel: undefined,
      }),
    );
    expect(within(textCard).getByText(/仅允许公网 HTTPS/)).toBeTruthy();
    expect(
      (within(textCard).getByLabelText(/自定 Provider.*API Key/) as HTMLInputElement).type,
    ).toBe('password');
  });

  it('Options 只用已保存的 custom URL 发起 Key 权限请求', async () => {
    const saveKey = vi.fn(async () => undefined);
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      loadProviders: vi.fn(async () => [
        provider('deepseek', 'needs_key'),
        provider('openrouter', 'needs_key'),
        provider('custom', 'needs_key', {
          label: '自定 Provider（OpenAI-compatible）',
          apiHost: 'https://gateway.example.com',
          baseUrl: 'https://gateway.example.com/v1',
          textModel: 'account-model',
          visionModel: '',
          intermediary: true,
        }),
      ]),
      saveKey,
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    const textCard = await screen.findByTestId('text-model-card');
    await user.selectOptions(within(textCard).getByLabelText('文本 Provider'), 'custom');
    await user.type(within(textCard).getByLabelText(/自定 Provider.*API Key/), 'sk-custom-test');
    const saveButton = within(textCard).getByRole('button', { name: '保存 Key' });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(saveButton);

    await waitFor(() =>
      expect(saveKey).toHaveBeenCalledWith(
        'custom',
        'sk-custom-test',
        'https://gateway.example.com/v1',
      ),
    );
  });

  it('Options 提供不含 Key 和自定义端点的 Provider JSON 导入导出入口', async () => {
    const exported = '{"schemaVersion":1,"providers":{"openai":{"textModel":"gpt-5-mini"}}}';
    const importProviderSettings = vi.fn(async () => undefined);
    const services: OptionsServices = {
      ...phase5ServiceDefaults,
      importProviderSettings,
      exportProviderSettings: vi.fn(async () => exported),
      loadProviders: vi.fn(async () => []),
      saveKey: vi.fn(),
      deleteKey: vi.fn(),
      saveModels: vi.fn(),
      runProbes: vi.fn(),
    };
    const user = userEvent.setup();
    render(<OptionsApp services={services} />);

    expect(await screen.findByRole('heading', { name: '高级 Model 配置 JSON' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '导出配置 JSON' }));
    const textarea = screen.getByLabelText('Provider 设置 JSON') as HTMLTextAreaElement;
    expect(textarea.value).toBe(exported);

    await user.click(screen.getByRole('button', { name: '导入配置 JSON' }));
    await waitFor(() => expect(importProviderSettings).toHaveBeenCalledWith(exported));
    expect(document.body.textContent).toMatch(/JSON 不得包含 API Key、token 或 Authorization/);
  });

  it('Release 设置页移除开发专用区，但保留单 Provider 测试入口', async () => {
    const runProbes = vi.fn(async () => undefined);
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

    const textCard = await screen.findByTestId('text-model-card');
    expect(screen.queryByRole('heading', { name: '真实能力探针' })).toBeNull();
    expect(screen.queryByRole('heading', { name: '本地技术验证' })).toBeNull();
    expect(screen.queryByRole('button', { name: '运行真实能力探针' })).toBeNull();

    await user.click(within(textCard).getByRole('button', { name: '测试 Key 与模型' }));
    await waitFor(() => expect(runProbes).toHaveBeenCalledExactlyOnceWith('deepseek'));
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

    const deepseekCard = await screen.findByTestId('text-model-card');
    await user.click(within(deepseekCard).getByRole('button', { name: '测试 Key 与模型' }));

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

    const deepseekCard = await screen.findByTestId('text-model-card');
    expect(within(deepseekCard).getByText('文本：未验证/不可用')).toBeTruthy();
    expect(within(deepseekCard).getByText('视觉：未验证/不支持')).toBeTruthy();
    expect(within(deepseekCard).getByText('失败原因：401 Unauthorized')).toBeTruthy();
    expect(
      within(deepseekCard).getByText('视觉失败原因：模型 text-only 不接受图像输入'),
    ).toBeTruthy();

    const openrouterCard = screen.getByTestId('vision-model-card');
    expect(within(openrouterCard).getByText('文本：已验证')).toBeTruthy();
    expect(within(openrouterCard).getByText('视觉：已验证')).toBeTruthy();
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
    expect(screen.queryByRole('option', { name: /UUAPI/ })).toBeNull();
    expect(screen.getAllByRole('option', { name: /OpenRouter/ })).toHaveLength(2);
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
    await user.click(screen.getByRole('tab', { name: '问答' }));
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
    const user = userEvent.setup();
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
          '```text',
          'AI stars:>5000',
          '```',
          '',
          '```',
          'AI',
          '```',
          '',
          '<script>alert("xss")</script>',
          '![跟踪图片](https://example.com/pixel.png)',
          '[外部链接](https://example.com/)',
        ].join('\n'),
      });
      emitEvent?.({ requestId: 'markdown-1', kind: 'done' });
    });

    await user.click(screen.getByRole('tab', { name: '问答' }));
    const conversation = screen.getByTestId('conversation');
    expect(within(conversation).getByRole('heading', { name: '页面摘要' })).toBeTruthy();
    expect(within(conversation).getByText('Explore').tagName).toBe('STRONG');
    expect(within(conversation).getAllByRole('listitem')).toHaveLength(2);
    const codeBlock = within(conversation).getByText('AI stars:>5000');
    expect(codeBlock.tagName).toBe('CODE');
    const codeBlockContainer = codeBlock.closest('pre');
    expect(codeBlockContainer).not.toBeNull();
    expect(codeBlockContainer?.className).toContain('bg-[#c7d0d9]');
    expect(codeBlockContainer?.className).toContain('text-[#172238]');
    expect(codeBlock.className).toContain('bg-transparent');
    expect(codeBlock.className).toContain('text-inherit');
    expect(codeBlock.className).not.toContain('bg-slate-100');
    const plainCodeBlock = within(conversation).getByText('AI', { exact: true });
    expect(plainCodeBlock.closest('pre')).not.toBeNull();
    expect(plainCodeBlock.className).toContain('bg-transparent');
    expect(plainCodeBlock.className).not.toContain('bg-slate-100');
    expect(conversation.querySelector('script')).toBeNull();
    expect(conversation.querySelector('img')).toBeNull();
    expect(conversation.querySelector('a')).toBeNull();
  });
});
