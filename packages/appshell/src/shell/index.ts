export {
  EditorShellProvider,
  useEditorShell,
  useOptionalEditorShell,
  type EditorShellContextValue,
} from './editor-shell.context';
export { ThemeContextProvider, useTheme, type ThemePreference } from '../context/theme.provider';
export { createDefaultSimulate } from './default-simulate';
export { createExecuteSimulate } from './execute-simulate';
export type { EditorShellOptions, SimulateHandler, ShellSimulateResult } from './types';
export { GraphPersistenceError } from './persistence';
export { createGraphsHttpAdapter } from './graphs-http-adapter';
export { createIndexedDbAdapter, AUTO_VERSIONS_KEEP } from './indexed-db-adapter';
export { restoreVersion } from './restore';
export {
  createAutoPersistController,
  useAutoPersist,
  stableStringify,
  type AutoPersistController,
  type AutoPersistControllerOptions,
  type AutoPersistEvent,
  type AutoPersistPolicy,
  type AutoPersistRecordMeta,
  type AutoPersistSnapshot,
  type AutoPersistState,
  type AutoPersistStatus,
  type UseAutoPersistOptions,
} from './auto-persist';
export type { GraphPersistenceAdapter, GraphRecord, GraphRecordMeta, PersistenceErrorCode } from './persistence';
