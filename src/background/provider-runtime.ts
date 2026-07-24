import { PROVIDER_CATALOG, providerCatalogEntry } from '../lib/provider-catalog';
import { providerSettingsStore } from '../lib/provider-settings';
import type { PageContext, ProviderId } from '../lib/types';
import { runCapabilityProbe, type CapabilityProbeReport } from './capability-probe';
import { buildMinimalContext } from './context-builder';
import { getCredentialMask } from './credential-store';
import { assertPublicContext } from './outbound-policy';
import { ProviderManager, type CapabilityProbeSummary } from './provider-manager';
import type { Provider, ProviderChatRequest } from './providers/base';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenRouterProvider } from './providers/openrouter';
import { createProviderTransport } from './providers/transport';
import { UuapiProvider } from './providers/uuapi';
import type { ProviderRuntimeView } from '../lib/bridge-protocol';

const PROBE_STORAGE_KEY = 'provider:probes:v1';
const SAMPLE_RED_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAvSURBVFhH7c6hAQAACMOw/f/08BwAJqKmKmnSz7LHdQAAAAAAAAAAAAAAAAAAAANUDfhqnpuFxwAAAABJRU5ErkJggg==';

interface ProbeStorage {
  schemaVersion: 1;
  results: Partial<Record<ProviderId, CapabilityProbeSummary>>;
}

export interface StreamAnswerInput {
  requestId: string;
  question: string;
  pageContext: PageContext;
  manualProviderId?: ProviderId;
  needsVision?: boolean;
  images?: string[];
  signal: AbortSignal;
}

export class ProviderRuntime {
  private readonly providers: Map<ProviderId, Provider>;
  private readonly manager: ProviderManager;
  private readonly ready: Promise<void>;

  constructor(providers?: Map<ProviderId, Provider>) {
    const transport = createProviderTransport();
    this.providers =
      providers ??
      new Map<ProviderId, Provider>([
        ['deepseek', new DeepSeekProvider(transport)],
        ['uuapi', new UuapiProvider(transport)],
        ['openrouter', new OpenRouterProvider(transport)],
      ]);
    this.manager = new ProviderManager(this.providers);
    this.ready = this.loadProbeState();
  }

  async views(): Promise<ProviderRuntimeView[]> {
    await this.ready;
    const settings = await providerSettingsStore().read();
    return await Promise.all(
      PROVIDER_CATALOG.map(async (catalog): Promise<ProviderRuntimeView> => {
        const keyMask = await getCredentialMask(catalog.id);
        const state = this.manager.state(catalog.id);
        const probe = state.probe;
        const availability: ProviderRuntimeView['availability'] = !keyMask
          ? 'needs_key'
          : state.disabled
            ? 'disabled'
            : probe?.text
              ? 'available'
              : 'pending_probe';
        return {
          id: catalog.id,
          label: catalog.label,
          apiHost: catalog.apiHost,
          textModel: settings.providers[catalog.id]?.textModel ?? catalog.defaultTextModel,
          visionModel: settings.providers[catalog.id]?.visionModel ?? catalog.defaultVisionModel,
          intermediary: catalog.intermediary,
          keyMask,
          availability,
          disabledReason: state.disabledReason,
          visionFailureReason: probe?.visionFailureReason,
          capabilities: this.manager.capabilities(catalog.id),
        };
      }),
    );
  }

  async *streamAnswer(input: StreamAnswerInput): AsyncIterable<string> {
    await this.ready;
    assertPublicContext(input.pageContext);
    const built = buildMinimalContext(input.question, input.pageContext);
    const provider = this.manager.resolve({
      needsVision: input.needsVision ?? false,
      manualOverrideId: input.manualProviderId,
    });
    const settings = await providerSettingsStore().read();
    const providerSetting = settings.providers[provider.id];
    const model = input.needsVision ? providerSetting?.visionModel : providerSetting?.textModel;
    if (!model) {
      throw new Error(`${provider.label} 尚未配置${input.needsVision ? '视觉' : '文本'}模型 ID`);
    }
    const request: ProviderChatRequest = {
      requestId: input.requestId,
      model,
      messages: built.messages,
      images: input.images,
      maxTokens: 1_024,
      temperature: 0.2,
    };
    for await (const chunk of provider.chatStream(request, input.signal)) {
      if (chunk.delta) {
        yield chunk.delta;
      }
    }
  }

