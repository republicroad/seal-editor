# ADR-013：输入节点契约统一——InputContract 数据模型与三视图同步机制

## 状态
proposed（2026-09-30 seal-editor 起草）→ reviewed（2026-10-01 jdm-editor 评审）→
**accepted（2026-10-01 seal-editor 按评审调整落档，协商环闭合）**。裁定要点：决策
§1-§4 修改后接受；开放问题 1-5 全部表态闭合（#5 类别错误删除）；五条补充发现
见「评审注记」。**本文档原编号 ADR-012，因与
[012-zen-udf-ports-layered-design.md](./012-zen-udf-ports-layered-design.md)
（端口层分层设计）编号冲突改号 ADR-013——引用面大的一侧（ports 012）不改号**。
输入节点是内核决策图的核心编辑面，涉及三个视图的合并重构与 simulator 联动协议
升级，量级 ~3 天。

## 背景

### 现状

决策图的输入节点编辑面板提供三个页签，引导用户定义决策入参：

| 页签 | 文件 | 行数 | 形态 |
| --- | --- | --- | --- |
| **字段定义**（Definitions） | request-definitions.tsx | 236 | 递归字段树：名称/类型/默认值/描述，支持嵌套子字段、折叠展开 |
| **用例数据**（Examples） | request-examples.tsx | 281 | master-detail：具名数据源列表（左） + 描述 textarea + monaco JSON 编辑器 + inlay hints + 字段摘要（右） |
| **Schema**（Schema） | tab-json-schema.tsx | 226 | 原始 JSON Schema monaco 编辑器（diff 视图对比历史、格式化、JSON→Schema 转换） |

三个页签的**用户价值**：

1. 字段定义引导用户声明决策入参的结构（字段名/类型/描述）——定义即文档；
2. 用例数据提供可运行的输入实例——示例即测试用例；
3. Schema 供高级用户直接编辑 JSON Schema——结构即 API 契约；
4. 三者合并 = 可直接生成 RESTful API 参数文档、SDK 客户端、mock server。

### 问题陈述

三个页签持有**三份独立状态**（三个 hook：useRequestDefinitionsEditing /
useRequestExamplesEditing / useRequestSchemaEditing），靠 node content 间接同步。
这导致：

1. **Schema 变更后 examples 不感知**：用户在 Schema 页签添加了 required 字段，
   切到 Examples 页签，已有 example 不会标红也不会提示缺字段——运行时才炸；
2. **Examples 编辑不校验**：用户在 example 里写了一个不存在的字段或错误类型，
   没有任何创作时反馈——保存后执行才炸；
3. **Definitions 删除字段后 example 静默残留**：残留字段在运行时被忽略——
   用户不知道自己的 example 里有脏数据；
4. **三个 hook 状态同步靠 node content 中转**：Definitions 编辑触发
   onChange → graph content 更新 → Examples 读取新 content——同步链路长且脆。

### 与自定义节点的同等重要性

自定义节点（customNode）的 UDF 生态已有完整的治理体系（ADR-009 函数分层、
ADR-011 参数声明统一、conformance fixtures）。但输入节点是**每一个决策图的
必经入口**——没有输入节点，决策图无法接收数据、无法执行、无法分享。
两个面的设计成熟度应该对等。

## 业界范式

| 范式 | 契约层 | 实例层 | 校验 | 双向派生 |
| --- | --- | --- | --- | --- |
| **Stoplight Studio** | JSON Schema/YAML | 自动生成 fake data + 手动 example | 实时（创作时） | Schema↔Example 双向 |
| **Postman** | Collection schema | 具名 Example（含 mock） | 请求时 | 单向（schema→example） |
| **OpenAPI 3.x** | `schema` + `examples` 字段 | `example` / `examples` 内联 | Prism 实时校验 | — |
| **JSON Schema 2019-09** | `properties` / `required` | `examples[]` / `default` 内联 | ajv 等验证器 | — |
| **react-jsonschema-form** | JSON Schema | formData | 实时（ajv） | Schema→Form 单向 |

