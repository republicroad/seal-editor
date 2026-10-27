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
| dt 核心编辑器 | data-grid 换装四阶段（spike/换装/裁决/清债），index.js 累计 **-7.5kB** | [dt-datagrid-retrofit-plan.md](./archive/plans/dt-datagrid-retrofit-plan.md) |
| 三区参考 | dt-command-bar / switch 面板 / function 调试器 | 已移植（reui-retrofit-reference-for-seal-editor.md，jdm 仓） |


## 2026-10-13 重新分析（27 组件 + ultimate 全解锁增量）

> 增量口径：09-26 快照 22 组件 → 现测 27（新增 cascader/color-picker/emoji-picker/
> file-type/signature-pad/time-picker 六项）；premium blocks 636 + Motion Icons 667
> 全解锁后首扫。判据沿用档头（对口复合组件 + 交互真实升级）。

> **2026-10-15 复查**：组件 27 持平（零新增，六新组件判定全维持）；blocks 636→654（+18：chart+5/data-grid+5/ai-agents+4/application+2/solutions+2）。
> 增量要点：data-grid 新 advanced 类（格内 sparkline+KPI 带+undo toast）= dt 命中统计可视化的形态参照（非直接可用）；ai-agents 四个新 copilot 变体（corner popup/docs assistant/voice/structured answers）加厚触发项基座（ai-chat-2 仍为首选）。模板 MCP 仍不可枚举，判定不变。

> **2026-10-24 复查**：组件 27 持平；blocks **+4 = flow 类目全新**（10-15 复查后新增，4 block 全部 @xyflow/react 栈、pro 档）——①flow-1 Automation Builder（undo/redo + canvas lock + snap-to-grid + minimap + **未保存编辑 Update 钮** + 节点工具栏/右键增删复制 + docked inspector）；②flow-2 AI Agent Builder（**dagre 树布局——与本仓 auto-layout 同栈** + 命名分支路径 + connector 加步钮 + Run test 统计 passed/failed/skipped）；③flow-3 Pipeline Run Monitor（6 运行态 + 失败任务重试/聚焦 + 审批门）；④flow-4 Growth Impact Map（KPI 驱动树，与仓无关）。另：whiteboard 类（Excalidraw ×2，历次复查未录）——自由绘图非规则编辑器形态，维持否决清单同款裁定。
> 判定：**独立 demo 应用形态，非可嵌入组件——不安装**（同 data-grid 组裁定；决策图节点语义/契约面是 jdm 立法资产，graph.tsx 深度定制不换装）。形态参照三处入册：①flow-1 未保存 Update 钮 ↔ ADR-008 dirty 契约（host-owned）+ auto-persist SyncStatusBadge 的 UI 语义参照；②flow-3 运行态+失败重试聚焦 ↔ simulator/TrustChain trace 展示参照；③canvas lock / snap-to-grid 为图编辑器增强候选（未挂触发项，宿主需求驱动）。模板仍 MCP 不可枚举（10-15 结论维持），整页站定位对组件库不适用。

### 新组件判定（6 项）

| 组件 | 判定 | 落点/理由 |
| --- | --- | --- |
| **cascader** | ✅ **已落地（本档快照滞后）** | src/reui/cascader 全家已 vendored（10 文件）且双消费端在链：TypedInput 字段选择弹层 + dt 输入列字段绑定（input-field-edit buildFieldTree）——「候选」判定作废，以落码为准 |
| **time-picker** | ✅ 候选（低频） | 字段值级时间输入（TypedInput datetime 模式 / dt 值单元格）；与 date-selector 的否决理由不冲突——否的是仪表盘周期控件，这是值输入 |
| file-type | 🟡 装饰性（低） | Upload/Import 菜单与拖放导入的文件图标；纯观感 |
| color-picker | ❌ 无场景 | 决策编辑器无颜色输入（主题走 token） |
| emoji-picker | ❌ 无场景 | — |
| signature-pad | ❌ 无场景 | — |

### data-grid 上游新能力（vendored 升级跟踪）

组件摘要新增：clipboard + **inline editing**、**tree rows**、**footer rows**、
**单 prop i18n 标签**。对照本仓：

- **i18n 单 prop** —— 与本仓 useT 词条体系直接对口，vendored 升级时可削自写标签接线；
- **footer rows** —— 触发制清单「data-grid 快照+footer」的技术前置已就绪；
- inline editing —— dt 有自有 blur-commit 单元编辑器（语义已立法），迁移无可见增益，
  观望（上游成熟 + dt 编辑语义复审时再评）；
- tree rows —— dt 无树行场景。

### premium blocks / 模板 / Motion Icons

- **ai-agents 组（18）**：触发制「AI copilot」项的现成 UI 基座——`ai-chat-2 Docked
  Assistant`（侧栏流式对话 + insert-into-draft，正对口表达式/规则建议插入编辑器）；
  `agent-activity-3 Run Step Trace`（逐步工具调用 + 延迟时间线）可作 simulator/Trust
  Chain trace 展示参照。触发条件 = verdict 线激活 AI copilot。
- **data-grid 组（42）**：整页 admin 表格区块，嵌入式编辑器无整页场景；唯一可借鉴
  形态 = editing 类的脏状态 Save/Discard 条（与 dt 单元 blur-commit 语义不同，不套用）。
- **模板**：非 registry 安装物（reui.io 页面下载），整页站定位，不适用组件库。
- **Motion Icons（667）**：维持不涉及——编辑器图标统一 lucide（#icons），混入 hover
  动效图标有风格一致性风险；除非未来节点卡 hover 专项另评。

### 覆盖快照更新（27 组件）

- 在用（较 09-26 新增确认）：code-block（REPL）、alert（InstanceEditor）、tree、
  timeline、frame、sortable——09-26「有落点待用 4」全部落地；
- 新增候选：cascader（有落点）、time-picker（低频）；
- 维持否决/无场景：autocomplete、date-selector、color-picker、emoji-picker、
  signature-pad、kanban/gantt/event-calendar/rating/phone-input/scrollspy、filters；
- data-grid：vendored 跟踪上游 i18n/footer 能力。
## 剩余清单（按价值排序）

| # | 区域 | 现状 | 可做 | 量级 | 触发条件 |
| --- | --- | --- | --- | --- | --- |
| ~~1~~ | ✅ 2026-09-30 收口：Step 1（monaco options + 工具栏组共享件）已落地（schema-editor-shared.tsx，净 -约 110 行）；Step 2 ListPanel 裁定不做（两面板结构性不同，强抽为过度抽象）——详见 [graph-panel-recon.md](./graph-panel-recon.md) §5 | 已完成 |
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
[dt-datagrid-retrofit-plan.md](./archive/plans/dt-datagrid-retrofit-plan.md)
