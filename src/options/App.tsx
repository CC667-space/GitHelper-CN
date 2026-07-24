import React, { useState } from 'react';

export function OptionsApp(): React.JSX.Element {
  const [probeStatus, setProbeStatus] = useState('待验证');

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

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">GitHelper-CN 设置</h1>
        <p className="mt-2 text-sm text-slate-600">
          Provider 凭据与偏好将在后续阶段接入；当前页面不读取或显示任何已存 Key。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="font-medium">数据流向披露</h2>
        <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-2 text-sm">
          <dt className="text-slate-500">当前 Provider</dt>
          <dd>尚未配置</dd>
          <dt className="text-slate-500">目标 Host</dt>
          <dd>尚未选择</dd>
          <dt className="text-slate-500">发送内容</dt>
          <dd>仅在用户明确提交后，发送最小必要上下文</dd>
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
