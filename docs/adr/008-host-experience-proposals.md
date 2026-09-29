# ADR-008：编辑器宿主体验增强提案——header 槽位/保存协议/仿真联动/bundle 基线/目录文件协议/搜索索引/分发组合

## 状态
accepted（2026-09-28 verdict 提出，2026-09-28 本仓评审通过——逐项裁决见各节标注；L5 已实施，L1/L3 已实施，L4 文档更新随本提交；L7 已实施（zen-udf 0.8.0，jdm-editor 98936ce1）；L6 已实施（2026-09-29 本仓，随 1.8.0）；L2 契约文档已建，方向=D 模式）

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

【本仓评审 ✅ 接受（2026-09-28）——API 细化：prop 挂 SkinnedDecisionGraph（ThemeContextProvider 保持纯主题契约）；合并=宿主优先浅合并；v1 不带 ctx 参数（YAGNI）】

提案：`ThemeContextProvider`（或 `SkinnedDecisionGraph`）接受可选
`headerSlots={{ left?: (ctx) => ReactNode; right?: ... }}`，与 activeSkin 的 slots
做浅合并（宿主优先）。不改变「kernel 无 header」的裁决——header 仍属 appshell。

### L2 · 保存动作事件协议

现状：宿主经 GraphPersistenceAdapter 全权负责持久化，但库内若有保存入口/快捷键/
未保存状态指示，其与宿主 adapter 的事件时序（何时算 dirty、保存中/成功的反馈点）
没有文档化契约。

提案：文档化（不强求代码）——dirty 状态的所有权、保存反馈点约定；宿主据此实现
关闭拦截与状态徽标（verdict 当前用自维护 dirtyRef 兜底，H1 已落地）。

**方向裁决（宿主 2026-09-27，本仓评审确认）：weaveseal 目标态为模式 D（连续持久化，
无 dirty）**——内核经核验无 dirty 概念、无保存按钮，onChange 是宿主唯一变更信号，
GraphPersistenceAdapter（baseRevision 乐观锁 → CONFLICT）天然支持防抖连续保存；
内核契约零改动。D 的成立前提是 weaveseal 的模型版本治理（保存即版本，"未保存"概念
消失），代价集中于并发编辑的 CONFLICT 合并 UX（版本治理本要解的问题）。过渡态
（verdict 现行 dirtyRef 自维护）按宿主自管模式文档化，两种模式在 adapter 契约下
均可表达；onDirtyChange 回调明确不做。业界参照：Figma/Google Docs/Notion（D）、
IBM ODM Decision Center（治理型决策平台同型终态）、VS Code（dirty 的 undo 集成
参照，其撤销栈保存标记模式依赖单一变更通路，与宿主式存储不合）。

### L3 · 仿真面板宿主回调

现状：`simulateHandler` 由宿主提供并消费结果，但仿真面板内部不提供宿主动作槽位——
「仿真结果一键存为宿主测试用例」（verdict 6.1 已在宿主侧实现）与「仿真失败联跳宿主
调试页」只能在面板外实现。

【本仓评审 ✅ 接受（2026-09-28）——落地形态取 simulationFooter 插槽（面板底部宿主条），SimulationWithActions 返回载荷形态保留为按需演进项】

提案：`simulateHandler` 返回值允许附带 `actions?: { label; onClick }[]`，面板在结果
区渲染；或提供 `simulationFooter` 插槽。

### L4 · bundle 体积基线更新

现状：docs/bundle-analysis.md 为旧版本基线；1.3.0（dagre 动态导入，R6）与 1.4.0
（polyfills 入口副作用）后未重测。

【本仓评审 ✅ 接受（2026-09-28）——fresh 实测已有：index.js 750.0KiB raw / 184.0KiB gzip（W1 后，预算随之 790000/193000）；bundle-analysis.md 基线段随本提交更新；verdict 消费方确认记录待其侧补充】

