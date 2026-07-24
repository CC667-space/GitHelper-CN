import React, { useEffect, useRef } from 'react';

import type { ProviderId } from '../lib/types';
import type { SearchTarget } from '../lib/github-search';
import { connectPanel, type PanelConnection } from './connection';
import { MarkdownMessage } from './MarkdownMessage';
import { usePanelStore } from './store';

export function PanelApp({
  connect = connectPanel,
}: {
  connect?: typeof connectPanel;
}): React.JSX.Element {
  const connection = useRef<PanelConnection>();
  const {
    connected,
    draft,
    messages,
    sessionHistoryTruncated,
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
    selectedTextProviderId,
    selectedVisionProviderId,
    activeRequestId,
    addUserMessage,
    applyProviderState,
    applyPickState,
    applyRegionState,
    applySessionState,
    applySearchState,
    applyStreamEvent,
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
    applyProviderState,
    applySessionState,
    applyStreamEvent,
    connect,
    setConnected,
  ]);

  function submit(): void {
    const text = draft.trim();
    if (!text || !connection.current || !connected) {
      return;
    }
    addUserMessage(text);
    if (selectedRegion) {
      connection.current.send(
        text,
        selectedRegion.needsVision ? selectedVisionProviderId : selectedTextProviderId,
        undefined,
        selectedRegion,
      );
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
            </div>
          ) : null}
        </div>
      </header>

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
            输入一条消息，验证 Panel → Background → Content → Panel 通信链路。
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`rounded-lg p-3 text-sm ${
                message.role === 'user'
                  ? 'ml-8 bg-slate-900 text-white'
                  : 'mr-8 border border-slate-200 bg-white'
              }`}
              key={message.id}
            >
              {message.role === 'assistant' ? (
                <MarkdownMessage content={message.content} />
              ) : (
                message.content
              )}
            </article>
          ))
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
              !connected || !draft.trim() || pickStatus === 'active' || regionStatus === 'active'
            }
            type="submit"
          >
            发送
          </button>
        )}
      </form>
    </main>
  );
}
