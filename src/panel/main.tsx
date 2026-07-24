import React from 'react';
import ReactDOM from 'react-dom/client';

import '../global.css';
import { PanelApp } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>,
);
