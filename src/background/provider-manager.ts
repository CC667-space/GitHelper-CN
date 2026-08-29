import type { ProviderCapabilities, ProviderId } from '../lib/types';
import type { Provider, ProviderChatRequest, ProviderStreamChunk } from './providers/base';

export interface CapabilityProbeSummary {
  providerId: ProviderId;
  text: boolean;
  streaming: boolean;
  abort: boolean;
  vision: boolean;
  toolCalls: boolean;
  structuredOutput: boolean;
  usage: boolean;
  errorFormat: boolean;
  rateLimitFormat: boolean;
  probedAt: string;
  failureReason?: string;
  visionFailureReason?: string;
}

export interface ProviderRuntimeState {
  disabled: boolean;
  disabledReason?: string;
  probe?: CapabilityProbeSummary;
}

export class ProviderSelectionError extends Error {
  constructor(
    readonly code:
      'PROVIDER_DISABLED' | 'TEXT_UNVERIFIED' | 'VISION_UNSUPPORTED' | 'MODEL_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderSelectionError';
  }
}

export interface ResolveProviderOptions {
  needsVision: boolean;
  manualOverrideId?: ProviderId;
}

export class ProviderManager {
  private readonly states = new Map<ProviderId, ProviderRuntimeState>();
  private manualOverrideId?: ProviderId;

  constructor(
    private readonly providers: Map<ProviderId, Provider>,
    private readonly defaults: { text: ProviderId; vision: ProviderId; fallback: ProviderId } = {
      text: 'deepseek',
      vision: 'openrouter',
      fallback: 'openrouter',
    },
  ) {
    for (const providerId of providers.keys()) {
      this.states.set(providerId, { disabled: false });
    }
  }

  setManualOverride(providerId?: ProviderId): void {
    if (providerId && !this.providers.has(providerId)) {
      throw new Error(`未知 Provider：${providerId}`);
    }
    this.manualOverrideId = providerId;
  }

  setProbeResult(result: CapabilityProbeSummary): void {
    const state = this.requireState(result.providerId);
    state.probe = result;
    state.disabled = !result.text;
    state.disabledReason = result.text ? undefined : (result.failureReason ?? '文本能力探针失败');
  }

  disable(providerId: ProviderId, reason: string): void {
    const state = this.requireState(providerId);
    state.disabled = true;
    state.disabledReason = reason;
  }

  clearProbe(providerId: ProviderId): void {
    const state = this.requireState(providerId);
    state.probe = undefined;
    state.disabled = false;
    state.disabledReason = undefined;
  }

  clearAllProbes(): void {
    for (const providerId of this.providers.keys()) {
      this.clearProbe(providerId);
    }
  }

  reset(): void {
    this.manualOverrideId = undefined;
    for (const providerId of this.providers.keys()) {
      this.states.set(providerId, { disabled: false });
    }
  }

  resolve(options: ResolveProviderOptions): Provider {
    const selectedId =
      options.manualOverrideId ??
      this.manualOverrideId ??
      (options.needsVision ? this.defaults.vision : this.defaults.text);
    const provider = this.providers.get(selectedId);
    if (!provider) {
      throw new Error(`Provider ${selectedId} 未注册`);
    }
    const state = this.requireState(selectedId);
    if (state.disabled) {
      throw new ProviderSelectionError(
        'PROVIDER_DISABLED',
        `${provider.label} 当前不可用：${state.disabledReason ?? '已禁用'}`,
      );
    }
    if (!state.probe?.text) {
      throw new ProviderSelectionError(
        'TEXT_UNVERIFIED',
        `${provider.label} 尚未完成真实文本能力探针`,
      );
    }
    if (options.needsVision && !state.probe.vision) {
      throw new ProviderSelectionError(
        'VISION_UNSUPPORTED',
        `${provider.label} 未通过图像输入探针，请切换到已验证的视觉 Provider`,
      );
    }
    return provider;
  }

  abort(requestId: string): boolean {
    return [...this.providers.values()].some((provider) => provider.abort(requestId));
  }

  state(providerId: ProviderId): Readonly<ProviderRuntimeState> {
    return { ...this.requireState(providerId) };
  }

  capabilities(providerId: ProviderId): ProviderCapabilities {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} 未注册`);
    }
    const probe = this.requireState(providerId).probe;
    return {
      ...provider.capabilities,
      supportsStreaming: probe?.streaming ?? false,
      supportsVision: probe?.vision ?? false,
      supportsToolCalls: probe?.toolCalls ?? false,
      supportsStructuredOutput: probe?.structuredOutput ?? false,
      supportsUsage: probe?.usage ?? false,
      supportsAbort: probe?.abort ?? false,
      probedAt: probe?.probedAt,
    };
  }

  stream(
    request: ProviderChatRequest,
    options: ResolveProviderOptions,
    signal?: AbortSignal,
  ): { provider: Provider; chunks: AsyncIterable<ProviderStreamChunk> } {
    const provider = this.resolve(options);
    return {
      provider,
      chunks: provider.chatStream(request, signal),
    };
  }

  private requireState(providerId: ProviderId): ProviderRuntimeState {
    const state = this.states.get(providerId);
    if (!state) {
      throw new Error(`Provider ${providerId} 未注册`);
    }
    return state;
  }
}
