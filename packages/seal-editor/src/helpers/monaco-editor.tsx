import { DiffEditor as UiDiffEditor, Editor as UiEditor, useMonaco } from '@monaco-editor/react';
import type { DiffEditorProps, EditorProps, Monaco } from '@monaco-editor/react';
import React, { useEffect, useState } from 'react';

import { configureMonaco } from './monaco';

/**
 * @monaco-editor/react 的门控包装：先等 configureMonaco()（本地 peer 导入 +
 * loader.config）完成再挂载 Editor——直挂会在 config 落定前触发 loader.init()
 * 的 CDN 注入（竞态）。所有 monaco 编辑器经此挂载，勿直引 @monaco-editor/react。
 *
 * jsdom（vitest）旁路：测试用 vi.mock('@monaco-editor/react') 供假件且不应
 * 触发 monaco 的 node 导入——门控立即放行。
 */
const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');

function useMonacoConfigured(): boolean {
  const [ready, setReady] = useState(() => isJsdom || Boolean(window.monaco));
  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    void configureMonaco().then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

export const Editor: React.FC<EditorProps> = (props) => {
  const ready = useMonacoConfigured();
  if (!ready) {
    return <>{props.loading ?? null}</>;
  }
  return <UiEditor {...props} />;
};

export const DiffEditor: React.FC<DiffEditorProps> = (props) => {
  const ready = useMonacoConfigured();
  if (!ready) {
    return <>{props.loading ?? null}</>;
  }
  return <UiDiffEditor {...props} />;
};

/** 透传：调用方在 Editor 挂载后使用（门控保证此时 loader 已就绪） */
export { useMonaco };
export type { Monaco };
