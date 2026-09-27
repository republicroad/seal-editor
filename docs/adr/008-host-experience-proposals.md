# ADR-008：编辑器宿主体验增强提案——header 槽位注入/保存回调/仿真联动/bundle 基线

## 状态
proposed（2026-09-28，verdict 宿主提出，待本仓评审）

## 背景

verdict 以 `/edit` 全页路由嵌入本仓 kernel+appshell（seal-editor/seal-appshell 1.4.0）。
宿主侧已完成一批体验增强（H1/H3/H4/H5：Ctrl+S、chunk 预取、状态行时间戳、调试页联跳），
但其中多项在宿主层实现时受到库边界的限制；另有跨仓协作事项需要一次评审收敛。
配套背景见本仓 ADR-007（randomUUID，已落地）与 docs/design/velocity-udf-plan.md §6
（编辑器侧影响，届时一并核对）。

## 提案清单（四项，互相独立）

### L1 · ShellHeader 槽位宿主注入

现状：header slots 来自 `activeSkin.layout.header.slots`（皮肤定义），宿主无法在不定义
整个 skin 的情况下注入 per-page 元素（如 home/back 链接）。verdict 的排查实测：皮肤
header 内的导航元素宿主不可控，只能绕道页面级头部。

提案：`ThemeContextProvider`（或 `SkinnedDecisionGraph`）接受可选
`headerSlots={{ left?: (ctx) => ReactNode; right?: ... }}`，与 activeSkin 的 slots
做浅合并（宿主优先）。不改变「kernel 无 header」的裁决——header 仍属 appshell。

### L2 · 保存动作事件协议

现状：宿主经 GraphPersistenceAdapter 全权负责持久化，但库内若有保存入口/快捷键/
未保存状态指示，其与宿主 adapter 的事件时序（何时算 dirty、保存中/成功的反馈点）
没有文档化契约。

提案：文档化（不强求代码）——dirty 状态的所有权、`onDirtyChange?` 回调、保存成功的
反馈点约定；宿主据此实现关闭拦截与状态徽标（verdict 当前用自维护 dirtyRef 兜底）。

### L3 · 仿真面板宿主回调

现状：`simulateHandler` 由宿主提供并消费结果，但仿真面板内部不提供宿主动作槽位——
「仿真结果一键存为宿主测试用例」（verdict 6.1 已在宿主侧实现）与「仿真失败联跳宿主
调试页」只能在面板外实现。

提案：`simulateHandler` 返回值允许附带 `actions?: { label; onClick }[]`，面板在结果
区渲染；或提供 `simulationFooter` 插槽。

### L4 · bundle 体积基线更新

现状：docs/bundle-analysis.md 为旧版本基线；1.3.0（dagre 动态导入，R6）与 1.4.0
（polyfills 入口副作用）后未重测。

提案：例行重测并更新文档——验证 dagre/monaco 的动态导入边界在消费方实测仍成立
（verdict 侧确认编辑器 chunk 不进控制台首屏）。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 本 ADR 四项一次性评审 | 一次评审收敛，verdict 排期一次到位 | 单项否决拖慢整体 |
| B. 逐项单独 ADR | 粒度细 | 四项均为小提案，流程成本大于收益 |

## 决策

采用方案 A（本文档即四项合集）。建议实施顺序：L4（例行，零风险）→ L1（消费方
需求最明确）→ L2（文档化即可先行动）→ L3（随 velocity §6 核对一起做）。

## 后果

- 全部落地后，verdict 侧的 H 批绕道实现（自维护 dirtyRef、页面级头部）可迁移到
  库契约上，宿主代码简化
- verdict 侧承诺：8.2 UDF T1 算子完成后（届时 velocity §6 核对清单启用）提供
  消费方实测数据，配合本 ADR 评审
- 本 ADR 为 proposed：单项接受/否决请在本文件标注并更新状态行