提案：例行重测并更新文档——验证 dagre/monaco 的动态导入边界在消费方实测仍成立
（verdict 侧确认编辑器 chunk 不进控制台首屏）。

### L5 · 函数目录文件协议（host-functions.json）——已实施

现状：函数目录 schema 经 `useCustomNodes({ schemaSource })` 注入，默认同源
`/api/custom-nodes/schema`；解析层只认裸数组，无版本要件，宿主端点缺失时静默
回落内置 fallback（消费方拿不到真实 UDF 工具面）。

提案与实施（2026-09-28 完成，verdict 提出、经宿主指示本仓直接实施）：

- 解析层支持信封 `{ version, generatedAt, namespaces }`（推荐文件形态，供消费方
  提示目录过期），裸数组保持兼容——已落地并带单测（custom-node-schema-source.ts）
- 信封即跨语言契约：任何语言的后端产出同 schema 的 JSON 文件即可接入编辑器目录；
  执行校验仍在服务端注册表（文件只是展示/创作契约，非安全边界）
- verdict 侧已落地：导出 CLI（apps/api/scripts/export-udf-catalog.ts，调
  `udfFunctionSchemaNamespaces()`）生成 apps/web/public/host-functions.json
  （14 域 22 工具）并经 `schemaSource="/host-functions.json"` 接入
- 动态端点（GET /v1/udf/catalog 实时下发）留作可选项，不阻塞文件协议闭环

### L6 · Components 面板搜索不索引容器节点内部工具名

现状（2026-09-28 verdict 实测）：schema 驱动的目录以「每域一个容器节点」形态渲染
（如 validate-cn 函数集合(4)），工具在拖入画布后的节点设置面板里经下拉选择。面板
搜索框只匹配节点标题——搜索 `id_card`（validate-cn 内部的工具名）返回空，宿主
用户与图作者无法按函数名定位工具，只能逐组展开翻找。

提案：搜索索引纳入容器节点的内部工具名（name/title/description）；命中时展开
该容器分组并高亮对应工具卡。归属 appshell 目录面板组件（A1 目录 UI 的搜索行为
规格补全）。

【本仓评审 ✅ 接受（2026-09-29 宿主裁定）并已实施——落点修正：搜索实现在内核
GraphComponents 面板（appshell 为组装方）。① kernel spec 增可选 `searchKeywords`
字段（NodeSpecification / CustomNodeSpecification / BaseNode 三处，additive）；
② 面板匹配抽纯模块 `graph/component-search.ts`（matchComponent）：规范字段
（type/displayName/shortDescription/group）+ 关键词索引，返回值区分「规范字段命中
（[]，无需高亮）」与「关键词命中（非空词条）」；③ 命中工具词条时容器卡徽标显示
命中词条（最多 3 个，` · ` 连接）替代 shortDescription——本面板形态为每域一卡，
「展开分组并高亮工具卡」由过滤命中 + 词条徽标承载；④ appshell `containerPlan`
以工具 name/title/描述首行生成去重关键词经 spec 透传。单测：kernel
component-search 6 例 + appshell plans 关键词生成 1 例】

### L7 · zen-udf customHandler 遮蔽内置 UDF 分发，宿主无法组合

现状（2026-09-28 verdict 执行 E2E 实测）：engine.ts 仅在 `customHandler == null`
时安装内置 UDF 分发器（handleCustomNode）。宿主一旦注入任何 customHandler（如
crypto 节点的协议专用 handler），注册表全部参考域工具的分发即被完全遮蔽——所有
非该 handler 域的 customNode 永远 passthrough（verdict 实测：22 工具 traceData
全 null，无任何错误暴露）。

影响：宿主无法同时支持「协议特化节点」与「注册表 UDF 工具」——二者只能选一。
verdict 的临时解法是移除自有 handler、crypto 节点改由 registry 参考域 crypto
函数处理（回归对照 E2E 通过、零行为差异），但协议特化的组合需求仍然存在。