收敛原则：

- **Schema 是唯一结构事实源**；example 从属于 schema，被 schema 校验；
- **Examples 是可执行测试用例**，不是静态文档——每个 example 应可一键执行；
- **创作时 quality gate**：schema 与 example 的不一致在编辑时标红，不等运行时；
- **Drift 检测而非自动同步**：schema 变更后 examples 不被静默修改，而是标记
  drifted + 提供显式迁移操作——与数据库 migration 同型。

## 决策

### 1 · InputContract 契约对象

三个页签共享的底层状态收编为一个显式契约对象（zustand store），作为唯一事实源：

```ts
interface InputContract {
  /** JSON Schema（draft 2020-12）——唯一结构事实源 */
  schema: JSONSchema;
  /** 具名示例集——可执行的测试用例 */
  examples: NamedExample[];
}

interface NamedExample {
  id: string;               // 稳定 UUID
  name: string;             // 具名："正常GOLD用户"
  description?: string;
  /** 完整输入实例——simulator 直接消费 */
  data: unknown;
  /** 上次确认合法时的 schema 指纹（canonical stringify → hash） */
  schemaFingerprint?: string;
}
```

**关键设计决策**：

- **schema 用标准 JSON Schema**，不自造 DSL——直接对接 ajv（客户端校验）、
  json-schema-faker（自动生成示例）、OpenAPI（文档导出）、Prism（mock server）；
- **example.data 是完整实例**（simulator 直接消费的形状），不是位置绑定 `;;`
  格式——位置绑定是表达式求值器实现细节，不泄漏到用户面；
- **schemaFingerprint = canonical JSON stringify(schema) 的 hash**：每个
  example 记录自己"最后确认合法时"的 schema 指纹。schema 变更 → 指纹不匹配
  → 标记 drifted → 显示漂移 diff → 用户决定迁移。与数据库 migration 同型。

### 2 · 视图同步：drift 检测，不自动同步

| 编辑视图 | schema 效果 | examples 效果 | 其他视图 |
|---|---|---|---|
| Definitions 添加 required 字段 | schema.properties 新增 | 所有 examples 标记 drifted（缺字段） | Schema 视图更新 JSON |
| Definitions 删除字段 | schema.properties 移除 | 所有 examples 标记 drifted（多余字段） | 同上 |
| Examples 编辑 JSON | schema 不变 | 该 example 的 data 更新 | Definitions / Schema 不变 |
| Schema 编辑 JSON | schema.properties 重写 | Definitions 表单重建；examples 全部校验 | — |

**Drift 不自动修正**——schema 变更后 examples 不被静默修改。提供显式操作：

- **安全漂移**（新增 required 字段缺值、多余字段可移除）→ 批量迁移按钮；
- **不安全漂移**（类型变更）→ 用户逐个决策；
- 漂移分类与报告 = **变更日志面板**（治理窗批次 4）的天然数据源。

**Drift 报告实现口径（评审实施简化）**：逐 example 重校验 + missing/extra/
type-mismatch 三类清单即可——**不做**全量 JSON Schema structural diff（成本高、
迁移 UI 消费不了那么多信息）。

### 3 · Examples 即测试用例

每个 example 带一个**执行按钮**（不是全局 simulate 按钮），一键将该
example 喂给 simulator：

- 结果内联展示在该 example 行下方（result + micros + hit nodes）；
- 校验失败（schema drift）显示漂移 diff；
- **批量执行**：Run all 按钮跑过全部 examples → 结果矩阵
  （example × 结论），即 property-based testing 雏形——
  examples ARE test cases，schema 是 property spec。

**批量执行复用 zen-udf 既有 `runDecisionTests`（评审实施简化；复用形态——executor 反转契约——已立法为 [ADR-014](./014-zen-udf-fixture-contract.md)）**：N 个 example
组装 `DecisionFixture[]` 一次调用，`FixtureReport` 即结果矩阵——不新写 runner。
Run all 的语义与 A5 夹具视图（demo-server `/v1/fixtures/execute`）天然合流，
结果结构一致后两面板可共享组件。

