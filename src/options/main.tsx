import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

import '../global.css';

function Options(): React.JSX.Element {
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
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">GitHelper-CN 设置</h1>
      <p className="mt-2 text-sm text-slate-600">Provider 与偏好设置将在后续阶段接入。</p>
      <button
        id="phase0-open-side-panel"
        className="mt-4 rounded bg-slate-900 px-3 py-2 text-sm text-white"
        type="button"
        onClick={() => void openProbeSidePanel()}
      >
        验证 Side Panel
      </button>
      <p className="mt-2 text-sm" data-testid="phase0-side-panel-status">
        {probeStatus}
      </p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
