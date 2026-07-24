import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProviderRuntimeView, ProviderState } from '../../src/lib/bridge-protocol';
import { OptionsApp } from '../../src/options/App';
import type { OptionsServices } from '../../src/options/services';
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

afterEach(() => {
  cleanup();
  usePanelStore.setState({
    activeRequestId: undefined,
    connected: false,
    draft: '',
    messages: [],
    pageLabel: '等待读取当前 GitHub 页面',
    providers: [],
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
});
