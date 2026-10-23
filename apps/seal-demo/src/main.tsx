import '@republicroad/seal-appshell/dist/style.css';
import '@republicroad/seal-editor/dist/style.css';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

// ADR-023 #4：ISLAND 形态挂载（2.0 前置）——body.seal-root 使 LEGACY :root 接管退役安全
if (typeof document !== 'undefined') {
  document.body.classList.add('seal-root');
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
