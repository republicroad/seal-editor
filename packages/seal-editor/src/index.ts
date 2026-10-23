// ADR-007: entry-first guard polyfill (randomUUID in non-secure contexts)
// — must stay ahead of every component module so ID generation can never
// throw before the editor mounts.
import './polyfills';
import './styles/tailwind.css';
import './styles/tokens.css';

export * from './components';
export * from './theme';
export { I18nProvider, useT, createT, type I18nMessages } from './theming/i18n';

export { codemirror } from './helpers/codemirror';
export { useNodeType } from './helpers/node-type';
export { usePersistentState } from './helpers/use-persistent-state';
export { ensureWasmLoaded, useWasmReady } from './helpers/wasm';
export * from './helpers/schema';

// ADR-023 D2 第一步（1.x 迁移窗口）：LEGACY :root token 注入将在 2.0 退役——
// 未挂 .seal-root 的宿主此告警即迁移信号（挂载后本告警消失）。
if (typeof document !== 'undefined' && !document.querySelector('.seal-root')) {
  console.warn(
    '[seal-editor] LEGACY token injection is active (no .seal-root wrapper found) — ' +
      'wrap your app in .seal-root before v2.0. See ADR-023.',
  );
}