### 4 · 序列化 / 分享

InputContract 整体序列化为自包含 JSON（**信封带 `contractVersion`**——评审修订，
对齐 CONTRACT §8 版本纪律：分享格式无版本号则未来格式演进无升级锚点）：

```json
{
  "contractVersion": 1,
  "schema": { "type": "object", "properties": { ... }, "required": [...] },
  "examples": [
    { "name": "正常GOLD用户", "data": { "customer": { "tier": "GOLD" } } },
    { "name": "边界:零金额", "data": { "customer": { "tier": "GOLD" }, "cart": { "weight": 0 } } }
  ]
}
```

下游消费者：OpenAPI request body、mock server（Prism）、测试夹具、
**规则分享**——接收方导入后立刻看到"这个规则吃什么输入"。

## UI 层配套

视图形态与交互设计见配套文档：[input-node-ui-redesign.md](../archive/plans/input-node-ui-redesign.md)（分屏联动编辑器——Stoplight Studio 范式，reui 组件选型与实施切分）。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. InputContract 统一（本 ADR） | 三视图共享状态、drift 检测、双向派生、可测试 | 三 hook 重构 |
| B. 维持三 hook 独立 + 靠 node content 间接同步 | 零改动 | Schema↔Examples 不感知、漂移静默 |
| C. JSON Schema 表单库（rjsf/Formily）替代 Definitions | 自动表单 | 自定义控件/树形嵌套受限 |

## 实施清单（分归属）

| # | 项 | 归属 | 量级 | 前置 |
| --- | --- | --- | --- | --- |
| 0 | InputContract 数据形状 + 序列化信封（含 contractVersion）定稿，立法档见 [input-contract-spec.md](../design/input-contract-spec.md)——分享格式是跨仓交换物，先立法后实施（ADR-011 契约先行同纪律） | seal-editor kernel | ~0.5 天 | — |
| 1 | InputContract store（合并三 hook → 单 store + drift 检测） | seal-editor kernel | ~1 天 | #0 |
| 2 | Definitions 视图迁移到 contract store | seal-editor kernel | ~0.5 天 | 随 1 |
| 3 | Examples 视图迁移 + drift 徽标 | seal-editor kernel | ~0.5 天 | 随 1 |
| 4 | Schema 视图迁移（monaco ↔ contract 同步） | seal-editor kernel | ~0.5 天 | 随 1 |
| 5 | ajv 客户端实时校验（Examples 编辑时） | seal-editor kernel | ~0.5 天 | 随 1 |
| 6 | 批量仿真（Run all，复用 runDecisionTests）+ 结果矩阵 | seal-editor kernel | ~0.5 天 | 随 3 |
| 7 | 序列化导入/导出（分享格式） | seal-editor kernel | ~0.5 天 | 随 1 |
| 8 | 变更日志对接（漂移报告 → ChangeLogPanel；**数据装配放 kernel，appshell 只消费——薄层纪律**） | seal-editor appshell | ~0.5 天 | 治理窗 |

总量 ~3 天（含测试），可拆两个 PR。

## 开放问题（已裁定，2026-10-01 jdm 评审，逐条闭合）

1. **JSON Schema draft 版本 → 2020-12**：OpenAPI 3.1 对齐（3.0 是 draft-04
   子集，导出会丢表达力）+ ajv v8 的 2020 模块成熟；TypeBox 产出的 keywords
   无 $schema 依赖，与 input schema 同形（长期可互认）；
2. **客户端校验引擎 → ajv core + 2020 模块**（随 #3 支持嵌套的裁定分叉）：
   走仓内 size 预算校准流程（CI 实测口径，预算上调需宿主裁）。若未来收窄为
   顶层+受限嵌套，备选是手写子集校验器（~200 行零依赖）。~~zen-engine wasm
   validate~~ **选项作废**——事实修正：zen-engine-wasm 只导出
   `validateExpression`/`validateUnaryExpression`（表达式语法校验），没有
   JSON Schema 实例校验器（见评审注记·事实核查 3）；
