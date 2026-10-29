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
