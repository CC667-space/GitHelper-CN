import React, { useEffect, useRef, useState } from 'react';

import type { ProviderId } from '../lib/types';
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

export function PanelApp({
  connect = connectPanel,
}: {
  connect?: typeof connectPanel;
}): React.JSX.Element {
  const connection = useRef<PanelConnection>();
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const [conversationExpanded, setConversationExpanded] = useState(true);
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
    if (!conversationExpanded || !focusComposerRequested) {
      return;
    }
    questionInput.current?.focus();
    questionInput.current?.scrollIntoView?.({ block: 'nearest' });
    setFocusComposerRequested(false);
  }, [conversationExpanded, focusComposerRequested]);

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
    connection.current?.search?.(text, searchTarget);
  }

  function focusQuestionInput(): void {
    setConversationExpanded(true);
    setFocusComposerRequested(true);
  }

  return (
    <main
      className="flex min-h-screen flex-col bg-slate-50 text-slate-900"
      data-testid="side-panel"
    >
      <header className="border-b border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">GitHelper-CN</h1>
          <span
            className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
            title={connected ? 'Background 已连接' : 'Background 未连接'}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium text-slate-600">
            文本 Provider
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
              onChange={(event) => selectTextProvider(event.target.value as ProviderId)}
              value={selectedTextProviderId ?? ''}
            >
              <option disabled value="">
                尚未配置
              </option>
              {providers.map((provider) => (
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
          <label className="block text-xs font-medium text-slate-600">
            视觉 Provider
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
              onChange={(event) => selectVisionProvider(event.target.value as ProviderId)}
              value={selectedVisionProviderId ?? ''}
            >
              <option disabled value="">
                尚未验证
              </option>
              {providers.map((provider) => (
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
        <p className="mt-2 truncate text-xs text-slate-500" title={pageLabel}>
          {pageLabel}
        </p>
        <div className="mt-3">
          {pickStatus === 'active' ? (
            <button
              className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              onClick={() => connection.current?.cancelPick?.()}
              type="button"
            >
              取消点击选择
            </button>
          ) : (
            <button
              className="w-full rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!connected || Boolean(activeRequestId)}
              onClick={() => connection.current?.startPick?.()}
              type="button"
            >
              {selectedElement ? '重新选择页面元素' : '点击页面元素提问'}
            </button>
          )}
          {pickStatusMessage ? (
            <p className="mt-1 text-xs text-amber-700">{pickStatusMessage}</p>
          ) : null}
          {selectedElement ? (
            <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0">
                  已选择 &lt;{selectedElement.tag}&gt;：
                  <span className="break-words">
                    {selectedElement.text || selectedElement.attrs['aria-label'] || '无文本元素'}
                  </span>
                </p>
                <button className="shrink-0 underline" onClick={clearSelectedElement} type="button">
                  清除
                </button>
              </div>
              <button
                className="mt-2 w-full rounded border border-blue-300 bg-white px-2 py-1.5 text-blue-900"
                onClick={focusQuestionInput}
                type="button"
              >
                下一步：输入问题
              </button>
            </div>
          ) : null}
          {regionStatus === 'active' ? (
            <button
              className="mt-2 w-full rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900"
              onClick={() => connection.current?.cancelRegion?.()}
              type="button"
            >
              取消区域框选
            </button>
          ) : (
            <button
              className="mt-2 w-full rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!connected || Boolean(activeRequestId) || pickStatus === 'active'}
              onClick={() => connection.current?.startRegion?.()}
              type="button"
            >
              {selectedRegion ? '重新框选页面区域' : '框选页面区域提问'}
            </button>
          )}
          {regionStatusMessage ? (
            <p className="mt-1 text-xs text-violet-700">{regionStatusMessage}</p>
          ) : null}
          {selectedRegion ? (
            <div className="mt-2 rounded-md border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900">
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
                <button className="shrink-0 underline" onClick={clearSelectedRegion} type="button">
                  清除
                </button>
              </div>
              <button
                className="mt-2 w-full rounded border border-violet-300 bg-white px-2 py-1.5 text-violet-900"
                onClick={focusQuestionInput}
                type="button"
              >
                下一步：输入问题
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white p-3" data-testid="repository-analysis">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">当前仓库分析</h2>
          <div className="flex items-center gap-2">
            <button
              aria-expanded={analysisExpanded}
              className="rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-700"
              onClick={() => setAnalysisExpanded((expanded) => !expanded)}
              type="button"
            >
              {analysisExpanded ? '收起分析' : '展开分析'}
            </button>
            <button
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
              disabled={!connected || analysisStatus === 'analyzing' || Boolean(activeRequestId)}
              onClick={() => {
                setAnalysisExpanded(true);
                connection.current?.analyzeRepository?.(selectedTextProviderId);
              }}
              type="button"
            >
              {analysisStatus === 'analyzing' ? '分析中…' : '一键分析'}
            </button>
          </div>
        </div>
        {analysisExpanded ? (
          <>
            <p className="mt-1 text-xs text-slate-500">
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
                className="mt-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/30 p-3 text-xs"
                data-testid="repository-analysis-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{analysisCard.repository}</h3>
                    <p className="mt-1 text-slate-600">{analysisCard.purpose}</p>
                  </div>
                  <button
                    className="shrink-0 rounded border border-emerald-400 px-2 py-1 text-emerald-900"
                    onClick={() => connection.current?.openGitHubPage?.(analysisCard.url)}
                    type="button"
                  >
                    打开仓库
                  </button>
                </div>

                <section
                  className="rounded border border-emerald-100 bg-white p-2"
                  data-testid="repository-quick-scan"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-medium">README 速览</h4>
                    <span className="text-[11px] text-slate-500">
                      {analysisCard.quickScan.source === 'readme'
                        ? '来自受限 README 片段'
                        : analysisCard.quickScan.source === 'description'
                          ? 'README 未取得，使用仓库简介'
                          : '可用资料有限'}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">
                    {analysisCard.quickScan.readmeSummary}
                  </p>
                </section>

                <section className="rounded bg-white p-2">
                  <h4 className="font-medium">主要功能</h4>
                  {analysisCard.quickScan.features.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                      {analysisCard.quickScan.features.map((feature, index) => (
                        <li key={`${index}:${feature.slice(0, 40)}`}>{feature}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-slate-500">未从受限 README 片段识别出明确功能清单</p>
                  )}
                </section>

                <section className="rounded bg-white p-2">
                  <h4 className="font-medium">文件、配置与实现</h4>
                  {analysisCard.quickScan.configuration.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                      {analysisCard.quickScan.configuration.map((item, index) => (
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
                  {analysisCard.structure.keyFiles.length ? (
                    <ul className="mt-2 space-y-2">
                      {analysisCard.structure.keyFiles.map((file) => (
                        <li className="rounded border border-slate-200 p-2" key={file.path}>
                          <p className="break-all font-medium">
                            <code>{file.path}</code>
                            <span className="ml-1 font-normal text-slate-500">· {file.role}</span>
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
                  {analysisCard.quickScan.implementation.length ? (
                    <>
                      <p className="mt-2 font-medium text-slate-700">简单实现分析</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                        {analysisCard.quickScan.implementation.map((item, index) => (
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

                <section className="rounded bg-white p-2">
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
                  <h4 className="font-medium">风险</h4>
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

                <details
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1"
                  data-testid="repository-facts"
                >
                  <summary className="cursor-pointer py-1 font-medium text-slate-700">
                    仓库事实（Star、语言、Release 等）
                  </summary>
                  <div className="space-y-3 border-t border-slate-200 py-2">
                    <dl className="grid grid-cols-2 gap-2">
                      <div className="rounded bg-white p-2">
                        <dt className="text-slate-500">Star / Fork / Watch</dt>
                        <dd className="mt-1 font-medium">
                          {displayCount(analysisCard.popularity.stars)} /{' '}
                          {displayCount(analysisCard.popularity.forks)} /{' '}
                          {displayCount(analysisCard.popularity.watchers)}
                        </dd>
                      </div>
                      <div className="rounded bg-white p-2">
                        <dt className="text-slate-500">开放 Issue / PR</dt>
                        <dd className="mt-1 font-medium">
                          {displayCount(analysisCard.issuesAndPullRequests.openIssues)} /{' '}
                          {displayCount(analysisCard.issuesAndPullRequests.openPullRequests)}
                        </dd>
                      </div>
                      <div className="rounded bg-white p-2">
                        <dt className="text-slate-500">最后推送</dt>
                        <dd className="mt-1 font-medium">
                          {displayDate(analysisCard.activity.pushedAt)}
                        </dd>
                      </div>
                      <div className="rounded bg-white p-2">
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

                    <section className="rounded bg-white p-2">
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

      <section className="border-b border-slate-200 bg-white p-3" data-testid="github-search">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">中文搜索 GitHub</h2>
          <span className="text-xs text-emerald-700">不调用 AI Provider</span>
        </div>
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
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
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
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
              id="github-search-target"
              onChange={(event) => setSearchTarget(event.target.value as SearchTarget)}
              value={searchTarget}
            >
              <option value="auto">自动判断仓库 / Issue</option>
              <option value="repositories">仅仓库</option>
              <option value="issues">仅 Issue</option>
            </select>
            <button
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
              disabled={!connected || !searchDraft.trim() || searchStatus === 'searching'}
              type="submit"
            >
              {searchStatus === 'searching' ? '搜索中…' : '搜索'}
            </button>
          </div>
        </form>
        {searchError ? (
          <p className="mt-2 rounded-md bg-rose-50 p-2 text-xs text-rose-800">{searchError}</p>
        ) : null}
        {searchResult ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-md bg-slate-100 p-2 text-xs text-slate-700">
              <p>{searchResult.conversion.explanation}</p>
              <code className="mt-1 block break-all text-blue-800">
                {searchResult.conversion.query}
              </code>
              <p className="mt-1">
                {searchResult.status === 'ok'
                  ? `GitHub API 共返回 ${searchResult.totalCount.toLocaleString('zh-CN')} 条，显示前 ${searchResult.items.length} 条。`
                  : searchResult.notice}
              </p>
            </div>
            {searchResult.items.map((item) => (
              <article
                className="rounded-md border border-slate-200 bg-white p-2 text-xs"
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
                  <button
                    className="shrink-0 rounded border border-blue-300 px-2 py-1 text-blue-800"
                    onClick={() => connection.current?.openGitHubPage?.(item.url)}
                    type="button"
                  >
                    打开
                  </button>
                </div>
              </article>
            ))}
            {searchResult.localResults?.length ? (
              <div className="rounded-md border border-slate-200 bg-white p-2 text-xs">
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
                className="w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                onClick={() => connection.current?.openGitHubPage?.(searchResult.fallbackUrl!)}
                type="button"
              >
                在 GitHub 网页继续搜索
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-1 flex-col bg-slate-50" data-testid="question-answer">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold">问答</h2>
          <button
            aria-expanded={conversationExpanded}
            className="rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-700"
            onClick={() => setConversationExpanded((expanded) => !expanded)}
            type="button"
          >
            {conversationExpanded ? '收起问答' : '展开问答'}
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-200 bg-white px-3 pb-3">
          <label className="block min-w-0 text-xs font-medium text-slate-600">
            当前会话
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
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
            className="self-end rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            disabled={!connected || Boolean(activeRequestId)}
            onClick={() => {
              beginNewSession();
              setConversationExpanded(true);
              connection.current?.newSession?.();
            }}
            type="button"
          >
            新建会话
          </button>
          <details className="col-span-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
            <summary className="cursor-pointer py-1 text-slate-700">
              管理会话（{recentSessions.length}）
            </summary>
            {recentSessions.length ? (
              <ul className="mt-1 space-y-1 border-t border-slate-200 pt-1">
                {recentSessions.map((session) => (
                  <li className="flex items-center gap-1" key={session.sessionId}>
                    <button
                      aria-current={session.sessionId === sessionId ? 'true' : undefined}
                      className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-white"
                      disabled={!connected || Boolean(activeRequestId)}
                      onClick={() => connection.current?.selectSession?.(session.sessionId)}
                      title={`${session.title}${session.repository ? ` · ${session.repository}` : ''}`}
                      type="button"
                    >
                      {session.title}
                      {session.repository ? ` · ${session.repository}` : ''}
                    </button>
                    {pendingSessionDeleteId === session.sessionId ? (
                      <span className="flex shrink-0 gap-1" role="group">
                        <button
                          aria-label={`确认删除会话：${session.title}`}
                          className="rounded px-2 py-1 text-rose-700 hover:bg-rose-50"
                          disabled={!connected || Boolean(activeRequestId)}
                          onClick={() => {
                            connection.current?.deleteSession?.(session.sessionId);
                            setPendingSessionDeleteId(undefined);
                          }}
                          title="确认删除"
                          type="button"
                        >
                          ✓
                        </button>
                        <button
                          aria-label={`取消删除会话：${session.title}`}
                          className="rounded px-2 py-1 text-slate-600 hover:bg-white"
                          onClick={() => setPendingSessionDeleteId(undefined)}
                          title="取消删除"
                          type="button"
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <button
                        aria-label={`删除会话：${session.title}`}
                        className="shrink-0 rounded px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                        disabled={!connected || Boolean(activeRequestId)}
                        onClick={() => setPendingSessionDeleteId(session.sessionId)}
                        title="删除会话"
                        type="button"
                      >
                        🗑
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-slate-200 py-2 text-slate-500">暂无已保存会话</p>
            )}
          </details>
        </div>
        {conversationExpanded ? (
          <>
            <section
              aria-live="polite"
              className="flex-1 space-y-3 overflow-y-auto p-3"
              data-testid="conversation"
            >
              {sessionHistoryTruncated ? (
                <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  较早消息已摘要或因消息大小限制未在面板中展开。
                </p>
              ) : null}
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  输入一条消息，开始询问当前 GitHub 页面。
                </div>
              ) : (
                groupConversation(messages).map((turn) => {
                  const collapsed = collapsedTurnIds.has(turn.id);
                  const questionLabel = turn.question?.content.slice(0, 80);
                  return (
                    <div className="space-y-3" key={turn.id}>
                      {turn.question ? (
                        <article className="ml-8 flex items-start gap-2 rounded-lg bg-slate-900 p-3 text-sm text-white">
                          <button
                            aria-expanded={!collapsed}
                            aria-label={`${collapsed ? '展开' : '收起'}问答：${questionLabel}`}
                            className="shrink-0 rounded px-1 text-base leading-5 hover:bg-slate-700"
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
                            {collapsed ? '>' : '∨'}
                          </button>
                          <p className="min-w-0 whitespace-pre-wrap break-words">
                            {turn.question.content}
                          </p>
                        </article>
                      ) : null}
                      {!collapsed
                        ? turn.replies.map((reply) => (
                            <article
                              className="relative mr-8 rounded-lg border border-slate-200 bg-white p-3 pr-11 text-sm"
                              key={reply.id}
                            >
                              {turn.question && sessionId ? (
                                <div className="absolute right-2 top-2 flex justify-end">
                                  {pendingTurnDeleteId === turn.id ? (
                                    <span className="flex gap-1" role="group">
                                      <button
                                        aria-label={`确认删除问答：${questionLabel}`}
                                        className="rounded px-2 py-1 text-rose-700 hover:bg-rose-50"
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
                                        ✓
                                      </button>
                                      <button
                                        aria-label={`取消删除问答：${questionLabel}`}
                                        className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                                        onClick={() => setPendingTurnDeleteId(undefined)}
                                        title="取消删除"
                                        type="button"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      aria-label={`删除问答：${questionLabel}`}
                                      className="rounded px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                      disabled={!connected || Boolean(activeRequestId)}
                                      onClick={() => setPendingTurnDeleteId(turn.id)}
                                      title="删除这轮问答"
                                      type="button"
                                    >
                                      🗑
                                    </button>
                                  )}
                                </div>
                              ) : null}
                              <MarkdownMessage content={reply.content} />
                            </article>
                          ))
                        : null}
                    </div>
                  );
                })
              )}
            </section>

            <form
              className="border-t border-slate-200 bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label className="sr-only" htmlFor="panel-message">
                输入问题
              </label>
              <textarea
                className="min-h-20 w-full resize-y rounded-md border border-slate-300 p-2 text-sm"
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
              <p className="mt-1 text-xs text-slate-500">Enter 发送 · Shift+Enter 换行</p>
              {activeRequestId ? (
                <button
                  className="mt-2 w-full rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700"
                  onClick={() => connection.current?.abort(activeRequestId)}
                  type="button"
                >
                  停止生成
                </button>
              ) : (
                <button
                  className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
                  disabled={
                    !connected ||
                    !draft.trim() ||
                    pickStatus === 'active' ||
                    regionStatus === 'active'
                  }
                  type="submit"
                >
                  发送
                </button>
              )}
            </form>
          </>
        ) : (
          <p className="p-3 text-xs text-slate-500">问答已收起；展开后可继续当前会话。</p>
        )}
      </section>
    </main>
  );
}
