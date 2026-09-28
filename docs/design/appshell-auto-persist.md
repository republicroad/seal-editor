# appshell 自动持久化与冲突版本化 · 通用接口机制设计

- 日期：2026-09-27
- 状态：**设计中（已裁决，实施排期待定）**——宿主裁决：weaveseal 目标态为模式 D（连续持久化，无 dirty，见 [ADR-008](../adr/008-host-experience-proposals.md) L2 方向裁决节）；本档设计 appshell 侧的通用接口机制
- 前置：[GraphPersistenceAdapter](../../packages/appshell/src/shell/persistence.ts) 契约（baseRevision 乐观锁 → CONFLICT；listVersions；auto 保留策略）

## 0. 定位

宿主裁决（2026-09-27）：后端自动持久化 + 冲突版本化基建，**在 appshell 设计一套通用的接口机制**。本档记录该机制的设计：一个 `AutoPersistController`（+ 状态 hook），把内核编辑面的 onChange 流接往既有 `GraphPersistenceAdapter`，实现模式 D（连续持久化，Figma/Google Docs/ODM Decision Center 谱系）。

边界：**内核零改动**（onChange 既有信号足够，无 dirty 概念）；合并策略不做（CONFLICT 的合并/覆盖归宿主与版本治理）；离线队列不在首版。

## 1. 现状地基（零新造轮子盘点）

`GraphPersistenceAdapter` 契约已预留 D 模式所需的全部数据面：

| 能力 | 契约位置 | 说明 |
| --- | --- | --- |
| 单调版本号 | `GraphRecordMeta.revision`（适配器分配） | 乐观锁与版本历史的基座 |
| 自动保存条目 | `auto?: boolean` + auto 保留策略 | 自动保存与手动保存分治（治理策略已设计） |
| 命名版本 | `versionName` | 用户可语义标记关键版本（豁免 auto 保留策略） |
| 钉住 | `pinned`（S007） | 关键版本豁免清理 |
| 版本历史 | `listVersions` | CONFLICT 对账与版本树的展示数据源 |
| 乐观锁 | `save({ baseRevision })` → CONFLICT | 并发编辑的检测点 |

缺的只有**控制器**：把"编辑 onChange → 防抖 → save → 状态流转 → CONFLICT 处理"收敛为一个可复用机制。

## 2. 接口设计

### 2.1 AutoPersistController（appshell 侧通用机制）

```ts
export interface AutoPersistPolicy {
  /** 防抖窗口：onChange 静默期后才落盘。缺省 2000ms */
  debounceMs?: number;
  /** 单 inflight；保存中到达的变更在窗口后合并为下一次保存 */
  coalesce?: boolean;
  /** 自动保存条目打 auto 标记（GraphRecordMeta.auto，走保留策略） */
  autoEntry?: boolean;
  /** 每 N 次自动保存升级为命名版本（0=不升级） */
  namedVersionEvery?: number;
}

export type AutoPersistStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'error';

export interface AutoPersistState {
  status: AutoPersistStatus;
  lastSavedAt?: string;
  lastError?: { code: PersistenceErrorCode | 'NETWORK'; message: string };
  /** CONFLICT 时可供三选 UX 的双方信息：本地 baseRevision vs 服务端 head */
  conflict?: { localBaseRevision: string; serverHeadRevision: string };
}
```

控制器把 `{ graph, session }` 快照接往 adapter.save：

- **baseRevision**：始终携带当前 head revision——CONFLICT 即并发编辑信号
- **inflight 纪律**：单 inflight + pending 合并（防抖窗口内的多次编辑合并为一次保存）；保存中到达的变更排队下一轮
- **CONFLICT 不自动重试**：状态置 conflict 后停轮，等待宿主 UX 裁决（覆盖 / 加载 head / 另存副本）
- **自动条目**：save 携带 `auto: policy.autoEntry` + `versionName` 按 `namedVersionEvery` 周期升级（自动保存条目与手动保存分治的治理策略已在 GraphRecordMeta 设计）

### 2.2 状态面（D 模式的"同步状态"取代 dirty 徽标）

`useAutoPersist(adapter, policy)` hook 暴露 `{ status, conflict, save(), refresh() }`：UI 徽标（"保存中 / 已保存 / 冲突"）与手动 save/refresh 按钮的数据源。**dirty 概念不出现**——D 模式下不存在"未保存"，只有"同步中/已同步/冲突待处理"。

### 2.3 冲突版本化（CONFLICT 三选 UX 的契约支撑）

CONFLICT 时控制器置 status='conflict' 并暴露 `conflict` 详情；宿主三选：

| 选择 | 机制 | 数据后果 |
| --- | --- | --- |
| **覆盖**（我的胜出） | `save({ ...record })` 不带 baseRevision（强制写 head） | 本地版本成为新 head；服务端被覆盖版本仍留在版本历史 |
| **加载 head**（对方胜出） | `adapter.load(id)` 重入编辑器 | 本地未保存变更丢弃（可先另存副本：save 到新 id） |
| **另存副本** | `save({ ...record, id: 新id, versionName: '冲突副本' })` | 双版本并存，人工合并后清理 |

版本树由 `listVersions`（auto/versionName/pinned 元数据齐备）支撑展示。

### 2.4 多标签页

同 id 双 tab 编辑：乐观锁天然暴露 CONFLICT。可选增强（不阻塞首版）：BroadcastChannel 广播 save 事件 → 其他 tab 提示"文档已在别处更新，点击刷新"。

## 3. UX 契约（D 模式的编辑面变化）

| 旧（dirty 流） | 新（D 流） |
| --- | --- |
| 保存按钮 / Ctrl+S | 无（或 = "保存命名版本"的显式版本操作） |
| "未保存"徽标 + 关闭拦截 | 同步状态徽标（Saving…/Saved/Conflict）；关闭仅在 inflight 时提示 |
| undo 回基线不清徽标（B 模式缺陷） | 不存在该问题（无 dirty 概念） |
| 并发编辑不可见 | CONFLICT 三选 UX + 版本树对照 |

## 4. 边界与不做

- **合并不做**：CONFLICT 的内容合并（三方/字段级）归宿主与版本治理——机制只提供检测与三选入口
- **内核零改动**：onChange 既有信号；无 dirty 概念、无保存按钮（现状即正确）
- **离线队列**：首版不做；重试策略为即时失败 + status='error' + 宿主重试入口
- **dt/graph 差异**：机制按图快照（graph + session）设计；dt 页签经 TabSnapshot 会话快照自然覆盖，不单独建模

## 5. 落点与排期

- `shell/auto-persist.ts`：controller + hook + 类型（appshell）
- `SkinnedDecisionGraph`：可选集成点（与 simulateHandler 同型的注入面）
- 状态徽标组件：shell-header 右侧（Saving…/Saved/Conflict）
- 排期：设计定稿（本档），实施随 1.7.0 或按 weaveseal 排期；实施后本档状态更新
