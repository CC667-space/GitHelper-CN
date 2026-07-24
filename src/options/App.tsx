import React, { useEffect, useState } from 'react';

import { PROVIDER_CATALOG } from '../lib/provider-catalog';
import type { ProviderRuntimeView } from '../lib/bridge-protocol';
import type { ProviderId, UserPreferences } from '../lib/types';
import { defaultUserPreferences } from '../background/prefs-store';
import { defaultOptionsServices, type OptionsServices, type StorageUsage } from './services';

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OptionsApp({
  services = defaultOptionsServices,
}: {
  services?: OptionsServices;
}): React.JSX.Element {
  const [probeStatus, setProbeStatus] = useState('待验证');
  const [providerProbeTarget, setProviderProbeTarget] = useState<ProviderId | 'all'>();
  const [providerProbeStatus, setProviderProbeStatus] = useState('尚未运行');
  const [providers, setProviders] = useState<ProviderRuntimeView[]>([]);
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [models, setModels] = useState<
    Partial<Record<ProviderId, { textModel: string; visionModel: string }>>
  >({});
  const [preferences, setPreferences] = useState<UserPreferences>(defaultUserPreferences);
  const [storageUsage, setStorageUsage] = useState<StorageUsage>();
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [status, setStatus] = useState('正在读取本地 Provider 状态…');

  async function refreshProviders(): Promise<void> {
    const next = await services.loadProviders();
    setProviders(next);
    setModels(
      Object.fromEntries(
        next.map((provider) => [
          provider.id,
          {
            textModel: provider.textModel,
            visionModel: provider.visionModel ?? '',
          },
        ]),
      ),
    );
    setStatus('本地状态已更新');
  }

  async function refreshLocalSettings(): Promise<void> {
    const [nextPreferences, nextUsage] = await Promise.all([
      services.loadPreferences(),
      services.getStorageUsage(),
    ]);
    setPreferences(nextPreferences);
    setStorageUsage(nextUsage);
  }

  useEffect(() => {
    void Promise.all([refreshProviders(), refreshLocalSettings()]).catch((error: unknown) =>
      setStatus(error instanceof Error ? error.message : String(error)),
    );
  }, []);

  async function saveKey(providerId: ProviderId): Promise<void> {
    const apiKey = keys[providerId]?.trim() ?? '';
    if (!apiKey) {
      setStatus('请输入 API Key');
      return;
    }
    await services.saveKey(providerId, apiKey);
    setKeys((current) => ({ ...current, [providerId]: '' }));
    setStatus(`${providerId} Key 已保存，输入框已清空`);
    await refreshProviders();
  }

  async function removeKey(providerId: ProviderId): Promise<void> {
    await services.deleteKey(providerId);
    setKeys((current) => ({ ...current, [providerId]: '' }));
    await refreshProviders();
  }

  async function saveModels(providerId: ProviderId): Promise<void> {
    const current = models[providerId] ?? { textModel: '', visionModel: '' };
    await services.saveModels(providerId, {
      textModel: current.textModel,
      visionModel: current.visionModel || undefined,
    });
    setStatus(`${providerId} 模型配置已保存`);
    await refreshProviders();
  }

  async function runProbes(providerId?: ProviderId): Promise<void> {
    const targetLabel =
      providerId === undefined
        ? '全部已配置 Provider'
        : (PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.label ?? providerId);
    setProviderProbeTarget(providerId ?? 'all');
    setProviderProbeStatus(`正在复测${targetLabel}；会消耗少量 Provider 额度…`);
    setStatus(`正在复测${targetLabel}；会消耗少量 Provider 额度…`);
    try {
      await services.runProbes(providerId);
      await refreshProviders();
      setProviderProbeStatus(`${targetLabel}的能力探针已完成`);
      setStatus(`${targetLabel}的能力探针已完成；请查看对应 Provider 状态`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderProbeStatus(`能力探针失败：${message}`);
      throw error;
    } finally {
      setProviderProbeTarget(undefined);
    }
  }

  async function openProbeSidePanel(): Promise<void> {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id === undefined) {
      throw new Error('无法确定当前 Chrome 窗口');
    }
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    await chrome.storage.local.set({
      phase0SidePanel: {
        status: 'opened',
        openedAt: new Date().toISOString(),
      },
    });
    setProbeStatus('Side Panel 已打开');
  }

  async function savePreferences(): Promise<void> {
    const saved = await services.savePreferences(preferences);
    setPreferences(saved);
    setStatus('偏好已保存');
    setStorageUsage(await services.getStorageUsage());
  }

  async function clearConversationData(): Promise<void> {
    await services.clearSessionsAndPreferences();
    await refreshLocalSettings();
    setStatus('会话与偏好已清除；Provider Key 保持不变');
  }

  async function confirmClearAll(): Promise<void> {
    await services.clearAllLocalData();
    setConfirmingClearAll(false);
    await Promise.all([refreshProviders(), refreshLocalSettings()]);
    setStatus('全部本地数据已清除');
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">GitHelper-CN 设置</h1>
        <p className="mt-2 text-sm text-slate-600">
          Key 仅存于本机浏览器扩展存储。保存后输入框立即清空，已存 Key 只显示尾四位掩码。
        </p>
      </header>

      <p
        aria-live="polite"
        className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700"
        data-testid="options-status"
      >
        {status}
      </p>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Provider 与 API Key</h2>
        {PROVIDER_CATALOG.map((catalog) => {
          const provider = providers.find((item) => item.id === catalog.id);
          const model = models[catalog.id] ?? {
            textModel: catalog.defaultTextModel,
            visionModel: catalog.defaultVisionModel ?? '',
          };
          return (
            <article className="rounded-lg border border-slate-200 p-4" key={catalog.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{catalog.label}</h3>
                  <p className="text-xs text-slate-500">
                    {catalog.apiHost}
                    {catalog.apiPath}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs">
                  {provider?.availability ?? 'needs_key'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  文本：
                  {provider?.availability === 'available' ? '已验证' : '未验证/不可用'}
                </span>
                <span>
                  视觉：{provider?.capabilities.supportsVision ? '已验证' : '未验证/不支持'}
                </span>
              </div>
              {provider?.disabledReason ? (
                <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                  失败原因：{provider.disabledReason}
                </p>
              ) : null}
              {provider?.visionFailureReason ? (
                <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  视觉失败原因：{provider.visionFailureReason}
                </p>
              ) : null}

              <label className="mt-4 block text-sm font-medium" htmlFor={`${catalog.id}-api-key`}>
                {catalog.label} API Key
              </label>
              <input
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                id={`${catalog.id}-api-key`}
                onChange={(event) =>
                  setKeys((current) => ({
                    ...current,
                    [catalog.id]: event.target.value,
                  }))
                }
                placeholder={provider?.keyMask ?? '未配置'}
                type="password"
                value={keys[catalog.id] ?? ''}
              />
              <p className="mt-1 text-xs text-slate-500">已存：{provider?.keyMask ?? '无'}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
                  onClick={() =>
                    void saveKey(catalog.id).catch((error: unknown) =>
                      setStatus(error instanceof Error ? error.message : String(error)),
                    )
                  }
                  type="button"
                >
                  保存 Key
                </button>
                <button
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                  disabled={!provider?.keyMask}
                  onClick={() =>
                    void removeKey(catalog.id).catch((error: unknown) =>
                      setStatus(error instanceof Error ? error.message : String(error)),
                    )
                  }
                  type="button"
                >
                  删除 Key
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  文本 model ID
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 p-2"
                    list={`${catalog.id}-model-suggestions`}
                    onChange={(event) =>
                      setModels((current) => ({
                        ...current,
                        [catalog.id]: { ...model, textModel: event.target.value },
                      }))
                    }
                    value={model.textModel}
                  />
                </label>
                {catalog.id !== 'deepseek' ? (
                  <label className="text-sm">
                    视觉 model ID
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 p-2"
                      list={`${catalog.id}-model-suggestions`}
                      onChange={(event) =>
                        setModels((current) => ({
                          ...current,
                          [catalog.id]: { ...model, visionModel: event.target.value },
                        }))
                      }
                      value={model.visionModel}
                    />
                  </label>
                ) : (
                  <p className="self-end rounded bg-amber-50 p-2 text-xs text-amber-800">
                    DeepSeek 不支持图像输入
                  </p>
                )}
              </div>
              <datalist id={`${catalog.id}-model-suggestions`}>
                {catalog.modelSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              <button
                className="mt-3 rounded border border-slate-300 px-3 py-2 text-sm"
                onClick={() =>
                  void saveModels(catalog.id).catch((error: unknown) =>
                    setStatus(error instanceof Error ? error.message : String(error)),
                  )
                }
                type="button"
              >
                保存模型配置
              </button>
              <button
                className="ml-2 mt-3 rounded border border-amber-700 px-3 py-2 text-sm text-amber-900 disabled:border-slate-200 disabled:text-slate-400"
                disabled={providerProbeTarget !== undefined || !provider?.keyMask}
                onClick={() =>
                  void runProbes(catalog.id).catch((error: unknown) =>
                    setStatus(error instanceof Error ? error.message : String(error)),
                  )
                }
                type="button"
              >
                {providerProbeTarget === catalog.id
                  ? `正在复测 ${catalog.label}…`
                  : `仅复测 ${catalog.label}`}
              </button>
            </article>
          );
        })}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-medium text-amber-900">真实能力探针</h3>
          <p className="mt-1 text-sm text-amber-800">
            会向已配置 Provider
            发送最小文本、流式、取消、工具、结构化输出及视觉测试请求，可能产生少量费用。
          </p>
          <button
            className="mt-3 rounded bg-amber-900 px-3 py-2 text-sm text-white disabled:bg-amber-300"
            disabled={
              providerProbeTarget !== undefined || !providers.some((provider) => provider.keyMask)
            }
            onClick={() =>
              void runProbes().catch((error: unknown) =>
                setStatus(error instanceof Error ? error.message : String(error)),
              )
            }
            type="button"
          >
            {providerProbeTarget === 'all' ? '探针运行中…' : '运行真实能力探针'}
          </button>
          <p aria-live="polite" className="mt-2 text-sm text-amber-900">
            {providerProbeStatus}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="font-medium">回答与操作偏好</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            技术水平
            <select
              className="mt-1 w-full rounded-md border border-slate-300 p-2"
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  technicalLevel: event.target.value as UserPreferences['technicalLevel'],
                }))
              }
              value={preferences.technicalLevel}
            >
              <option value="beginner">新手</option>
              <option value="intermediate">进阶</option>
              <option value="advanced">高级</option>
            </select>
          </label>
          <label className="text-sm">
            操作系统
            <input
              className="mt-1 w-full rounded-md border border-slate-300 p-2"
              maxLength={100}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  operatingSystem: event.target.value,
                }))
              }
              value={preferences.operatingSystem}
            />
          </label>
        </div>
        <label className="mt-4 block text-sm">
          解释偏好
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-slate-300 p-2"
            maxLength={500}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                explanationPreference: event.target.value,
              }))
            }
            value={preferences.explanationPreference}
          />
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            GitHub 内导航
            <select
              className="mt-1 w-full rounded-md border border-slate-300 p-2"
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  operationPolicy: {
                    ...current.operationPolicy,
                    navigation: event.target.value as 'auto' | 'confirm',
                  },
                }))
              }
              value={preferences.operationPolicy.navigation}
            >
              <option value="auto">自动</option>
              <option value="confirm">每次确认</option>
            </select>
          </label>
          <label className="text-sm">
            公开搜索
            <select
              className="mt-1 w-full rounded-md border border-slate-300 p-2"
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  operationPolicy: {
                    ...current.operationPolicy,
                    search: event.target.value as 'auto' | 'confirm',
                  },
                }))
              }
              value={preferences.operationPolicy.search}
            >
              <option value="auto">自动</option>
              <option value="confirm">每次确认</option>
            </select>
          </label>
          <label className="text-sm">
            下载
            <select
              className="mt-1 w-full rounded-md border border-slate-300 p-2"
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  operationPolicy: {
                    ...current.operationPolicy,
                    downloads: event.target.value as 'confirm' | 'deny',
                  },
                }))
              }
              value={preferences.operationPolicy.downloads}
            >
              <option value="confirm">每次确认</option>
              <option value="deny">拒绝</option>
            </select>
          </label>
          <label className="text-sm">
            账号变更
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 p-2"
              disabled
              value="固定拒绝"
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            checked={preferences.visionEnabled}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                visionEnabled: event.target.checked,
              }))
            }
            type="checkbox"
          />
          允许在用户主动框选后使用视觉能力
        </label>
        <button
          className="mt-4 rounded bg-slate-900 px-3 py-2 text-sm text-white"
          onClick={() =>
            void savePreferences().catch((error: unknown) =>
              setStatus(error instanceof Error ? error.message : String(error)),
            )
          }
          type="button"
        >
          保存偏好
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="font-medium">本地数据与容量</h2>
        <p className="mt-2 text-sm text-slate-600" data-testid="storage-usage">
          当前占用：{storageUsage ? formatBytes(storageUsage.bytes) : '读取中…'}
          {storageUsage
            ? `（软上限 ${formatBytes(storageUsage.softLimitBytes)}，硬上限 ${formatBytes(storageUsage.hardLimitBytes)}）`
            : ''}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            onClick={() =>
              void clearConversationData().catch((error: unknown) =>
                setStatus(error instanceof Error ? error.message : String(error)),
              )
            }
            type="button"
          >
            清除会话与偏好
          </button>
          <button
            className="rounded border border-rose-300 px-3 py-2 text-sm text-rose-700"
            onClick={() => setConfirmingClearAll(true)}
            type="button"
          >
            清除全部本地数据
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          “清除会话与偏好”不会删除任何 Provider Key；单个 Key 请在对应 Provider 卡片中删除。
        </p>
        {confirmingClearAll ? (
          <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3" role="alertdialog">
            <p className="text-sm text-rose-900">
              二次确认：这会删除全部会话、偏好、Provider Key 和本地配置，且不可恢复。
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                onClick={() => setConfirmingClearAll(false)}
                type="button"
              >
                返回
              </button>
              <button
                className="rounded bg-rose-700 px-3 py-2 text-sm text-white"
                onClick={() =>
                  void confirmClearAll().catch((error: unknown) =>
                    setStatus(error instanceof Error ? error.message : String(error)),
                  )
                }
                type="button"
              >
                确认清除全部
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="font-medium">数据流向披露</h2>
        <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-2 text-sm">
          <dt className="text-slate-500">固定端点</dt>
          <dd>仅限 DeepSeek / UUAPI / OpenRouter 预设 Host，不允许自定义 Base URL</dd>
          <dt className="text-slate-500">中转服务</dt>
          <dd>UUAPI、OpenRouter 可能把数据转交其上游模型供应商</dd>
          <dt className="text-slate-500">发送内容</dt>
          <dd>仅在用户明确提交后，发送最小必要上下文</dd>
          <dt className="text-slate-500">第三方处理</dt>
          <dd>扩展无法控制或承诺第三方端点后续如何处理数据</dd>
          <dt className="text-slate-500">私有仓库</dt>
          <dd>禁止出站</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="font-medium">本地技术验证</h2>
        <button
          id="phase0-open-side-panel"
          className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm text-white"
          type="button"
          onClick={() => void openProbeSidePanel()}
        >
          打开 Side Panel
        </button>
        <p className="mt-2 text-sm" data-testid="phase0-side-panel-status">
          {probeStatus}
        </p>
      </section>
    </main>
  );
}
