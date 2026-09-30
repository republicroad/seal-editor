# graph 面板区形态统一——侦察提案（批次二产出）

- 日期：2026-09-30
- 状态：**侦察完成 · 提案待裁定**（backlog row 1 的侦察交付；实施另排）
- 范围：`packages/seal-editor/src/components/decision-graph/graph/`（5,090 行，backlog 口径 5,605 为 9-26 快照）

## 1. 形态盘点

「列表 + 工具栏 + 空态」逐文件手写的面：

| 文件 | 行数 | 形态 |
| --- | --- | --- |
| tab-request.tsx | 383 | monaco 编辑器 + **工具栏按钮组**（L172-245 按 activeTab 切换的 tabBarExtraContent）+ examples 源列表 |
| request-examples.tsx | 281 | master-detail 双栏：左源列表（w-[220px]，行 = `flex items-center gap-1 rounded-lg border px-2 py-1.5`）+ 右详情（Typography strong 头 + 圆形 icon 钮）+ PanelEmpty 空态（带 action） |
| request-definitions.tsx | 236 | 可编辑 grid 行（GRID_COLS 模板）+ DefinitionCard 递归 + PanelEmpty 空态（无 action）+ link 添加钮 |
| tab-json-schema.tsx | 226 | monaco 编辑器 + **工具栏按钮组（与 tab-request 几乎逐行重复）** |
| 其余 tab-*（expression/decision-table/function） | 111-126 ×3 | 薄委托层（编辑器容器 + trace 装配），非 list-panel 形态——**不应硬套** |

## 2. 精确重复点（提取标靶）

1. **monaco editorOptions 字面量**：tab-request.tsx:40-54 与 tab-json-schema.tsx:19-33 完全重复（~30 行）；
2. **工具栏按钮组**：tab-request.tsx:172-245 与 tab-json-schema.tsx:142-165 逐行同构（`<Space size='small' className='mr-2'>` + 格式化/导入按钮，~75 行）——仅 onClick 目标不同；
3. **三种"添加"按钮形态**：Tabs extra（request）/ dashed（examples 列表底）/ link（definitions 底）——统一为一种可配置形态；
4. **空态**：已统一（PanelEmpty，52102f64）——唯 examples 带 action、definitions 不带，属合理差异。

## 3. 提案

### 提案 A · 两步走（推荐）

- **Step 1（低成本先行，~0.5 天）**：提取共享 monaco `editorOptions` 常量 + `SchemaToolbarActions` 按钮组组件（props: onFormat/onImport/...），tab-request 与 tab-json-schema 消费——删 ~80 行逐字重复；
- **Step 2（~1.5 天）**：提取 `ListPanel` 形态组件（props: 源列表渲染、空态、添加钮形态 'tabs-extra'|'dashed'|'link'、详情区），request-examples 与 request-definitions 迁移；新面板默认消费。

预估净删除有限（~11-13%），**主要收益是止漂**：后续新面板不再各写一套工具栏/列表/空态。

### 提案 B · data-grid 化（否决）

request-definitions 是 blur-commit 可编辑表单网格（非展示表格），data-grid 已用于 graph-excel-dialog——硬套 data-grid 引入受控/编辑契约冲突。

### reui 适用性

- `frame` ✅（面板壳 + FrameHeader 做工具栏条，dense 档适配列表行）
- `sortable` ❌（examples 源列表无拖拽需求；fields-reorder 已有独立落地）
- `data-grid` ❌（同提案 B）

## 4. 裁定点

1. Step 1/2 是否排期（Step 1 可随任一批顺做）；
2. ListPanel 归属：kernel `decision-graph/graph/` 内（面板是内核面）——建议 kernel；
3. 三种添加钮形态收敛为哪种（建议 `dashed`——列表底内嵌不抢 Tabs extra 空间）。
