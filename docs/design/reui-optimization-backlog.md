# ReUI 改造剩余清单（按价值排序）

> 本仓副本：自 jdm-editor reui 线同步（a76cb102），后续独立维护。

- 日期：2026-09-26
- 状态：**活档 · 填缝模式**——不再单独立批次，各项随主线顺做；主线 = UDF 生态
  （[playground-udf-lab-plan.md](../archive/plans/playground-udf-lab-plan.md)）
- 判据：**有对口的 ReUI 复合组件 + 交互真实升级**才算"适合优化"。primitives 本身是
  合法底座（Base UI 封装的 antd 风 API 层），用了 primitives 不构成优化理由；
  "堆叠"只有在多个面板重复手写同一种形态时才是漂移源。

## 已完成波次（不再列入）

| 波次 | 内容 | 记录 |
| --- | --- | --- |
| WS1 · 规则图 | R1–R7 全切片（节点卡/悬浮工具栏/边"+"插入/分支标签/停靠检查器/dagre 自动布局/run strip） | [development-roadmap.md](./development-roadmap.md) WS1 |
| Excel 对话框 | 三批：data-grid 地基（含 TanStack v8→9 统一）→ 双对话框改造 → 导入数据预览 | 已移植（dt 核心换装同行） |
| B 线 | expression 小件去重；stepper vendored；B2b/B3 适应性否决 | 提交 e09d0fed/87c89536 |
| dt 核心编辑器 | data-grid 换装四阶段（spike/换装/裁决/清债），index.js 累计 **-7.5kB** | [dt-datagrid-retrofit-plan.md](./dt-datagrid-retrofit-plan.md) |
| 三区参考 | dt-command-bar / switch 面板 / function 调试器 | 已移植（reui-retrofit-reference-for-seal-editor.md，jdm 仓） |

## 剩余清单（按价值排序）

| # | 区域 | 现状 | 可做 | 量级 | 触发条件 |
| --- | --- | --- | --- | --- | --- |
| ~~1~~ | 侦察完成（2026-09-30）→ [graph-panel-recon.md](./graph-panel-recon.md)：精确重复点 = monaco editorOptions + 工具栏按钮组（tab-request/tab-json-schema 逐字重复 ~110 行）+ 三种添加钮形态；提案 A 两步走待裁定 | 提案待排期 |
| 2 | ~~fields-reorder-dialog~~ | ✅ 2026-09-26 完成（sortable vendored，176→88 行） | — | — | — |
| ~~3~~ | ~~function 调试器搜索过滤 + hover 复制~~ | ✅ 2026-09-29 随 1.6.0 落地（W1-B：日志过滤 + hover 复制）；日志级别类型化需 WASM 侧拦截，另行评估 | 已完成 |
| ~~4~~ | ✅ 2026-09-30 落地：SettingsFrame spacing=xs + FramePanel gap 收紧 + 双宿主头部/间距统一 + DiffCodeEditor 内联样式收编共享常量 + 冗余 Space/标签大小写规范化 | 已完成 |
| ~~5~~ | ✅ 2026-09-30 随 1.20.0：**tree**（目录树 catalog-tree.tsx，点工具即插入）+ **timeline**（TrustChain 审计时间线）+ **code-block**（FunctionRepl renderResult JSON 高亮）三组件首次入链完成 | 已完成 |

## dt 换装解锁的增强候选（新功能，非优化）

| 候选 | 说明 | 量级 |
| --- | --- | --- |
| ~~列显隐菜单~~ | ✅ 2026-09-29 随 1.6.0 落地（W1-C：dt 列显隐菜单，data-grid-column-visibility 启用） | 已完成 |
| ~~大表虚拟化~~ | ✅ 2026-09-29 落地（jdm 9eb5aa7e 移植）：虚拟化下沉 DndRows 表体（virtual prop + 七纪律 + rAF 兜底重连），dt ≥100 行窗口化，scrollApiRef 双路径 | 已完成 |
| ~~cellSelection single 模式（A'）~~ | ✅ 2026-09-29 落地（jdm 2c48f461 移植）：受控 cellSelection 对桥接 cursor，键盘三分约定（plain/Ctrl/Alt），输入控件让位；Alt-only 收敛（⌘ 变体与边缘跳转撞车） | 已完成 |

## 维持否决清单（附理由，防止重复评估）

| 项 | 理由 |
| --- | --- |
| autocomplete（替换 op-dropdown） | 现有 kind 页签 + 图标网格 + 搜索的富选择器是更好的设计，autocomplete 是降级 |
| date-selector（替换 value-inputs 日期输入） | 仪表盘周期控件（"近 7 天/本月"类），不是字段值日期输入 |
| timeline（simulator 运行历史） | 内核 simulator 只持有最后一次运行，无 history 面可改造——做历史属新功能决策 |
| kanban / gantt / event-calendar / rating / phone-input / scrollspy / filters | 规则编辑器无对应场景 |

## ReUI 组件覆盖快照（22 个免费组件）

- **在用 8**：data-grid 系（含 13 子模块，含 cell-selection / column-visibility）、badge、icon-tile、stepper、sortable、frame
- **有落点待用 4**：tree、timeline、sortable、frame
- **候选 4**：alert、icon-stack、number-field、code-block
- **vendored 全部启用（0 未启用）**：data-grid-cell-selection（A' 单格聚焦，2026-09-30 启用）、data-grid-column-visibility（列显隐，1.6.0 启用）
- **无场景/否决 10**：见上表
- 另有 premium blocks（整页区块）与 Motion Icons 产品线，本仓未涉及

相关：[reui-flow-integration-plan.md](../archive/plans/reui-flow-integration-plan.md) · [reui-flow-pilot.md](../archive/plans/reui-flow-pilot.md) ·
[dt-datagrid-retrofit-plan.md](./dt-datagrid-retrofit-plan.md)
