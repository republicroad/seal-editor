# ADR-017：宿主/pack 专用编辑器插件体系——两层注册表与 tester+rank 接管

## 状态

proposed（2026-10-07 起草——设计定稿待实施。**编辑器最重要的插件体系立法**：
"任何宿主/pack 都能注册自己的专用编辑器，不需要改 seal-editor 核心代码。
新增一个 pack 自带编辑面板 = 在 pack 内声明 tester + renderTab，seal-editor
自动接管。"）

- 触发条件（治理窗 phase-2 ①）：verdict 侧第三方 pack 贡献，或同 kind 多代
  编辑器诉求首次出现；
- 编辑接管层详设依托既有资产 + 本 ADR §2；存在性层详设见
  [dedicated-node-registry-design.md](../design/dedicated-node-registry-design.md)
  （设计定稿待实施，2026-09-29）。

## 0 · 定位（插件体系宣言）

自定义节点的专用编辑面是 UDF 生态在编辑器内的最终落点：pack 作者声明一次，
任何宿主装上即得完整编辑体验，**内核零改动、零发版**。它与 ADR-015（函数节点
规范——执行侧信任链）构成一体两面：ADR-015 管"怎么跑"，本 ADR 管"怎么编"。

## 背景

### 已有资产（本 ADR 站在其上——机制已完成约 80%）

1. **声明面已存在**：`CustomNodeSpecification`
   （`nodes/custom-node/index.tsx:28`）已含 `kind / displayName / group / icon /
   meta(ADR-009 origin+version+license) / renderNode / renderTab / generateNode /
   calculateDiff / inferTypes / onNodeAdd`——pack 声明编辑面板就是
   `renderTab: ({ id }) => <MyTab id={id} />`；
2. **自动接管路由已存在**：`dg-wrapper.tsx:160-178` 已实现「kind 匹配 →
   `customSpec.renderTab`，无 renderTab 回退 CustomFunctionTable」；
3. **状态桥已存在**：内核导出 `useDecisionGraphState / useDecisionGraphActions`
   ——appshell query-list-node 的 Tab 即以 `updateNode(id, draft => {...})`
   读写配置（immer 管道，onChange→持久化→撤销链一致）；
4. **治理过滤已存在**：`allowedNamespaces` 全链过滤 customNodes（批 23-24）；
5. **实证**：appshell 四演示节点（http-request / crypto / current-date /
   query-list）全部以该模型创作，pack 作者学习成本已被验证趋近于零。

### 问题（缺失的 20%）

| # | 问题 | 现状证据 |
| --- | --- | --- |
| P1 | **匹配只有 kind 等值**——非 kind 可判定的接管不可能（同 kind 多代编辑器、按 config 形态分流） | `dg-wrapper.tsx:168` `customNodes?.find(n => n.kind === kind)` |
| P2 | **优先级 = 宿主数组顺序**——`find()` 首中即胜，跨 pack 争抢的裁决依赖数组字面量顺序，隐式且脆弱 | 同上 |
| P3 | **匹配逻辑分散**——六处各自 find，行为可能漂移；且匹配键形不一（React Flow `data.kind` vs 文档模型 `content.kind` vs `dg-infer` 的 `node.type`——后者与其余位点不同键，收敛时须审计是否潜在错配） | `dg-wrapper.tsx:168`（tab 路由）/ `graph.tsx:124`（画布 renderNode）/ `node-inspector.tsx:46`（标题）/ `dg-infer.tsx:168,231`（inferTypes）/ `diff/utility.ts:108`（calculateDiff，`content.kind`）/ `use-node-add.ts:47`（generateNode/onNodeAdd） |
| P4 | **两层脱节待立法**——appshell 存在性注册表（catalog 载荷驱动，见 dedicated-node-registry-design.md）与内核渲染接管各自表述，未作为一体声明 | — |

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 内核 switch 硬编码每种节点类型（内建五节点的现状） | 简单直接 | 每新增节点类型改内核、发版；pack 生态不可能 |
| B. 内核集中式 plugin manager（全局注册表对象 + 生命周期钩子） | 单点齐整 | 内核承载宿主组合逻辑；bundle 膨胀；劫持面扩大；与「声明面归 spec」的既有惯例断裂 |
| **C. 两层注册表（决策）**：声明归 spec、匹配归内核纯函数、存在性归 appshell 载荷 | 零内核发版加节点；匹配确定性可测；安全边界清晰 | tester 语义两层并存（评分 vs 谓词）需文档言明 |

## 决策

### §1 · 两层注册表模型（核心架构）

