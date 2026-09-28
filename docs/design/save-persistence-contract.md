# 保存与持久化契约（宿主对接 · v1）

- 日期：2026-09-28
- 状态：**v1 契约文档**——ADR-008 L2 的落地交付（评审确认：dirty=宿主自管是设计而非缺陷；`onDirtyChange` 明确不做）
- 读者：宿主应用（weaveseal/verdict 及其他 GraphPersistenceAdapter 消费方）
- 关联：[ADR-008](../adr/008-host-experience-proposals.md) L2 · [appshell 自动持久化设计](./appshell-auto-persist.md)（模式 D 的机制设计）

## 0. 契约核心（三句话）

1. **dirty 判定 = 宿主对比 onChange 快照**。内核无 dirty 标志、无保存按钮、`onChange` 是唯一的变更信号（逐编辑触发）——宿主自行决定比较频率与防抖。
2. **持久化 = 宿主经 `GraphPersistenceAdapter` 全权负责**。保存时机（手动/防抖自动）、反馈点（保存中/成功/失败）、并发策略全部在宿主侧。
3. **目标态 = 模式 D（连续持久化）**：weaveseal 有模型版本治理，"保存"溶解为"版本"——同一 adapter 契约天然支持防抖连续保存（详见 §4）。

## 1. 变更信号

- `DecisionGraph.onChange(val)`：每次编辑触发（含 undo/redo、粘贴、导入）——宿主以受控 `value` 持有当前模型
- `DecisionTable` 同构（dt-store commitData 逐格提交）
- **undo/redo 语义**：撤销是编辑操作，同样触发 onChange——"undo 回基线后不再 dirty"由宿主的快照对比自动覆盖（基线=上次保存快照时）；内核撤销栈不感知宿主徽标（设计如此，VS Code 的撤销栈保存标记模式依赖单一变更通路，与宿主式存储不合）
- **关闭拦截**：宿主 `beforeunload`/路由守卫基于自身 dirty 判定；模式 D 下仅在 inflight 保存未落时提示

## 2. 持久化两模式（同一 adapter 契约）

| | 模式 S（保存驱动，现状默认） | 模式 D（连续持久化，weaveseal 目标态） |
| --- | --- | --- |
| 触发 | 宿主保存动作（按钮/Ctrl+S） | onChange 防抖（宿主 debounce 后调 save） |
| UI | 保存按钮态/未保存徽标 | 同步状态（Saving…/Saved/Conflict） |
| 关闭拦截 | 未保存时提示 | 仅 inflight 未落时提示 |
| adapter 调用 | 用户动作即 save | 防抖窗口后 save（单 inflight 合并） |
| 失败 | toast + 保留 dirty | 状态徽标 + 重试入口 |

两模式可共存渐进：宿主可从 S 起步，后续加防抖连续保存而无须改内核。

## 3. 模式 D 的并发与冲突

- `save({ baseRevision })` 乐观锁：不匹配抛 CONFLICT——另一编辑者（或另一 tab）已先保存
- CONFLICT 三选（宿主 UX）：覆盖（强制写 head）/ 加载 head（可先另存副本）/ 另存副本
- 版本树对照：`adapter.listVersions`（auto/versionName/pinned 元数据齐备）
- 合并策略不做（机制提供检测与三选入口，内容合并归宿主与版本治理）

## 4. weaveseal 落地清单（宿主侧）

1. dirty：onChange 快照对比（宿主 state）+ 关闭拦截（现有 dirtyRef 迁移即可）
2. 模式 D：debounce → adapter.save（带 baseRevision）+ CONFLICT 三选 UX + 同步状态徽标
3. 崩溃兜底（二阶段候选）：IndexedDB 本地草稿缓存（hot exit 类比，见 appshell-auto-persist.md §4）
