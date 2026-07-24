import React from 'react';
import ReactDOM from 'react-dom/client';

import '../global.css';

function Panel(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-slate-50 p-4" data-testid="side-panel">
      <h1 className="text-lg font-semibold text-slate-900">GitHelper-CN</h1>
      <p className="mt-2 text-sm text-slate-600">Phase 0 技术探针面板</p>
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
        Side Panel 已加载
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);