```
┌─ 存在性层（appshell）────────────────────────────┐
│ catalog 载荷（服务端已按租户过滤 = 安全边界）        │
│   → DedicatedNodeRegistration.tester(ns) 评分     │
│   → 最高分 > 0：factory 专属节点                    │
│   → 全部 ≤ 0：schemaToCustomNodes 通用容器          │
│ 回答："这个 namespace 现在存在吗、以什么形态存在"     │
└──────────────────┬───────────────────────────────┘
                   │ 产出的 CustomNodeSpecification[]（含专属+通用+静态 pack）
┌──────────────────▼───────────────────────────────┐
│ 编辑接管层（kernel）                                │
│ resolveCustomNode(customNodes, node) 纯函数         │
│ 回答："这个节点实例的编辑面板归谁"                    │
└──────────────────────────────────────────────────┘
```

- **分层原则 = 业界实践 1**（存在性归数据层，UI 注册表只做增强——VS Code
  custom editors / K8s CRD 视图同构；六实践全景表见 dedicated-node-registry
  设计档 §1）；
- 两层 tester 语义**刻意不同**：存在层对 namespace 载荷**评分**（JSON Forms
  renderer registry 同型，返回 rank 分数）；接管层对节点实例**判谓**
  （返回 boolean，rank 是独立字段）——不共享实现，只共享哲学；
- legacyUdfNode 常驻不受目录管控、静态 spec 数组直传仍合法——两条既有
  兼容路径不变。

### §2 · 编辑接管层机制（内核新增裁定）

**spec 扩展（M1）**——`CustomNodeSpecification` 增两个可选字段：

```ts
tester?: (ctx: NodeMatchContext) => boolean;
rank?: number;                          // 缺省 0
type NodeMatchContext = {
  kind: string;                         // node.data.kind
  type: string;                         // node.type（'customNode'）
  config: unknown;                      // content.config（只读）
  node: DecisionNode;                   // 只读快照
};
```

不声明 tester 的 spec 走 kind 精确匹配，语义与现状完全一致（向后兼容）。

**单一解析器（M2，核心）**——`resolveCustomNode(customNodes, node) →
spec | undefined`，优先级矩阵固定：

1. **内建五节点永远优先**（decision-table / function / expression / input /
   output 的内建路由先行）——**pack 不可劫持内建 kind，这是安全边界**，
   注册表只管辖 customNode 域；
2. kind 精确匹配组，按 rank 降序；
3. tester 谓词组，按 rank 降序；
4. 同 rank 按声明序（确定性——宿主数组顺序不再影响语义）；
5. 开发模式下同分冲突 `console.warn`（生产静默，冲突申报随治理窗验证面板）。

- **消费点收敛（P3）**：六处统一改走 `resolveCustomNode`——`dg-wrapper`（tab
  路由）、`graph`（画布 renderNode）、`node-inspector`（标题区）、`dg-infer`
  （inferTypes，×2）、`diff/utility`（calculateDiff）、`use-node-add`
  （generateNode/onNodeAdd）；各位点把自身节点形态归一为 `NodeMatchContext`
  后调用，`dg-infer` 的 `node.type` 键形差异在收敛批审计（若是错配即顺手修复，
  行为变化进 changelog）；
- **降级语义（P1/P2 补齐）**：kind 精确先行于 tester 谓词（可预期性优先——
  显式声明归属的压过模式匹配的）；tester 抛异常按**不匹配**处理（注册表内
  try/catch，单 pack 故障不拖垮编辑器）；
- **rank 惯例**：常规 pack 不设（=0）；兜底/兼容 pack 负值；官方覆盖正值。

**renderTab 上下文增补（M3）**——props 追加 `disabled` 与只读 `node` 快照：
pack 面板现状感知不到禁用态（disabled 只影响内建 tab）；追加字段对老 pack
无感（向后兼容）。

### §3 · 声明面与状态桥纪律

- **状态桥（硬纪律）**：pack 面板写配置 MUST 走
  `useDecisionGraphActions().updateNode` immer 管道——保证 onChange→自动保存→
  撤销链与内建编辑面完全一致；宿主/pack 不得绕过直改文档；
- **pack 运行时依赖不进注册表**：数据源、API client 由宿主以 props/闭包注入
  pack 组件（query-list 的 roster 数据源即此形态）——内核永远不知道名单从哪来；
- **`definePack()` 声明糖（M4，可选）**：
  `definePack({ namespace, version, license, specs, migrate? })` 将 ADR-009
  meta 从 per-spec 提升为 pack 级自动注入，`migrate` 槽位预留版本迁移器
  （dedicated-node-registry 设计档 §5，治理窗 phase-2 ②）。直接传 spec 数组
  仍合法，不做强制。

### §4 · 降级阶梯（永不白块——重申 ADR-015 §4 并延伸到 pack 域）

