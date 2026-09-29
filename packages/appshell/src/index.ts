/**
 * 内核全量透传（默认出口）：宿主从此单入口 `from '@republicroad/seal-appshell'`
 * 即可拿到 kernel+appshell 全部公开面。构建期内核 JS/dts 均外置——本行只是
 * 指针，不内联代码或类型。
 *
 * 命名规则（ESM 语义）：显式导出优先于星导出——本文件随后的 appshell 显式
 * 导出与内核撞名时本地静默胜出。当前零撞名（2026-09-29 全量扫描）；新增
 * appshell 公共导出前请比对内核面（scripts/check-export-collisions.mjs）。
 */
export * from '@republicroad/seal-editor';

export * from './context/theme.provider';
export { useCustomNodes, type UseCustomNodesOptions } from './hooks/useCustomNodes';
export { applyNodeOverrides } from './skin/apply';
export { mapToolbarSlots } from './skin/layout';
export * from './skin/types';
export { SkinnedDecisionGraph, type SkinnedDecisionGraphProps } from './components/skinned-decision-graph';
export { SyncStatusBadge, type SyncStatusBadgeProps } from './components/sync-status-badge';
export { FunctionCatalog } from './components/function-catalog/function-catalog';
export { FunctionRepl, type ReplExecuteResult, type ReplExecutor } from './components/function-repl/function-repl';
export type { CatalogFilter, CatalogFilterRef } from './hooks/useCustomNodes';
export {
  dedicatedFunctionRegistry,
  dedupeByDedicatedRegistry,
  unsupportedDedicatedNodes,
  type DedicatedFunctionRegistration,
} from './lib/dedicated-node-registry';
export {
  migrateGraph,
  type MigrationChain,
  type MigrationReportEntry,
  type MigrateGraphResult,
} from './lib/migrate-graph';
export type { AutoPersistBridgeOptions } from './components/skinned-decision-graph';
export { ShellHeader, type ShellHeaderProps } from './components/shell-header';
export * from './lib/custom-node-plans';
export * from './lib/custom-node-schema-source';
export * from './lib/custom-node-types';
export {
  CUSTOM_FUNCTION_GROUP,
  LEGACY_UDF_KIND,
  createSpecNode,
  createLegacyUdfNode,
  schemaToCustomNodes,
  fetchCustomNodeSchema,
  parseCustomNodeSchemaPayload,
  uid,
  type CustomNodeSpec,
  type CustomNodeSchemaSource,
} from './lib/custom-node-registry';
export * from './lib/user-resolver';
export * from './lib/roster-source';
export * from './lib/http-request-protocol';
export * from './lib/json-path-protocol';
export * from './lib/crypto-protocol';
export * from './shell';
export { HttpRequestTab, httpRequestNode } from './components/custom-node/http-request-node';
export { QueryListTab, queryListNode } from './components/custom-node/query-list-node';
export { CryptoTab, cryptoNode } from './components/custom-node/crypto-node';
export { CurrentDateTab, currentDateNode } from './components/custom-node/current-date-node';
export { KeyValueEditor } from './components/custom-node/key-value-editor';
export { LockedCornerBadge } from './components/custom-node/locked-corner-badge';
export {
  VersionHistoryPanel,
  type VersionHistoryPanelProps,
  type VersionHistoryEntry,
} from './components/version-history/version-history-panel';
