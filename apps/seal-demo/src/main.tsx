import '@republicroad/seal-appshell/dist/style.css';
import '@republicroad/seal-editor/dist/style.css';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