3. **schema 复杂度边界 → 支持嵌套 object/array**：与 ADR-011「仅顶层原始
   类型」裁定**不冲突**——那是 UDF 位置参数绑定域的约束（位置绑定求值器只吃
   原始标量）；输入节点是完整 JSON 实例域，递归字段树本就实现了嵌套。两域
   约束各自成立，勿互串；
4. **example 数量上限 → 无硬上限，软提醒**（>20 提示折叠）：examples 即测试
   用例，存储成本可忽略；硬上限伤「examples ARE test cases」的定位；
5. ~~与现有 `;;` 位置绑定的兼容~~ **问题删除（类别错误）**：`;;` 位置绑定是
   customNode 表达式调用的求值器实现格式；InputContract 的 examples 是完整
   JSON 实例（simulator 直接消费），二者不同层面、无转换关系——原问题与 §1
   「位置绑定不泄漏到用户面」自相矛盾，疑为起草时串了 ADR-011 的上下文。

## 评审注记（jdm-editor 仓，2026-10-01）

> **落档**：以下裁定已于 2026-10-01 并入正文——§2/§3 实施简化、§4
> contractVersion、实施清单 #0 增补与 #8 薄层注记、开放问题 1-5 依裁定闭合、
> 后果-约束增补三条（additive 存储 / 指纹对称 / Y3 回放联动）；文档改号
> ADR-013（补充发现 1）。

### 事实核查（四条属实、一条事实修正、两条补充）

1. **三视图现状——属实**：request-definitions.tsx 236 行 / request-examples.tsx
   281 行 / tab-json-schema.tsx 226 行，三 hook
   （use-request-{definitions,schema,examples}-editing.ts）逐一核实存在；
2. **「Schema 变更 examples 不感知/编辑不校验/删字段残留」三问题——属实**
   （同步链路经 node content 中转，无创作时校验闸）；
3. **「zen-engine wasm validate（已在包内）」——事实错误（开放问题 2 前提）**：
   zen-engine-wasm 只导出 `validateExpression`/`validateUnaryExpression`
   （zen-expression **表达式语法**校验），**没有 JSON Schema 实例校验器**。
   InputContract 的 instance-vs-schema 校验靠不了它；
4. **zustand 单 store——与仓内惯例一致，无需论证**：dg-store/dt-store/
   expression-store 三个既有 store 全是 zustand context 形态，InputContract
   store 是第四个同构成员；
5. 补充：ajv 两仓 kernel 均未引入（新依赖确认）；
6. 补充：zen-udf `runDecisionTests`（fixtures.ts，已导出 DecisionFixture /
   Expectation / FixtureReport，demo-server `/v1/fixtures/execute` 已包裹）——
   「examples 即测试用例」在决策层已有现成执行引擎（见 §3 裁定）。

### 逐节裁定

| 节 | 裁定 |
| --- | --- |
| 决策 §1 InputContract | **修改后接受**：schema 用标准 JSON Schema、example.data 完整实例、schemaFingerprint 漂移锚三个决策全部成立。修订一条：**序列化信封增 `contractVersion` 字段**（对齐 CONTRACT §8 版本纪律——分享格式无版本号，未来格式演进无升级锚点，一行成本） |
| 决策 §2 drift 检测 | **接受方向**。「漂移分类（安全批量迁移/不安全逐个决策）」设计健全。实施注记：drift 报告用**逐 example 重校验 + missing/extra/type-mismatch 清单**即可——勿做全量 JSON Schema structural diff（成本高、迁移 UI 消费不了那么多信息） |
| 决策 §3 Examples 即测试用例 | **接受 + 实施简化**：批量执行与结果矩阵**复用 zen-udf 既有 `runDecisionTests`**（N 个 example 组装 DecisionFixture[] 一次调用，FixtureReport 即结果矩阵）——勿新写 runner。 Run all 的语义与 A5 夹具视图（demo-server /v1/fixtures/execute）天然合流，结果结构一致后两面板可共享组件 |
| 决策 §4 序列化/分享 | **接受**（并入 contractVersion 修订） |
| 备选方案 / 实施清单 | **接受**，量级合理。#8 归属 appshell 提醒：appshell 薄层纪律（新能力长在 kernel）——漂移报告对接 ChangeLogPanel 的数据装配放 kernel，appshell 只消费 |
| UI 配套文档 | 本次不评审，随实施评审 |

