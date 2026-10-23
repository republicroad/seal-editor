import React from 'react';
import { createRoot } from 'react-dom/client';

import { DirectoryPage } from './directory-page';
import './playground.css';
// kernel 源码直通（vite alias）时其 src/index.ts 已自带样式导入，无需再引 dist/style.css
import './theme.css';

// MPA 目录页入口（index.html）：纯导航，不引 monaco。
// 各实例入口见 src/entries/*.tsx（graph/table 实例各自接线 monaco worker）。
// ADR-023 #4：ISLAND 形态挂载（2.0 前置）——body.seal-root 使 LEGACY :root 接管退役安全
if (typeof document !== 'undefined') {
  document.body.classList.add('seal-root');
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DirectoryPage />
  </React.StrictMode>,
);