| 场景 | 行为 |
| --- | --- |
| spec 命中且有 renderTab | 专属 Tab |
| spec 命中但无 renderTab（容器/旧版 UDF） | CustomFunctionTable 兜底（现状保持） |
| spec 未命中（pack 缺席/被 allowedNamespaces 过滤/tester 全不匹配） | CustomFunctionTable 兜底 |
| tester 抛异常 | 按不匹配 → 兜底（单 pack 故障隔离） |
| 旧图节点 + namespace 被关（存在层场景） | 只读降级 + 运行期错误就地显示（设计档 §3） |

**部分接管**（Unity `DrawDefaultInspector()` 同构）：专属 Tab 内未特化区域
内嵌通用容器渲染，通用能力升级自动传导——四个内建专属 Tab 的改造归宿存在性
层设计档 §4，pack 作者同守此惯例。

### §5 · 边界（明确不做）

1. pack 不可接管内建 kind（§2 安全边界重申，非限制而是防劫持）；
2. **执行语义不并入**：simulateHandler / fixturesRunner 是独立能力槽，编辑
   接管与运行接管分开声明——两者生命周期不同（编辑面板可热换，执行契约冻结）；
3. 显示提示（图标/标题别名）不进 `UdfPackMeta`（ADR-009 元数据最小化纪律）；
4. 内容合并、pack 间依赖排序——无场景不做。

## 实施清单

| # | 项 | 归属 | 量级 | 触发 |
| --- | --- | --- | --- | --- |
| 1 | M1+M2：tester/rank 字段 + `resolveCustomNode` + 六处消费点收敛（含 dg-infer 键形审计）+ 解析器单测（优先级矩阵/异常隔离/冲突 warn） | seal kernel | ~0.75 天 | 同 kind 多代编辑器诉求 |
| 2 | M3：renderTab 上下文增补（disabled + node 快照） | seal kernel | ~0.25 天 | 随 #1 |
| 3 | M4：`definePack` 糖 + NodeMatchContext/resolveCustomNode 公共导出 | seal kernel | ~0.25 天 | 随 #1 |
| 4 | 存在层：注册表 + tester(ns) 评分 + 三级降级 + composeBaseNodes 删除 | seal appshell | 1–2 天 | verdict 第三方 pack（设计档 ②） |
| 5 | 版本迁移器 migrateGraph（具名 seed + rebinder + 显式迁移链） | seal appshell | +0.5–1 天 | 函数 schema 首次 breaking change（设计档 ③） |

#1-#3 全部为 additive 内核改动（老 spec/老宿主/兜底三重向后兼容），可先行；
#4/#5 依赖轨道 B Phase 2 启动。

## 反模式

| 反模式 | 后果 |
| --- | --- |
| tester 退化为按名匹配 | 域形状演化后面板错配——tester MUST 校验形态（设计档实践 2） |
| 用宿主数组顺序表达优先级 | 隐式裁决——争抢 MUST 显式 rank |
| 专属 Tab 整体自绘不嵌通用容器 | 通用能力升级需逐家手动跟（实践 4） |
| 面板绕过 updateNode 管道直改文档 | 撤销/持久化/onChange 链断裂 |
| pack 试 图接管内建 kind | 设计上不可能（解析器第 1 条）；文档不承诺此面 |
| 显示提示塞进 UdfPackMeta | 元数据最小化纪律破防（ADR-009 注记） |

## 开放问题

1. **kind 精确组与 tester 组的相对优先级**——本 ADR 裁定 kind 精确先行
   （可预期性优先）。是否允许高 rank tester 压过低 rank 精确匹配？建议维持
   现裁定（简单可解释），待真实争抢场景检验；
2. **冲突申报形态**——开发模式 console.warn 为首版；是否随治理窗批次 4
   （集中验证面板事件流）升级为结构化事件？建议后者，随 #4 实施；
3. **`resolveCustomNode` 导出面**——纯函数无风险，建议公共导出供宿主自用
   诊断（编辑器外预演"这个节点会归谁"），随 #3 一并定。

## 后果

- **正面**：新增 pack 自带编辑面板 = 纯声明（tester 可选、renderTab 必选），
  内核零改动零发版；三处匹配收敛单点，行为必然一致；优先级从数组顺序升格为
  显式 rank 矩阵；pack 作者学习成本 ≈ 0（复用既有 renderTab 惯例，appshell
  四节点即样例）；与存在性层合流后，"服务端管控存在性 + 客户端声明接管面"
  的完整插件主权模型立法闭合；
- **约束**：两层 tester 语义并存（评分 vs 谓词）须在两档文档中持续言明；
  同分冲突的确定性规则（声明序）意味着宿主仍应固定声明顺序以保证可复现；
  内建 kind 白名单是硬边界——内建新节点类型仍需内核发版；
- **后续条件**：#1-#3 可随任一 minor 先行；#4/#5 待触发条件成熟与轨道 B
  Phase 2 启动。