### 开放问题表态（1-5）

1. **draft 版本：2020-12**——OpenAPI 3.1 对齐（3.0 是 draft-04 子集，导出会丢
   表达力）+ ajv v8 的 2020 模块成熟；TypeBox 产出的 keywords 无 $schema 依赖，
   与 input schema 同形（长期可互认）；
2. **校验引擎：跟随开放问题 3 分叉**——若支持嵌套（本评审推荐）→ **ajv core +
   2020 模块**，走仓内 size 预算校准流程（CI 实测口径，预算上调需宿主裁）；
   若收窄为顶层+受限嵌套 → 手写子集校验器（~200 行零依赖）。**「zen-engine
   wasm validate」选项作废**（见事实核查 3）；
3. **复杂度边界：支持嵌套 object/array**——与 ADR-011「仅顶层原始类型」裁定
   **不冲突**：那是 UDF 位置参数绑定域的约束（位置绑定求值器只吃原始标量）；
   输入节点是完整 JSON 实例域，递归字段树本就实现了嵌套，决策输入天然嵌套
   （customer.tier 类）。两域约束各自成立，勿互串；
4. **数量上限：无硬上限，软提醒**（>20 提示折叠）——examples 即测试用例，
   存储成本可忽略；硬上限伤「examples ARE test cases」的定位；
5. **`;;` 位置绑定兼容：类别错误，删除此问**——`;;` 位置绑定是 customNode
   表达式调用的求值器实现格式；InputContract 的 examples 是完整 JSON 实例
   （simulator 直接消费），二者不同层面、无转换关系。本 ADR §1 自己已写
   「位置绑定是表达式求值器实现细节，不泄漏到用户面」——开放问题 5 与之
   自相矛盾，疑为起草时串了 ADR-011 的上下文。

### 补充发现（五条，前两条为实施前置）

1. **ADR 编号冲突（改号 ADR-013）**：仓内已有
   `012-zen-udf-ports-layered-design.md`（d10d30c，ADR-011/评审记录/跨仓记忆
   多处引用「ADR-012=端口层分层设计」）——本文档改号 **013**，ports 012 不动
   （引用面大的一侧不改号）。改号后实施清单/引用同步；
2. **图 interchange 兼容（必须补进「后果-约束」）**：InputContract 落 node
   content 后，同一张图会被两仓 kernel、新旧版本、playground/demo-server 打开
   ——存储形态 **MUST additive**：InputContract 作为 content 新增子对象（如
   `content.inputContract`），原 schema/examples 字段保留为 legacy 读取回退，
   首次编辑时迁移写入（dt 换装的 additive 纪律同款）。**跨仓图分享向前兼容
   是硬约束**，此条不落则分享格式即 breaking；
3. **schemaFingerprint 与回放钉扎对称**：输入侧 schema 指纹 + 此前呈报的
   pack 侧版本钉扎（journal 记 pack version）= 信任链两端的漂移检测同构——
   建议 ADR 记一笔对称性，verdict 侧将来复用同一指纹纪律；
4. **drift 迁移与 Y3 回放联动**：example 迁移（补 required 缺省值）后应重算
   inputHash 并使旧审计事件仍可回放（旧 input + 旧图版本）——迁移不覆盖历史
   记录，只影响新执行；
