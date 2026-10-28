import { loader } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';

declare global {
  interface Window {
    monaco?: Monaco;
  }
}

let configured: Promise<void> | null = null;

/** 宿主自配 loader（paths 指向自有 monaco 资产等）后调用：configureMonaco 让位 */
let externalConfigured = false;
export const markMonacoConfigured = (): void => {
  externalConfigured = true;
  configured ??= Promise.resolve();
};

/**
 * monaco 装配（本地加载，CDN 废黜）：
 * 1. 宿主已全局注入 monaco（script tag）→ 直接采用（最高优先级，兼容既有宿主）；
 * 2. 否则动态导入 peer 的 monaco-editor（external：运行时解析到宿主安装的
 *    monaco-editor，dist 零体积增量）→ loader.config。**零 CDN 请求。**
 *
 * 务必经本函数等待配置完成后再挂载 @monaco-editor/react 的 Editor——
 * config 晚于 loader.init() 会走 CDN 注入（竞态）。编辑器统一经
 * `helpers/monaco-editor.tsx` 的门控包装挂载，勿直挂。
 *
 * worker（语言服务）：
 * - 不设 MonacoEnvironment——worker 归宿主装配：宿主应用（verdict/playground）
 *   用标准三行把自己 bundle 的 worker 交给 monaco：
 *     import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
 *     self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
 *   未装配时 monaco 回退主线程（console 会有告警；编辑/基础功能不受影响——
 *   实测编辑器正常渲染）。自含 inline worker 方案实测 dist +6.1MB，过重否决。
 * - 宿主 CSP 注意：worker 装配需 `worker-src self blob:`。
 */
export function configureMonaco(): Promise<void> {
  if (externalConfigured) {
    return configured ?? Promise.resolve();
  }
  configured ??= (async () => {
    if (self.monaco) {
      loader.config({ monaco: self.monaco });
      return;
    }

    const monaco = await import('monaco-editor');
    loader.config({ monaco });
  })();
  return configured;
}
