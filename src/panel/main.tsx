import React from 'react';
import ReactDOM from 'react-dom/client';

import '../global.css';
import { PanelApp } from './App';
import { installPanelFontSizePreference } from './font-size';

void installPanelFontSizePreference(document.documentElement).catch(() => undefined);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>,
);
