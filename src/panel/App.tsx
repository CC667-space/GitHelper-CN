import React, { useEffect, useRef } from 'react';

import { connectPanel, type PanelConnection } from './connection';
import { usePanelStore } from './store';

export function PanelApp(): React.JSX.Element {
  const connection = useRef<PanelConnection>();
  const {
    connected,
    draft,
    messages,
    pageLabel,
    providerLabel,
    addUserMessage,
    applyStreamEvent,
    setConnected,
    setDraft,
  } = usePanelStore();

  useEffect(() => {
    const activeConnection = connectPanel(applyStreamEvent, setConnected);
    connection.current = activeConnection;
    return () => activeConnection.disconnect();
  }, [applyStreamEvent, setConnected]);

  function submit(): void {
    const text = draft.trim();
    if (!text || !connection.current || !connected) {
      return;
    }
    addUserMessage(text);
    connection.current.send(text);
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
        <label className="mt-3 block text-xs font-medium text-slate-600" htmlFor="provider">
          当前 Provider
        </label>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-2 py-2 text-sm"
          disabled
          id="provider"
          value="placeholder"
        >
          <option value="placeholder">{providerLabel}</option>
        </select>
        <p className="mt-2 truncate text-xs text-slate-500" title={pageLabel}>
          {pageLabel}
        </p>
      </header>

      <section
        aria-live="polite"
        className="flex-1 space-y-3 overflow-y-auto p-3"
        data-testid="conversation"
      >
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
              {message.content}
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
          placeholder="问问当前 GitHub 页面……"
          value={draft}
        />
        <button
          className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
          disabled={!connected || !draft.trim()}
          type="submit"
        >
          发送
        </button>
      </form>
    </main>
  );
}
