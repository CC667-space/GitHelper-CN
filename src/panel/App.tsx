import React, { useEffect, useRef, useState } from 'react';

import type { ProviderId } from '../lib/types';
import { providerCatalogEntry } from '../lib/provider-catalog';
import type { SearchTarget } from '../lib/github-search';
import { connectPanel, type PanelConnection } from './connection';
import { MarkdownMessage } from './MarkdownMessage';
import { usePanelStore } from './store';

function displayDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '未获取';
}

function displayCount(value?: number): string {
  return value === undefined ? '未获取' : value.toLocaleString('zh-CN');
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationTurn {
  id: string;
  question?: ConversationMessage;
  replies: ConversationMessage[];
}

type PanelSection = 'context' | 'analysis' | 'search' | 'qa';

const panelSections: Array<{ id: PanelSection; label: string }> = [
  { id: 'context', label: '页面提问' },
  { id: 'analysis', label: '仓库分析' },
  { id: 'search', label: '中文搜索' },
  { id: 'qa', label: '问答' },
];

function groupConversation(messages: ConversationMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ id: message.id, question: message, replies: [] });
      continue;
    }
    const current = turns.at(-1);
    if (current?.question) {
      current.replies.push(message);
    } else {
      turns.push({ id: message.id, replies: [message] });
    }
  }
  return turns;
}

const controlClass =
  'h-10 w-full rounded-lg border border-[#d5dce7] bg-white px-2.5 text-sm text-[#172238] shadow-[0_2px_8px_rgba(23,34,56,0.08)] outline-none transition focus:border-[#176b87] focus:ring-2 focus:ring-[#176b87]/15 disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-[#8b97a8]';
const secondaryButtonClass =
  'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d5dce7] bg-white px-2.5 py-2 text-sm font-medium text-[#334155] shadow-[0_2px_8px_rgba(23,34,56,0.08)] transition hover:border-[#aeb9c7] hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b87]/20 disabled:cursor-not-allowed disabled:border-[#e2e7ee] disabled:bg-[#eef2f6] disabled:text-[#8b97a8] disabled:shadow-none';
const primaryButtonClass =
  'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#176b87] bg-[#176b87] px-2.5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(23,34,56,0.12)] transition hover:border-[#12566d] hover:bg-[#12566d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b87]/25 disabled:cursor-not-allowed disabled:border-[#b8c2d0] disabled:bg-[#b8c2d0] disabled:shadow-none';
const iconButtonClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[#65738a] transition hover:border-[#d5dce7] hover:bg-[#eef2f6] hover:text-[#172238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b87]/20 disabled:cursor-not-allowed disabled:text-[#aab3c0]';
const disclosureClass =
  'group rounded-lg border border-[#d5dce7] bg-white shadow-[0_2px_8px_rgba(23,34,56,0.06)] open:border-[#aeb9c7]';
const disclosureSummaryClass =
  'flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-2.5 font-medium text-[#334155] transition hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176b87]/20 [&::-webkit-details-marker]:hidden';

function ChevronIcon({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 transition-transform ${className}`}
      data-icon="chevron"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" data-icon="trash" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" data-icon="check" fill="none" viewBox="0 0 24 24">
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" data-icon="close" fill="none" viewBox="0 0 24 24">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function SparklesIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3c.5 4.2 2.8 6.5 7 7-4.2.5-6.5 2.8-7 7-.5-4.2-2.8-6.5-7-7 4.2-.5 6.5-2.8 7-7ZM19 16c.2 1.7 1.1 2.6 2.8 2.8-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.1 2.8-2.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function PanelApp({
  connect = connectPanel,
}: {
  connect?: typeof connectPanel;
}): React.JSX.Element {
  const connection = useRef<PanelConnection>();
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const [activeSection, setActiveSection] = useState<PanelSection>('context');
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const [collapsedTurnIds, setCollapsedTurnIds] = useState<Set<string>>(() => new Set());
  const [pendingTurnDeleteId, setPendingTurnDeleteId] = useState<string>();
  const [pendingSessionDeleteId, setPendingSessionDeleteId] = useState<string>();
  const [focusComposerRequested, setFocusComposerRequested] = useState(false);
  const {
    connected,
    draft,
    messages,
    recentSessions,
    sessionHistoryTruncated,
    sessionId,
    startNewSession,
    pageLabel,
    providers,
    pickStatus,
    pickStatusMessage,
    selectedElement,
    regionStatus,
    regionStatusMessage,
    selectedRegion,
    searchDraft,
    searchTarget,
    searchStatus,
    searchError,
    searchResult,
    searchRestored,
    analysisStatus,
    analysisError,
    analysisCard,
    selectedTextProviderId,
    selectedVisionProviderId,
    activeRequestId,
    addUserMessage,
    applyProviderState,
    applyPickState,
    applyRegionState,
    applySessionState,
    applySearchState,
    applyRepositoryAnalysisState,
    applyStreamEvent,
    beginNewSession,
    selectTextProvider,
    selectVisionProvider,
    setConnected,
    setDraft,
    clearSelectedElement,
    clearSelectedRegion,
    setSearchDraft,
    setSearchTarget,
  } = usePanelStore();

  useEffect(() => {
    let active = true;
    const activeConnection = connect(
      applyStreamEvent,
      applyProviderState,
      (nextConnected) => {
        if (active) {
          setConnected(nextConnected);
        }
      },
      applySessionState,
      applyPickState,
      applyRegionState,
      applySearchState,
      applyRepositoryAnalysisState,
    );
    connection.current = activeConnection;
    return () => {
      active = false;
      if (connection.current === activeConnection) {
        connection.current = undefined;
      }
      activeConnection.disconnect();
    };
  }, [
    applyPickState,
    applyRegionState,
    applySearchState,
    applyRepositoryAnalysisState,
    applyProviderState,
    applySessionState,
    applyStreamEvent,
    connect,
    setConnected,
  ]);

  useEffect(() => {
    if (!focusComposerRequested) {
      return;
    }
    questionInput.current?.focus();
    questionInput.current?.scrollIntoView?.({ block: 'nearest' });
    setFocusComposerRequested(false);
  }, [focusComposerRequested]);

  useEffect(() => {
    setCollapsedTurnIds(new Set());
    setPendingTurnDeleteId(undefined);
    setPendingSessionDeleteId(undefined);
  }, [sessionId]);

  function submit(): void {
    const text = draft.trim();
    if (!text || !connection.current || !connected) {
      return;
    }
    addUserMessage(text);
    const providerId = selectedRegion?.needsVision
      ? selectedVisionProviderId
      : selectedTextProviderId;
    const element = selectedRegion ? undefined : selectedElement;
    if (sessionId || startNewSession) {
      connection.current.send(
        text,
        providerId,
        element,
        selectedRegion,
        sessionId,
        startNewSession,
      );
      return;
    }
    if (selectedRegion) {
      connection.current.send(text, providerId, undefined, selectedRegion);
    } else if (selectedElement) {
      connection.current.send(text, selectedTextProviderId, selectedElement);
    } else {
      connection.current.send(text, selectedTextProviderId);
    }
  }

  function submitSearch(): void {
    const text = searchDraft.trim();
    if (!text || !connected || searchStatus === 'searching') {
      return;
    }
    connection.current?.search?.(text, searchTarget, selectedTextProviderId);
  }

  function focusQuestionInput(): void {
    setActiveSection('qa');
    setFocusComposerRequested(true);
  }

  return (
    <main
      className="flex min-h-screen flex-col bg-[#f7f9fc] text-sm text-[#172238]"
      data-testid="side-panel"
    >
      <header className="border-b border-[#d5dce7] bg-white p-2.5 shadow-[0_2px_8px_rgba(23,34,56,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight">GitHelper-CN</h1>
            <p className="mt-0.5 text-[11px] text-[#65738a]">当前 GitHub 页面的中文助手</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${
              connected ? 'bg-[#e8f2f5] text-[#176b87]' : 'bg-amber-50 text-amber-700'
            }`}
            title={connected ? 'Background 已连接' : 'Background 未连接'}
          >
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-[#176b87]' : 'bg-amber-500'}`}
            />
            {connected ? '已连接' : '连接中'}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <label className="block min-w-0 text-xs font-medium text-[#65738a]">
            文本 Provider
            <select
              className={`${controlClass} mt-1`}
              onChange={(event) => selectTextProvider(event.target.value as ProviderId)}
              title={
                providers.find((provider) => provider.id === selectedTextProviderId)?.label ??
                '文本 Provider'
              }
              value={selectedTextProviderId ?? ''}
            >
              <option disabled value="">
                尚未配置
              </option>
              {providers
                .filter((provider) => providerCatalogEntry(provider.id).visibility === 'common')
                .map((provider) => (
                  <option
                    disabled={provider.availability !== 'available'}
                    key={provider.id}
                    value={provider.id}
                  >
                    {provider.label} · {provider.textModel || '未填 model'}
                  </option>
                ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-medium text-[#65738a]">
            视觉 Provider
            <select
              className={`${controlClass} mt-1`}
              onChange={(event) => selectVisionProvider(event.target.value as ProviderId)}
              title={
                providers.find((provider) => provider.id === selectedVisionProviderId)?.label ??
                '视觉 Provider'
              }
              value={selectedVisionProviderId ?? ''}
            >
              <option disabled value="">
                尚未验证
              </option>
              {providers
                .filter((provider) => providerCatalogEntry(provider.id).visibility === 'common')
                .map((provider) => (
                  <option
                    disabled={
                      provider.availability !== 'available' || !provider.capabilities.supportsVision
                    }
                    key={provider.id}
                    value={provider.id}
                  >
                    {provider.label} · {provider.visionModel || '未填 model'}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div
          className="mt-2.5 flex items-center gap-2 rounded-lg bg-[#f7f9fc] px-2.5 py-2 text-xs text-[#65738a]"
          title={pageLabel}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              pageLabel.startsWith('等待') ? 'bg-amber-400' : 'bg-[#176b87]'
            }`}
          />
          <p className="truncate">{pageLabel}</p>
        </div>
      </header>

      <nav
        aria-label="功能区导航"
        className="grid grid-cols-4 gap-1 border-b border-[#d5dce7] bg-white p-2.5"
        role="tablist"
      >
        {panelSections.map((section) => (
          <button
            aria-controls={`panel-section-${section.id}`}
            aria-selected={activeSection === section.id}
            className="min-h-9 rounded-lg px-2 text-xs font-medium text-[#65738a] transition hover:bg-[#eef2f6] hover:text-[#172238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b87]/20 aria-selected:bg-[#176b87] aria-selected:text-white"
            id={`panel-tab-${section.id}`}
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            role="tab"
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>

      <section
        aria-labelledby="panel-tab-context"
        className="m-2.5 rounded-lg border border-[#d5dce7] bg-white p-2.5 shadow-[0_2px_8px_rgba(23,34,56,0.08)]"
        data-testid="page-question"
        hidden={activeSection !== 'context'}
        id="panel-section-context"
        role="tabpanel"
      >
        <div>
          <h2 className="text-sm font-semibold">页面提问</h2>
          <p className="mt-0.5 text-xs text-[#65738a]">选择页面元素或区域后再输入问题</p>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {pickStatus === 'active' ? (
            <button
              className={`${secondaryButtonClass} border-amber-300 bg-amber-50 text-amber-900`}
              onClick={() => connection.current?.cancelPick?.()}
              type="button"
            >
              取消点击选择
            </button>
          ) : (
            <button
              className={secondaryButtonClass}
              disabled={!connected || Boolean(activeRequestId)}
              onClick={() => connection.current?.startPick?.()}
              type="button"
            >
              {selectedElement ? '重新选择页面元素' : '点击页面元素提问'}
            </button>
          )}
          {regionStatus === 'active' ? (
            <button
              className={`${secondaryButtonClass} border-amber-300 bg-amber-50 text-amber-900`}
              onClick={() => connection.current?.cancelRegion?.()}
              type="button"
            >
              取消区域框选
            </button>
          ) : (
            <button
              className={secondaryButtonClass}
              disabled={!connected || Boolean(activeRequestId) || pickStatus === 'active'}
              onClick={() => connection.current?.startRegion?.()}
              type="button"
            >
              {selectedRegion ? '重新框选页面区域' : '框选页面区域提问'}
            </button>
          )}
          {pickStatusMessage ? (
            <p className="col-span-2 text-xs text-amber-700">{pickStatusMessage}</p>
          ) : null}
          {regionStatusMessage ? (
            <p className="col-span-2 text-xs text-amber-700">{regionStatusMessage}</p>
          ) : null}
          {selectedElement ? (
            <div className="col-span-2 rounded-lg border border-[#d5dce7] bg-[#f7f9fc] p-2.5 text-xs text-[#334155]">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0">
                  已选择 &lt;{selectedElement.tag}&gt;：
                  <span className="break-words">
                    {selectedElement.text || selectedElement.attrs['aria-label'] || '无文本元素'}
                  </span>
                </p>
                <button
                  className="shrink-0 font-medium text-[#65738a] hover:text-rose-700"
                  onClick={clearSelectedElement}
                  type="button"
                >
                  清除
                </button>
              </div>
              <button
                className={`${secondaryButtonClass} mt-2 w-full`}
                onClick={focusQuestionInput}
                type="button"
              >
                下一步：输入问题
              </button>
            </div>
          ) : null}
          {selectedRegion ? (
            <div className="col-span-2 rounded-lg border border-[#d5dce7] bg-[#f7f9fc] p-2.5 text-xs text-[#334155]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p>
                    已框选 {Math.round(selectedRegion.rect.width)} ×{' '}
                    {Math.round(selectedRegion.rect.height)} CSS px
                  </p>
                  <p className="mt-1">
                    {selectedRegion.needsVision
                      ? '结构化信息不足；发送时会截取该区域并调用视觉 Provider，可能产生费用。'
                      : '结构化信息充分；本次只发送提取文本，不截图。'}
                  </p>
                </div>
                <button
                  className="shrink-0 font-medium text-[#65738a] hover:text-rose-700"
                  onClick={clearSelectedRegion}
                  type="button"
                >
                  清除
                </button>
              </div>
              <button
                className={`${secondaryButtonClass} mt-2 w-full`}
                onClick={focusQuestionInput}
                type="button"
              >
                下一步：输入问题
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="panel-tab-analysis"
        className="m-2.5 rounded-lg border border-[#d5dce7] bg-white p-2.5 shadow-[0_2px_8px_rgba(23,34,56,0.08)]"
        data-testid="repository-analysis"
        hidden={activeSection !== 'analysis'}
        id="panel-section-analysis"
        role="tabpanel"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">当前仓库分析</h2>
            <p className="mt-0.5 text-xs text-[#65738a]">快速理解项目用途、细节和原始依据</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-expanded={analysisExpanded}
              className={secondaryButtonClass}
              onClick={() => setAnalysisExpanded((expanded) => !expanded)}
              type="button"
            >
              <ChevronIcon className={analysisExpanded ? 'rotate-90' : ''} />
              {analysisExpanded ? '收起分析' : '展开分析'}
            </button>
            <button
              className={primaryButtonClass}
              disabled={!connected || analysisStatus === 'analyzing' || Boolean(activeRequestId)}
              onClick={() => {
                setAnalysisExpanded(true);
                connection.current?.analyzeRepository?.(selectedTextProviderId);
              }}
              type="button"
            >
              <SparklesIcon />
              {analysisStatus === 'analyzing' ? '分析中…' : '一键分析'}
            </button>
          </div>
        </div>
        {analysisExpanded ? (
          <>
            <p className="mt-2.5 rounded-lg bg-[#f7f9fc] px-2.5 py-2 text-xs leading-5 text-[#65738a]">
              会读取根目录与最多 3
              个关键文件的有限片段，不下载完整仓库或读取锁文件；解释会调用所选文本
              Provider，可能消耗额度。
            </p>
            {analysisError ? (
              <p className="mt-2 rounded-md bg-rose-50 p-2 text-xs text-rose-800">
                {analysisError}
              </p>
            ) : null}
            {analysisCard ? (
              <article
                className="mt-2.5 space-y-2.5 rounded-lg border border-[#b7d1db] bg-[#f4f9fa] p-2.5 text-xs"
                data-testid="repository-analysis-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{analysisCard.repository}</h3>
                  </div>
                  <button
                    className={`${secondaryButtonClass} shrink-0 border-[#8fb7c6] text-[#176b87]`}
                    onClick={() => connection.current?.openGitHubPage?.(analysisCard.url)}
                    type="button"
                  >
                    打开仓库
                  </button>
                </div>

                <section
                  className="rounded-lg border border-[#c8dde5] bg-white p-2.5 shadow-[0_2px_8px_rgba(23,34,56,0.06)]"
                  data-testid="repository-overview"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-medium">总结速览</h4>
                    <span className="text-[11px] text-slate-500">
                      {analysisCard.overview.source === 'provider'
                        ? 'AI 易读总结'
                        : 'AI 总结暂不可用'}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">
                    {analysisCard.overview.summary}
                  </p>
                  {analysisCard.overview.highlights.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                      {analysisCard.overview.highlights.map((highlight, index) => (
                        <li key={`${index}:${highlight.slice(0, 40)}`}>{highlight}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <details className={disclosureClass} data-testid="repository-details">
                  <summary className={disclosureSummaryClass}>
                    <ChevronIcon className="group-open:rotate-90" />
                    详细介绍
                  </summary>
                  <div className="space-y-4 border-t border-slate-200 px-3 py-3">
                    <section>
                      <h4 className="font-medium">项目是做什么的</h4>
                      <p className="mt-1 text-slate-600">{analysisCard.purpose}</p>
                    </section>
                    {analysisCard.details.readmeSummary ? (
                      <section>
                        <h4 className="font-medium">项目介绍</h4>
                        <p className="mt-1 whitespace-pre-wrap text-slate-600">
                          {analysisCard.details.readmeSummary}
                        </p>
                      </section>
                    ) : null}
                    <section>
                      <h4 className="font-medium">主要功能</h4>
                      {analysisCard.details.features.length ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                          {analysisCard.details.features.map((feature, index) => (
                            <li key={`${index}:${feature.slice(0, 40)}`}>{feature}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-slate-500">暂未整理出可靠功能说明</p>
                      )}
                    </section>
                    {analysisCard.details.configuration.length ||
                    analysisCard.details.implementation.length ? (
                      <section>
                        <h4 className="font-medium">技术说明</h4>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                          {[
                            ...analysisCard.details.configuration,
                            ...analysisCard.details.implementation,
                          ].map((item, index) => (
                            <li className="break-words" key={`${index}:${item.slice(0, 40)}`}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    <section>
                      <h4 className="font-medium">
                        安装与运行
                        <span className="ml-1 font-normal text-slate-500">
                          （
                          {analysisCard.installation.source === 'readme'
                            ? 'README 提取'
                            : analysisCard.installation.source === 'provider'
                              ? 'Provider 建议'
                              : '未获取'}
                          ）
                        </span>
                      </h4>
                      {analysisCard.installation.steps.length ? (
                        <ol className="mt-1 list-decimal space-y-1 pl-4">
                          {analysisCard.installation.steps.map((step, index) => (
                            <li className="break-words" key={`${index}:${step.slice(0, 40)}`}>
                              <code>{step}</code>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-1 text-slate-500">未找到可靠安装步骤</p>
                      )}
                    </section>
                    <section>
                      <h4 className="font-medium">上手难度：{analysisCard.difficulty.level}</h4>
                      <p className="mt-1 text-slate-600">{analysisCard.difficulty.reason}</p>
                    </section>
                    <section>
                      <h4 className="font-medium">需要注意</h4>
                      {analysisCard.risks.length ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                          {analysisCard.risks.map((risk, index) => (
                            <li key={`${index}:${risk.slice(0, 40)}`}>{risk}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-slate-500">
                          当前有限数据中未识别出明确风险；仍需自行核对。
                        </p>
                      )}
                    </section>
                    <section>
                      <h4 className="font-medium">建议下一步</h4>
                      <ol className="mt-1 list-decimal space-y-1 pl-4 text-slate-700">
                        {analysisCard.nextSteps.map((step, index) => (
                          <li key={`${index}:${step.slice(0, 40)}`}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  </div>
                </details>

                <details className={disclosureClass} data-testid="repository-source-summary">
                  <summary className={disclosureSummaryClass}>
                    <ChevronIcon className="group-open:rotate-90" />
                    原项目文件摘要
                  </summary>
                  <div className="space-y-4 border-t border-slate-200 px-3 py-3">
                    <section>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium">README 取样记录</h4>
                        <span className="text-[11px] text-slate-500">
                          {analysisCard.sourceSummary.source === 'readme'
                            ? '来自受限 README 片段'
                            : analysisCard.sourceSummary.source === 'description'
                              ? 'README 未取得，使用仓库简介'
                              : '可用资料有限'}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">
                        {analysisCard.sourceSummary.readmeEvidence}
                      </p>
                      {analysisCard.sourceSummary.readmeSections.length ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                          {analysisCard.sourceSummary.readmeSections.map((section, index) => (
                            <li key={`${index}:${section.slice(0, 40)}`}>{section}</li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                    <section>
                      <h4 className="font-medium">文件、配置与实现</h4>
                      {analysisCard.sourceSummary.configuration.length ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                          {analysisCard.sourceSummary.configuration.map((item, index) => (
                            <li className="break-words" key={`${index}:${item.slice(0, 40)}`}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-slate-500">未识别出可靠配置线索</p>
                      )}
                      {analysisCard.structure.directories.length ? (
                        <p className="mt-2 break-words text-slate-600">
                          目录：{analysisCard.structure.directories.join(' · ')}
                        </p>
                      ) : null}
                      {analysisCard.structure.keyFiles.some(
                        (file) => !/(^|\/)readme(?:\.[^/]*)?$/iu.test(file.path),
                      ) ? (
                        <ul className="mt-2 space-y-2">
                          {analysisCard.structure.keyFiles
                            .filter((file) => !/(^|\/)readme(?:\.[^/]*)?$/iu.test(file.path))
                            .map((file) => (
                              <li
                                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                                key={file.path}
                              >
                                <p className="break-all font-medium">
                                  <code>{file.path}</code>
                                  <span className="ml-1 font-normal text-slate-500">
                                    · {file.role}
                                  </span>
                                </p>
                                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                                  {file.findings.map((finding, index) => (
                                    <li key={`${file.path}:${index}`}>{finding}</li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-slate-500">未获取关键文件内容</p>
                      )}
                      {analysisCard.sourceSummary.implementation.length ? (
                        <>
                          <p className="mt-2 font-medium text-slate-700">简单实现分析</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                            {analysisCard.sourceSummary.implementation.map((item, index) => (
                              <li className="break-words" key={`${index}:${item.slice(0, 40)}`}>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {analysisCard.structure.truncated ? (
                        <p className="mt-2 text-slate-500">
                          这里只展示受限样本，未读取的目录和文件不能据此推断。
                        </p>
                      ) : null}
                    </section>
                  </div>
                </details>

                <details className={disclosureClass} data-testid="repository-facts">
                  <summary className={disclosureSummaryClass}>
                    <ChevronIcon className="group-open:rotate-90" />
                    仓库事实（Star、语言、Release 等）
                  </summary>
                  <div className="space-y-4 border-t border-slate-200 px-3 py-3">
                    <dl className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-slate-500">Star / Fork / Watch</dt>
                        <dd className="mt-1 font-medium">
                          {displayCount(analysisCard.popularity.stars)} /{' '}
                          {displayCount(analysisCard.popularity.forks)} /{' '}
                          {displayCount(analysisCard.popularity.watchers)}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-slate-500">开放 Issue / PR</dt>
                        <dd className="mt-1 font-medium">
                          {displayCount(analysisCard.issuesAndPullRequests.openIssues)} /{' '}
                          {displayCount(analysisCard.issuesAndPullRequests.openPullRequests)}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-slate-500">最后推送</dt>
                        <dd className="mt-1 font-medium">
                          {displayDate(analysisCard.activity.pushedAt)}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-slate-500">归档 / 许可证</dt>
                        <dd className="mt-1 font-medium">
                          {analysisCard.archived === null
                            ? '归档状态未知'
                            : analysisCard.archived
                              ? '已归档'
                              : '未归档'}
                          {' · '}
                          {analysisCard.license?.spdxId ?? analysisCard.license?.name ?? '未获取'}
                        </dd>
                      </div>
                    </dl>

                    <section>
                      <h5 className="font-medium">主要语言（最多 5 项）</h5>
                      {analysisCard.languages.length ? (
                        <ul className="mt-1 space-y-1">
                          {analysisCard.languages.map((language) => (
                            <li className="flex justify-between gap-2" key={language.name}>
                              <span>{language.name}</span>
                              <span>{language.percent.toFixed(1)}%</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-slate-500">未获取语言数据</p>
                      )}
                    </section>

                    <section>
                      <h5 className="font-medium">平台</h5>
                      <p className="mt-1 text-slate-600">
                        {analysisCard.platforms.join(' / ') || '未可靠识别'}
                      </p>
                    </section>

                    <section className="rounded-lg bg-slate-50 p-3">
                      <h5 className="font-medium">最新 Release</h5>
                      {analysisCard.release ? (
                        <p className="mt-1 text-slate-600">
                          {analysisCard.release.name} ({analysisCard.release.tag}) ·{' '}
                          {displayDate(analysisCard.release.publishedAt)}
                        </p>
                      ) : (
                        <p className="mt-1 text-slate-500">未找到正式 Release</p>
                      )}
                    </section>

                    <p className="text-slate-500">
                      数据源：DOM {analysisCard.sources.dom ? '✓' : '—'} · GitHub API{' '}
                      {analysisCard.sources.githubApi ? '✓' : '—'} · Provider{' '}
                      {analysisCard.sources.provider ? '✓' : '—'}
                    </p>
                  </div>
                </details>
                {analysisCard.degradedNotice ? (
                  <p className="rounded bg-amber-50 p-2 text-amber-900">
                    {analysisCard.degradedNotice}
                  </p>
                ) : null}
              </article>
            ) : null}
          </>
        ) : null}
      </section>

      <section
        aria-labelledby="panel-tab-search"
        className="m-2.5 rounded-lg border border-[#d5dce7] bg-white p-2.5 shadow-[0_2px_8px_rgba(23,34,56,0.08)]"
        data-testid="github-search"
        hidden={activeSection !== 'search'}
        id="panel-section-search"
        role="tabpanel"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">中文搜索 GitHub</h2>
            <p className="mt-0.5 text-xs text-[#65738a]">用自然语言描述你想找的仓库或 Issue</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
            使用当前文本 Provider · 本地安全校验
          </span>
        </div>
        <p className="mt-2.5 rounded-lg bg-[#f7f9fc] px-2.5 py-2 text-xs leading-5 text-[#65738a]">
          每次搜索最多调用 1 次，仅发送搜索描述，可能产生少量费用；失败时自动改用本地规则。
        </p>
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <label className="sr-only" htmlFor="github-search-input">
            描述要搜索的仓库或 Issue
          </label>
          <input
            className={controlClass}
            id="github-search-input"
            maxLength={500}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="例如：最近一年更新、Star 超过 1000 的 Python 项目"
            value={searchDraft}
          />
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <label className="sr-only" htmlFor="github-search-target">
              搜索类型
            </label>
            <select
              className={controlClass}
              id="github-search-target"
              onChange={(event) => setSearchTarget(event.target.value as SearchTarget)}
              value={searchTarget}
            >
              <option value="auto">自动判断仓库 / Issue</option>
              <option value="repositories">仅仓库</option>
              <option value="issues">仅 Issue</option>
            </select>
            <button
              className={`${primaryButtonClass} min-w-16`}
              disabled={!connected || !searchDraft.trim() || searchStatus === 'searching'}
              type="submit"
            >
              {searchStatus === 'searching' ? '搜索中…' : '搜索'}
            </button>
          </div>
        </form>
        {searchError ? (
          <p className="mt-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{searchError}</p>
        ) : null}
        {searchResult ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              {searchRestored ? (
                <p className="text-xs text-[#176b87]">
                  已恢复本标签页的上次结果；未再次调用 Provider 或 GitHub API。
                </p>
              ) : (
                <span />
              )}
              <button
                className="shrink-0 text-xs text-[#65738a] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#aab3c0] disabled:no-underline"
                disabled={!connected}
                onClick={() => {
                  applySearchState({ status: 'idle' });
                  connection.current?.clearSearch?.();
                }}
                type="button"
              >
                清除本次结果
              </button>
            </div>
            <div className="rounded-lg border border-[#d5dce7] bg-[#eef2f6] p-2.5 text-xs text-[#334155]">
              <p>{searchResult.conversion.explanation}</p>
              <code className="mt-1 block break-all text-blue-800">
                {searchResult.conversion.query}
              </code>
              <p className="mt-1">
                {searchResult.status === 'ok'
                  ? `GitHub API 共返回 ${searchResult.totalCount.toLocaleString('zh-CN')} 条，显示前 ${searchResult.items.length} 条。`
                  : searchResult.notice}
              </p>
              {searchResult.status === 'ok' && searchResult.notice ? (
                <p className="mt-1 text-amber-800">{searchResult.notice}</p>
              ) : null}
            </div>
            {searchResult.items.map((item) => (
              <article
                className="rounded-lg border border-[#d5dce7] bg-white p-2.5 text-xs shadow-[0_2px_8px_rgba(23,34,56,0.06)]"
                key={`${item.kind}:${item.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-medium text-slate-900">{item.title}</h3>
                    {item.kind === 'repository' ? (
                      <>
                        {item.description ? (
                          <p className="mt-1 break-words text-slate-600">{item.description}</p>
                        ) : null}
                        <p className="mt-1 text-slate-500">
                          {item.language ?? '语言未知'} · ★ {item.stars.toLocaleString('zh-CN')}
                          {item.archived ? ' · 已归档' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-slate-500">
                        {item.repository} #{item.number} · {item.state === 'open' ? '开放' : '关闭'}
                        {item.labels.length ? ` · ${item.labels.join(' / ')}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      className={secondaryButtonClass}
                      onClick={() => connection.current?.openGitHubPage?.(item.url, 'foreground')}
                      type="button"
                    >
                      打开
                    </button>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => connection.current?.openGitHubPage?.(item.url, 'background')}
                      type="button"
                    >
                      后台打开
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {searchResult.localResults?.length ? (
              <div className="rounded-lg border border-[#d5dce7] bg-white p-2.5 text-xs">
                <h3 className="font-medium">当前页面的本地结果</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
                  {searchResult.localResults.map((item, index) => (
                    <li className="break-words" key={`${index}:${item.slice(0, 40)}`}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {searchResult.fallbackUrl ? (
              <button
                className={`${secondaryButtonClass} w-full border-amber-300 bg-amber-50 text-amber-900`}
                onClick={() => connection.current?.openGitHubPage?.(searchResult.fallbackUrl!)}
                type="button"
              >
                在 GitHub 网页继续搜索
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="panel-tab-qa"
        className="m-2.5 flex flex-1 flex-col overflow-hidden rounded-lg border border-[#d5dce7] bg-white shadow-[0_2px_8px_rgba(23,34,56,0.08)]"
        data-testid="question-answer"
        hidden={activeSection !== 'qa'}
        id="panel-section-qa"
        role="tabpanel"
      >
        <div className="border-b border-[#d5dce7] p-2.5">
          <div>
            <h2 className="text-sm font-semibold">问答</h2>
            <p className="mt-0.5 text-xs text-[#65738a]">围绕当前页面继续提问</p>
          </div>
        </div>
        <div
          className="m-2.5 mb-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-[#d5dce7] bg-[#f7f9fc] p-2.5"
          data-testid="session-controls"
        >
          <label className="block min-w-0 text-xs font-medium text-[#65738a]">
            当前会话
            <select
              className={`${controlClass} mt-1`}
              disabled={!connected || Boolean(activeRequestId)}
              onChange={(event) => {
                if (event.target.value === '__new__') {
                  beginNewSession();
                  connection.current?.newSession?.();
                  return;
                }
                connection.current?.selectSession?.(event.target.value);
              }}
              value={sessionId ?? '__new__'}
            >
              <option value="__new__">新会话（尚未发送）</option>
              {recentSessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {session.title}
                  {session.repository ? ` · ${session.repository}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`${secondaryButtonClass} self-end`}
            disabled={!connected || Boolean(activeRequestId)}
            onClick={() => {
              beginNewSession();
              connection.current?.newSession?.();
            }}
            type="button"
          >
            <PlusIcon />
            新建会话
          </button>
          <details className={`${disclosureClass} col-span-2 text-xs`}>
            <summary className={disclosureSummaryClass}>
              <ChevronIcon className="group-open:rotate-90" />
              管理会话（{recentSessions.length}）
            </summary>
            {recentSessions.length ? (
              <ul className="space-y-1 border-t border-slate-200 p-2">
                {recentSessions.map((session) => (
                  <li
                    className="flex items-center gap-1 rounded-lg hover:bg-slate-50"
                    key={session.sessionId}
                  >
                    <button
                      aria-current={session.sessionId === sessionId ? 'true' : undefined}
                      className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left aria-[current=true]:bg-[#e8f2f5] aria-[current=true]:font-medium aria-[current=true]:text-[#176b87]"
                      disabled={!connected || Boolean(activeRequestId)}
                      onClick={() => connection.current?.selectSession?.(session.sessionId)}
                      title={`${session.title}${session.repository ? ` · ${session.repository}` : ''}`}
                      type="button"
                    >
                      {session.title}
                      {session.repository ? ` · ${session.repository}` : ''}
                    </button>
                    {pendingSessionDeleteId === session.sessionId ? (
                      <span
                        aria-label={`确认是否删除会话：${session.title}`}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-50 p-0.5"
                        role="group"
                      >
                        <button
                          aria-label={`确认删除会话：${session.title}`}
                          className={`${iconButtonClass} text-rose-700 hover:bg-rose-100 hover:text-rose-800`}
                          disabled={!connected || Boolean(activeRequestId)}
                          onClick={() => {
                            connection.current?.deleteSession?.(session.sessionId);
                            setPendingSessionDeleteId(undefined);
                          }}
                          title="确认删除"
                          type="button"
                        >
                          <CheckIcon />
                        </button>
                        <button
                          aria-label={`取消删除会话：${session.title}`}
                          className={iconButtonClass}
                          onClick={() => setPendingSessionDeleteId(undefined)}
                          title="取消删除"
                          type="button"
                        >
                          <CloseIcon />
                        </button>
                      </span>
                    ) : (
                      <button
                        aria-label={`删除会话：${session.title}`}
                        className={`${iconButtonClass} hover:border-rose-100 hover:bg-rose-50 hover:text-rose-700`}
                        disabled={!connected || Boolean(activeRequestId)}
                        onClick={() => setPendingSessionDeleteId(session.sessionId)}
                        title="删除会话"
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-slate-200 p-3 text-slate-500">暂无已保存会话</p>
            )}
          </details>
        </div>
        <section
          aria-live="polite"
          className="mx-2.5 mb-2.5 flex-1 space-y-4 overflow-y-auto rounded-lg border border-[#d5dce7] bg-[#f7f9fc] p-2.5"
          data-testid="conversation"
        >
          {sessionHistoryTruncated ? (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              较早消息已摘要或因消息大小限制未在面板中展开。
            </p>
          ) : null}
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#b8c2d0] bg-white p-5 text-center text-sm text-[#65738a]">
              输入一条消息，开始询问当前 GitHub 页面。
            </div>
          ) : (
            groupConversation(messages).map((turn) => {
              const collapsed = collapsedTurnIds.has(turn.id);
              const questionLabel = turn.question?.content.slice(0, 80);
              return (
                <div className="space-y-2.5" key={turn.id}>
                  {turn.question ? (
                    <article className="ml-6 flex items-start gap-2.5 rounded-lg rounded-tr-sm border border-[#b7c2cd] bg-[#c7d0d9] p-2.5 text-sm leading-6 text-[#172238] shadow-sm">
                      <button
                        aria-expanded={!collapsed}
                        aria-label={`${collapsed ? '展开' : '收起'}问答：${questionLabel}`}
                        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#526173] transition hover:bg-[#b7c2cd] hover:text-[#172238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b87]/30"
                        onClick={() =>
                          setCollapsedTurnIds((current) => {
                            const next = new Set(current);
                            if (next.has(turn.id)) {
                              next.delete(turn.id);
                            } else {
                              next.add(turn.id);
                            }
                            return next;
                          })
                        }
                        title={collapsed ? '展开这轮问答' : '收起这轮问答'}
                        type="button"
                      >
                        <ChevronIcon className={collapsed ? '' : 'rotate-90'} />
                      </button>
                      <p className="min-w-0 whitespace-pre-wrap break-words">
                        {turn.question.content}
                      </p>
                    </article>
                  ) : null}
                  {!collapsed
                    ? turn.replies.map((reply) => (
                        <article
                          className="mr-6 overflow-hidden rounded-lg rounded-tl-sm border border-[#d5dce7] bg-white text-sm leading-6 shadow-[0_2px_8px_rgba(23,34,56,0.06)]"
                          key={reply.id}
                        >
                          {turn.question && sessionId ? (
                            <div
                              className="flex min-h-9 items-center justify-end border-b border-slate-100 bg-slate-50/70 px-2 py-1"
                              data-testid="turn-actions"
                            >
                              {pendingTurnDeleteId === turn.id ? (
                                <span
                                  aria-label={`确认是否删除问答：${questionLabel}`}
                                  className="flex items-center gap-1"
                                  role="group"
                                >
                                  <span className="mr-1 text-xs text-rose-700">删除这轮问答？</span>
                                  <button
                                    aria-label={`确认删除问答：${questionLabel}`}
                                    className={`${iconButtonClass} text-rose-700 hover:bg-rose-100 hover:text-rose-800`}
                                    disabled={!connected || Boolean(activeRequestId)}
                                    onClick={() => {
                                      connection.current?.deleteTurn?.(
                                        sessionId,
                                        turn.question!.id,
                                      );
                                      setPendingTurnDeleteId(undefined);
                                    }}
                                    title="确认删除"
                                    type="button"
                                  >
                                    <CheckIcon />
                                  </button>
                                  <button
                                    aria-label={`取消删除问答：${questionLabel}`}
                                    className={iconButtonClass}
                                    onClick={() => setPendingTurnDeleteId(undefined)}
                                    title="取消删除"
                                    type="button"
                                  >
                                    <CloseIcon />
                                  </button>
                                </span>
                              ) : (
                                <button
                                  aria-label={`删除问答：${questionLabel}`}
                                  className={`${iconButtonClass} hover:border-rose-100 hover:bg-rose-50 hover:text-rose-700`}
                                  disabled={!connected || Boolean(activeRequestId)}
                                  onClick={() => setPendingTurnDeleteId(turn.id)}
                                  title="删除这轮问答"
                                  type="button"
                                >
                                  <TrashIcon />
                                </button>
                              )}
                            </div>
                          ) : null}
                          <div className="p-3">
                            <MarkdownMessage content={reply.content} />
                          </div>
                        </article>
                      ))
                    : null}
                </div>
              );
            })
          )}
        </section>

        <form
          className="sticky bottom-0 z-10 border-t border-[#d5dce7] bg-white/95 p-2.5 backdrop-blur"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="panel-message">
            输入问题
          </label>
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border border-[#d5dce7] bg-white p-2.5 text-sm leading-6 text-[#172238] shadow-[0_2px_8px_rgba(23,34,56,0.08)] outline-none transition placeholder:text-[#8b97a8] focus:border-[#176b87] focus:ring-2 focus:ring-[#176b87]/15"
            id="panel-message"
            maxLength={8_000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="问问当前 GitHub 页面……"
            ref={questionInput}
            value={draft}
          />
          <p className="mt-1.5 text-xs text-[#65738a]">Enter 发送 · Shift+Enter 换行</p>
          {activeRequestId ? (
            <button
              className={`${secondaryButtonClass} mt-2 w-full border-rose-300 text-rose-700`}
              onClick={() => connection.current?.abort(activeRequestId)}
              type="button"
            >
              停止生成
            </button>
          ) : (
            <button
              className={`${primaryButtonClass} mt-2 w-full`}
              disabled={
                !connected || !draft.trim() || pickStatus === 'active' || regionStatus === 'active'
              }
              type="submit"
            >
              发送
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
