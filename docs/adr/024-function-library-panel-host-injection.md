# ADR-024：函数参考面板宿主注入——Libraries 目录可配 + documentationUrl 构造链保全

- 日期：2026-10-24
- 状态：**proposed**（2026-10-24 verdict 侧起草，待上游预评审）
- 消费面实证仓：verdict（批次 30「编辑器表达式体验」；宿主过渡态见背景 §4）
- 关联：ADR-008（宿主体验提案族）、ADR-009（函数生态分层与 namespace 治理——
  本 ADR 是治理模型的**消费端补全**：目录能下发，参考面也要能下发）、
  ADR-023（同判式：「每宿主重交学费」的不可长期化）

## 背景

1. **函数调试面板已有一等参考面**：Console | Libraries 双页签；Libraries 渲染
   `FunctionLibrary[]`（`{ name, tagline, importName?, typeDef, documentationUrl? }`），
   typeDef 以代码块展示、「Go to documentation」按条目外链——表达式作者查签名与
   语义的主入口。
2. **参考面内容写死**：内置库目录 `Dg`（big.js / dayjs / http / zen…，文档链接指向
   上游生态）在函数调试面板调用点硬编码（`libraries: Dg`）。`DecisionGraph` 无注入
   通道；`FunctionLibrary` 类型未导出（内部 `declare type`）。
3. **documentationUrl 类型面已全线支持、构造链三处裁剪**：
   - 类型面：`CustomNodeSpecification` / `MinimalNodeSpecification` /
     `FunctionLibrary` 均含 `documentationUrl?`；节点右键菜单已渲染
     「Documentation」项（`spec.documentationUrl` 存在即显示，`window.open` 外链）；
   - 裁剪点 ①：`createJdmNode` 的输入类型 `BaseNode` 不含 `documentationUrl`——
     宿主专用节点（如 verdict velocity 专用节点）声明不进去；
   - 裁剪点 ②：seal-appshell `an()`（schema namespace → 节点规格构造）不透传该
     字段——schema 载荷带了多少都会在构造时丢弃；
   - 裁剪点 ③：seal-appshell `Fn()`（宿主/pack 专用节点规格归一）同弃。
4. **宿主现状（verdict，批次 30 过渡态）**：函数目录单一事实源 =
   `host-functions.json`（17 namespace）→ 公开 `/docs/functions/<ns>` 函数页
   （rspress 生成，编辑器深链可达）。verdict 已在宿主侧给全部 customNodes 补
   `documentationUrl`（EditorCanvas 一处 map；节点右键「Documentation」已通）——
   但这是 ADR-023 同款过渡兜底：**每个宿主都要重交一遍学费**。函数调试面板
   Libraries 页签（zen 表达式函数目录 + typeDef 代码块）则无任何宿主侧通路。

## 问题

| # | 问题 | 影响 |
| --- | --- | --- |
| P1 | Libraries 页签写死 `Dg` | 宿主无法让自有函数目录进入编辑器一等参考面；内置目录与宿主运行时不对应（展示宿主不可用的库、外链指向错误文档域）——参考面从「权威」变「误导」 |
| P2 | documentationUrl 三条构造链裁剪 | pack 节点右键无「Documentation」；宿主被迫宿主侧 map 补齐（过渡态已实证可行，但不可长期化） |
| P3 | `FunctionLibrary` 未导出 | 即便有注入通道，宿主也无法类型安全地构造目录条目 |

## 备选方案

- **方案 A（本 ADR，推荐）**：prop 注入 + 构造链保全。改动集中在两个包的薄层
  （一个 prop、三处透传），缺省行为零变化（不传 = `Dg`，独立应用无感）。
- **方案 B**：Libraries 数据走 schema 端点（customFunctions 载荷扩展 libraries
  字段）。参考面数据与目录下发契约耦合；离线宿主（无 schemaSource，回落
  host-functions.json 静态形态）反而失去参考面；且 ADR-010 已定界 schema 载荷
  是「目录过滤」契约，不宜再驮参考面语义。放弃。
- **方案 C**：维持现状，宿主自建面板（编辑器外挂参考侧栏）。一等参考面旁路化，
  Console|Libraries 信息架构碎片化；typeDef 代码块渲染、「Go to documentation」
  交互全部重造。放弃。

## 决策（方案 A 分解）

- **D1 · `FunctionLibrary` 导出**：seal-editor 公开导出该类型（宿主构造目录的
  类型前提）。
- **D2 · `DecisionGraph` 新 prop `functionLibraries?: FunctionLibrary[]`**：
  透传至函数调试面板 Libraries 页签；缺省 `Dg`（独立应用零影响）。
  `SkinnedDecisionGraph`（appshell）同名转发。
- **D3 · `BaseNode` 增 `documentationUrl?: string`**：`createJdmNode` 透传进
  产出的 `CustomNodeSpecification`。
- **D4 · seal-appshell `an()` / `Fn()` 保全 `documentationUrl`**：载荷/spec 已有
  则透传，不合成、不改名——字段语义单一来源仍归宿主。
- **D5 · 宿主退役条件**：D2–D4 发布后，verdict 批次 30a 宿主侧 map 退役；
  Libraries 目录由宿主从 `host-functions.json` 生成（typeDef 从工具签名机械生成、
  documentationUrl 指向 `/docs/functions/<ns>`），与 /docs 函数页同源同屏。
- **D6 · 缺省目录去留**：`Dg` 作为缺省保留（1.x 兼容）；是否随 2.0 把缺省改为
  空目录（无注入 = 不显示参考面），评审裁断——倾向保留（独立应用开箱体验）。

## 实施清单

1. `packages/seal-editor`：导出 `FunctionLibrary`；`DecisionGraphProps`（wrapper
   面）增 `functionLibraries?`；函数调试面板调用点改读 prop（缺省 `Dg`）；
2. `packages/seal-editor`：`BaseNode` 增 `documentationUrl?`，`createJdmNode`
   透传；
3. `packages/appshell`：`an()` / `Fn()` 透传 `documentationUrl`；
   `SkinnedDecisionGraph` 转发 `functionLibraries`；
4. storybook：注入冒烟 story——宿主目录渲染 + typeDef 代码块 + Go to
   documentation 链接 + 空注入回退 `Dg`；
5. 回归面：不传 `functionLibraries` 的现有 story/宿主行为零变化（diff 审查项）。

## 开放问题

- `functionLibraries` 是否同时喂表达式 monaco 补全（当前补全来自内核 zen stdlib）？
  本轮不做——参考面板与补全是两个语义面，混引会放大契约；后继单独立项。
- per-function 文档入口：`$call` 作用域实例编辑器是否在工具载荷带
  `documentationUrl` 时渲染入口（`Av()` 已原样透传工具字段，消费端缺）？
  挂 D4 落地后评估，倾向随本轮一并（改动一处 UI 分支）。
- `Dg` 缺省去留（D6），评审裁断。

## 后果

**正面**：编辑器一等参考面可宿主化，verdict 的「公开 /docs 函数页 + 编辑器内嵌
参考面板 + 深链」三件套闭环；pack 节点右键文档入口成为零成本通道；「每宿主重交
学费」判式再消一项（ADR-023 同构收益）；宿主侧过渡 map 有了明确退役条件。

**负面/约束**：API 面积 +1（一个 prop、一个导出、两处透传——均为可空可选，
兼容零破坏）；`Dg` 缺省保留期间宿主必须显式注入才能获得正确目录（文档须写明）；
D4 只保全不合成——宿主不下发就继续没有（这与治理模型一致：目录是宿主资产）。