提案：暴露组合能力，二选一即可——
1. `DecisionRuntime` 的内置分发器可访问（如 `runtime.handleCustomNode`），
   宿主在其 customHandler 内显式委托；
2. 或支持 handler 链（decline 语义：handler 返回 not-handled 时回落内置分发）。

归属 packages/zen-udf（engine.ts 构造项与分发器可见性）。

【已实施（2026-09-29，jdm-editor 98936ce1，zen-udf 0.8.0）——两种形态都落地：
① decline 语义：`DecisionRuntimeOptions.customHandler` 返回类型宽化为
`Promise<ZenEngineHandlerResponse | undefined>`，返回 undefined（not-handled）
时构造器包装自动回落内置 UDF 分发；② 显式委托：`handleCustomNode` 去 private
公开，宿主 handler 内可调 `runtime.handleCustomNode(request)`。引擎侧 handler
永不返回 undefined（decline 已回落），类型在 ZenEngine 边界收窄。
实施发现（决定性约束）：TS 侧 handler 收到的 `node.content` 恒为 null
（xyflow/wasm 引擎不把 content 传给 TS handler），宿主路由只能按
node.id / node.name，不能按 content.kind——协议节点路由键需约定 name。
verdict 可退役「移除自有 handler」的临时规避，恢复 crypto 协议 handler +
registry 工具并存的组合形态。三种形态均有 spy 断言测试
（engine-custom-handler.test.ts）。】

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 本 ADR 四项一次性评审 | 一次评审收敛，verdict 排期一次到位 | 单项否决拖慢整体 |
| B. 逐项单独 ADR | 粒度细 | 四项均为小提案，流程成本大于收益 |

## 决策

采用方案 A（本文档即提案合集，L5/L6/L7 增补后为七项）。实施顺序修订：L5（已完成）
→ L4（例行，零风险）→ L1（消费方需求最明确）→ L2（文档化即可先行动）→ L3（随
velocity §6 核对一起做）→ L6（✅ 已完成，2026-09-29 本仓——落点 kernel GraphComponents
面板搜索 + appshell 关键词组装）→ L7（✅ 已完成，2026-09-29
zen-udf 0.8.0——verdict 的临时规避可退役）。

## 实施记录（2026-09-28）

| 项 | 状态 | 位置 |
| --- | --- | --- |
| L5 信封解析 | ✅ 已实施（303e95b，宿主指示直接实施） | packages/appshell/src/lib/custom-node-schema-source.ts |
| L5 导出 CLI + 文件接入 | ✅ 已实施（verdict 仓） | verdict apps/api/scripts/export-udf-catalog.ts |
| L6 目录搜索索引内部工具名 | ✅ 已实施（2026-09-29 本仓，随 1.8.0；落点修正为 kernel GraphComponents + appshell containerPlan） | packages/seal-editor graph/component-search.ts · packages/appshell custom-node-plans.ts |
| L7 customHandler 组合能力 | ✅ 已实施（2026-09-29，jdm-editor 98936ce1，zen-udf 0.8.0；decline + 显式委托双形态；路由键=node.name，TS 侧 content 恒 null） | packages/zen-udf engine.ts |
| L1/L2/L3/L4 | L1/L3 已实施（本仓 d159ae1，headerSlots 注入 + simulationFooter 插槽）；L2 契约文档已建（save-persistence-contract.md）；L4 基线已更新（bundle-analysis.md + 预算 790000/193000） |

## 后果

- 全部落地后，verdict 侧的 H 批绕道实现（自维护 dirtyRef、页面级头部）可迁移到
  库契约上，宿主代码简化
- verdict 侧承诺：8.2 UDF T1 算子完成后（届时 velocity §6 核对清单启用）提供
  消费方实测数据，配合本 ADR 评审
- 本 ADR 为 proposed：单项接受/否决请在本文件标注并更新状态行