  abort(requestId: string): boolean {
    return this.manager.abort(requestId);
  }

  async runConfiguredProbes(providerId?: ProviderId): Promise<CapabilityProbeReport[]> {
    await this.ready;
    const settings = await providerSettingsStore().read();
    const reports: CapabilityProbeReport[] = [];
    const priorStorage = await chrome.storage.local.get(PROBE_STORAGE_KEY);
    const prior = priorStorage[PROBE_STORAGE_KEY] as ProbeStorage | undefined;
    const stored: ProbeStorage = {
      schemaVersion: 1,
      results:
        prior?.schemaVersion === 1 && prior.results
          ? { ...prior.results }
          : {},
    };
    const catalogs = providerId
      ? PROVIDER_CATALOG.filter((catalog) => catalog.id === providerId)
      : PROVIDER_CATALOG;
    for (const catalog of catalogs) {
      if (!(await getCredentialMask(catalog.id))) {
        continue;
      }
      const provider = this.providers.get(catalog.id)!;
      let setting = settings.providers[catalog.id];
      if (!setting?.textModel) {
        try {
          const models = await provider.listModels();
          const textModel = models[0]?.id ?? '';
          const visionModel =
            models.find((model) => model.inputModalities?.includes('image'))?.id ??
            setting?.visionModel;
          setting = { textModel, visionModel };
          if (textModel) {
            await providerSettingsStore().writeProvider(catalog.id, setting);
          }
        } catch {
          // 下面统一记录为缺少 model；不把模型列表失败伪装成可用能力。
        }
      }
      if (!setting?.textModel) {
        this.manager.disable(
          catalog.id,
          '未配置文本模型 ID，且 /models 未返回可自动选择的型号',
        );
        continue;
      }
      try {
        const report = await runCapabilityProbe(provider, {
          textModel: setting.textModel,
          visionModel: setting.visionModel,
          fallbackVisionModel: catalog.defaultVisionModel,
          sampleImageDataUrl: catalog.id === 'deepseek' ? undefined : SAMPLE_RED_PIXEL,
        });
        reports.push(report);
        stored.results[catalog.id] = report.summary;
        this.manager.setProbeResult(report.summary);
        if (
          report.summary.vision &&
          report.selectedModels.visionModel &&
          report.selectedModels.visionModel !== setting.visionModel
        ) {
          await providerSettingsStore().writeProvider(catalog.id, {
            ...setting,
            visionModel: report.selectedModels.visionModel,
          });
        }
      } catch (error: unknown) {
        const failed: CapabilityProbeSummary = {
          providerId: catalog.id,
          text: false,
          streaming: false,
          abort: false,
          vision: false,
          toolCalls: false,
          structuredOutput: false,
          usage: false,
          errorFormat: false,
          rateLimitFormat: false,
          probedAt: new Date().toISOString(),
          failureReason: error instanceof Error ? error.message : String(error),
        };
        stored.results[catalog.id] = failed;
        this.manager.setProbeResult(failed);
      }
    }
    await chrome.storage.local.set({ [PROBE_STORAGE_KEY]: stored });
    return reports;
  }

  private async loadProbeState(): Promise<void> {
    const stored = await chrome.storage.local.get(PROBE_STORAGE_KEY);
    const candidate = stored[PROBE_STORAGE_KEY] as ProbeStorage | undefined;
    if (candidate?.schemaVersion !== 1 || !candidate.results) {
      return;
    }
    for (const catalog of PROVIDER_CATALOG) {
      const result = candidate.results[catalog.id];
      if (result?.providerId === catalog.id && typeof result.probedAt === 'string') {
        this.manager.setProbeResult(result);
      }
    }
  }
}

export function providerDisclosure(providerId: ProviderId) {
  return providerCatalogEntry(providerId);
}
