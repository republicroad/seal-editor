# ADR-012：输入节点契约统一——InputContract 数据模型与三视图同步机制

## 状态
proposed（2026-09-30 seal-editor 起草，**待 jdm-editor 协商裁定**——输入节点是内核
决策图的核心编辑面，涉及三个视图的合并重构与 simulator 联动协议升级，量级 ~3 天。
协商方式沿 ADR-010/011 惯例：逐节标注接受/否决/修改，更新本状态行）

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

### 3 · Examples 即测试用例

每个 example 带一个**执行按钮**（不是全局 simulate 按钮），一键将该
example 喂给 simulator：

- 结果内联展示在该 example 行下方（result + micros + hit nodes）；
- 校验失败（schema drift）显示漂移 diff；
- **批量执行**：Run all 按钮跑过全部 examples → 结果矩阵
  （example × 结论），即 property-based testing 雏形——
  examples ARE test cases，schema 是 property spec。

### 4 · 序列化 / 分享

InputContract 整体序列化为自包含 JSON（schema + examples）：

```json
{
  "schema": { "type": "object", "properties": { ... }, "required": [...] },
  "examples": [
    { "name": "正常GOLD用户", "data": { "customer": { "tier": "GOLD" } } },
    { "name": "边界:零金额", "data": { "customer": { "tier": "GOLD" }, "cart": { "weight": 0 } } }
  ]
}
```

下游消费者：OpenAPI request body、mock server（Prism）、测试夹具、
**规则分享**——接收方导入后立刻看到"这个规则吃什么输入"。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. InputContract 统一（本 ADR） | 三视图共享状态、drift 检测、双向派生、可测试 | 三 hook 重构 |
| B. 维持三 hook 独立 + 靠 node content 间接同步 | 零改动 | Schema↔Examples 不感知、漂移静默 |
| C. JSON Schema 表单库（rjsf/Formily）替代 Definitions | 自动表单 | 自定义控件/树形嵌套受限 |

## 实施清单（分归属）

| # | 项 | 归属 | 量级 | 前置 |
| --- | --- | --- | --- | --- |
| 1 | InputContract store（合并三 hook → 单 store + drift 检测） | seal-editor kernel | ~1 天 | — |
| 2 | Definitions 视图迁移到 contract store | seal-editor kernel | ~0.5 天 | 随 1 |
| 3 | Examples 视图迁移 + drift 徽标 | seal-editor kernel | ~0.5 天 | 随 1 |
| 4 | Schema 视图迁移（monaco ↔ contract 同步） | seal-editor kernel | ~0.5 天 | 随 1 |
| 5 | ajv 客户端实时校验（Examples 编辑时） | seal-editor kernel | ~0.5 天 | 随 1 |
| 6 | 批量仿真（Run all）+ 结果矩阵 | seal-editor kernel | ~0.5 天 | 随 3 |
| 7 | 序列化导入/导出（分享格式） | seal-editor kernel | ~0.5 天 | 随 1 |
| 8 | 变更日志对接（漂移报告 → ChangeLogPanel） | seal-editor appshell | ~0.5 天 | 治理窗 |

总量 ~3 天（含测试），可拆两个 PR。

## 开放问题（逐条协商）

1. **JSON Schema draft 版本**：2020-12 还是 07？（影响 ajv 版本与 OpenAPI 兼容）
2. **客户端校验引擎**：ajv（生态标准，~65kB gzip）vs 纯函数手写 vs zen-engine
   wasm validate（已在包内）？
3. **schema 复杂度边界**：只支持顶层原始类型属性（与 Definitions 表单能力一致）
   还是支持嵌套 object/array？
4. **example 数量上限**：是否设上限（如 20 个）防止 examples 无限膨胀？
5. **与现有 `;;` 位置绑定的兼容**：旧图的 expressions 是位置绑定格式——
   InputContract 存储后是否自动转具名调用（$call）？

## 后果

- 正面：三视图共享状态消除漂移静默；schema↔example 漂移在创作时暴露；
  examples 升级为可执行测试用例；序列化格式可直接生成 OpenAPI/mock/测试夹具；
  输入节点与自定义节点的设计成熟度对等；
- 约束：三个 hook 重构为单 store（内核变更，量级最大的一批）；ajv 依赖引入
  需评估体积预算；Definitions 视图的树形嵌套编辑不受影响（仅数据源换）；
- 协商方式：jdm-editor 在本文档逐节标注（接受/否决/修改），裁定后更新
  状态行；实施随内核 minor 发版。
