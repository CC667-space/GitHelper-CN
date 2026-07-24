import React, { useEffect, useRef } from 'react';

import type { ProviderId } from '../lib/types';
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
    selectedTextProviderId,
    selectedVisionProviderId,
    activeRequestId,
    addUserMessage,
    applyProviderState,
    applySessionState,
    applyStreamEvent,
    selectTextProvider,
    selectVisionProvider,
    setConnected,
    setDraft,
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
    );
    connection.current = activeConnection;
    return () => {
      active = false;
      if (connection.current === activeConnection) {
        connection.current = undefined;
      }
      activeConnection.disconnect();
    };
  }, [applyProviderState, applySessionState, applyStreamEvent, connect, setConnected]);

  function submit(): void {
    const text = draft.trim();
    if (!text || !connection.current || !connected) {
      return;
    }
    addUserMessage(text);
    connection.current.send(text, selectedTextProviderId);
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
      </header>

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
            disabled={!connected || !draft.trim()}
            type="submit"
          >
            发送
          </button>
        )}
      </form>
    </main>
  );
}