5. **实施清单增补 #0**：InputContract 数据形状 + 序列化信封（含
   contractVersion）先定稿并入 CONTRACT.md 输入侧一节（或独立小节）——分享
   格式是跨仓交换物，先立法后实施（ADR-011 契约先行同纪律）。

## 实施注记（2026-10-01，批次一落档）

批次一已实施（清单 #0-#4：契约层/双写存储/指纹/漂移引擎/迁移 UI；立法档见
[input-contract-spec.md](../design/input-contract-spec.md)）。一处**机制偏差**
申报，待实施评审裁定：

- §1 原文「zustand store 作为第四个同构成员」→ 实施为**契约模块（纯函数）+
  单写漏斗**：读/写/指纹/漂移/迁移收敛于 `helpers/request-schema/contract.ts`，
  三编辑 hook 与模拟器持久化统一经它读写 content；三 hook 保留的只是纯会话
  草稿态（防抖/脏标），node content 仍是唯一事实源；
- 理由（详展见 spec §5）：唯一持久副本是 node content，zustand store 会引入
  第二权威副本与同步税（undo/切图/上传/模拟器保存都要双向对账）；InputContract
  是单页签会话态，与既有三 store 的跨面板作用域错配；additive 双写决定写路径
  无论如何穿过 updateNode，store 只能坐在漏斗旁边而非替代它；§1 被评审接受的
  三条根基决策（标准 JSON Schema / 完整实例 / 指纹锚）不受机制影响；
- **改判条件**（任一成真则晋升 zustand——把模块函数包进 store 壳，语义层零
  改动）：① 出现页签外消费者（Run-all 矩阵面板/跨面板漂移视图）；② jdm 按
  字面实施 zustand 版本，两仓机制同构成为移植显性成本；③ 草稿同步效应持续
  产 bug（store 单一状态机本身即 Bug 面收敛手段）。
  **裁定（2026-10-01 jdm 批次一验收，spec §7）：偏差接受——字面 zustand 化
  不作义务，留作未来需要响应式跨面板订阅时的机械重构选项。**

另注（批次二设计裁定）：ajv 约束校验与指纹锚协议**正交**——指纹戳记以定义
走查为准（评审 §2「逐 example 重校验」的锚定语义维持结构层），约束违例
（required/min/max/enum/pattern）作为实时警告呈现，不阻塞戳记；ajv 懒加载
（动态 import 独立 chunk），主入口体积预算不动。

## 后果

- 正面：三视图共享状态消除漂移静默；schema↔example 漂移在创作时暴露；
  examples 升级为可执行测试用例；序列化格式可直接生成 OpenAPI/mock/测试夹具；
  输入节点与自定义节点的设计成熟度对等；
- 约束：三个 hook 重构为单 store（内核变更，量级最大的一批）；ajv 依赖引入
  需评估体积预算；Definitions 视图的树形嵌套编辑不受影响（仅数据源换）；
- **图 interchange 兼容（硬约束，评审补充发现 2）**：InputContract 落 node
  content 后，同一张图会被两仓 kernel、新旧版本、playground/demo-server 打开
  ——存储形态 **MUST additive**：InputContract 作为 content 新增子对象（如
  `content.inputContract`），原 schema/examples 字段保留为 legacy 读取回退，
  首次编辑时迁移写入（dt 换装 additive 纪律同款）。跨仓图分享向前兼容不可破，
  此条不落则分享格式即 breaking；
- **指纹对称性（评审补充发现 3）**：输入侧 schemaFingerprint（本 ADR）与
  pack 侧版本钉扎（journal 记 pack version）构成信任链两端的漂移检测同构
  ——verdict 侧将来复用同一指纹纪律；
- **drift 迁移与回放联动（评审补充发现 4）**：example 迁移（补 required
  缺省值）后重算 inputHash；迁移不覆盖历史审计记录（旧 input + 旧图版本仍可
  回放），只影响新执行；
- 协商方式：jdm-editor 在本文档逐节标注（接受/否决/修改），裁定后更新
  状态行；实施随内核 minor 发版。
