# ADR-011：zen-udf 参数声明统一与 defineTool 声明体验——0.11.0 演进提案

## 状态
proposed（2026-09-29 seal-editor 起草，**待 jdm-editor 仓协商裁定**——zen-udf 单一源与
发布方在彼仓（ruling 12），本 ADR 为移交协商稿。协商方式沿 ADR-010 惯例：逐节标注
接受/否决/修改，并更新本状态行）

## 背景

两条独立线索在本仓实践中汇聚为同一个演进诉求：

1. **双形态静默空转（本仓 A3 首跑实测，2026-09-29）**：zen-udf 工具参数声明是
   向后兼容双形态——扁平 `parameters: Record<名, {type, description, default}>` 与
   完整 `parametersSchema`（标准 JSON Schema）"二选一或并存"（register.ts）。
   而 `validatePositionalArgs`/`funcBindParams` **只读扁平形态**
   （`if (!schema?.parameters) return []`）——经完整 parametersSchema 注册的工具
   （本仓 demo 的 roster）校验恒"通过"、绑定恒空 kwargs，**无任何报错**。jdm 原型
   未暴露：其演示工具 legacy_hash 是扁平注册。
2. **声明体验（DX）**：现状注册需手写完整 JSON Schema 树，且 fn 签名与 schema
   分离——`kwargs: Record<string, unknown>` 无类型、参数名漂移无编译期防护。

业界对「函数 + schema + handler」声明模式有收敛实践：MCP TypeScript SDK
（`registerTool(name, { inputSchema: zodSchema }, handler)`）、Vercel AI SDK
（`tool({ parameters: z.object(...) , execute })`）、LangChain.js、TypeBox+Fastify——
共同结构是 **schema builder + handler 泛型推导**（builder 既是 schema 来源又是
handler 参数类型来源），而非装饰器语法（TC39 装饰器类型擦除，无法做类型级推导；
reflect-metadata 路线对 published lib 是 tsconfig 侵入，**否决**）。

## 决策（两项，互为表里）

### 1 · 参数声明统一：形态二为唯一规范表示，注册期归一化

- **声明 API 保持双形态兼容**（零破坏）：`parameters` 扁平入参在注册期**派生**为
  parametersSchema 后丢弃；内部 `functions` map 只存规范表示；
- **读点收敛**：`validatePositionalArgs`/`funcBindParams` 改读规范表示——双形态
  工具的校验/绑定空转问题从机制上消失；
- **派生边界（需写进文档）**：仅顶层原始类型属性可互派；复杂 schema
  （嵌套/anyOf/$ref）标记"无位置绑定"，validate/bind 对其显式跳过并记录
  （沿用 ADR-009"显式优于隐式"取向）；
- **required/default 映射约定**：扁平无 default = 必填 ↔ parametersSchema 显式
  `required` 数组；default 双向保留；
- **并存冲突**：双形态同给时 parametersSchema 赢（表达力超集），扁平仅补
  description/default，冲突打 dev 警告。

### 2 · defineTool 声明层（DX）

```ts
const rosterTool = defineTool({
  name: 'roster',
  description: '查询名单：在服务端名单中查询某个值是否存在',
  semantics: 'query',                    // ADR-009 语义三元进声明位
  parameters: P.object({
    roster: P.string({ description: '服务端名单名称' }),
    value:   P.string({ description: '待查询的值' }),
  }),
  returns: P.object({}),
  // deprecated: { since, note },        // A4 位
}, async (kwargs) => { ... });           // kwargs 类型由 parameters 推导
```

- **builder 选型（开放问题 1）**：内建微构建器 `P.*`（零依赖，恰好覆盖 UDF 参数
  的原始类型 + object/array 面，~50 行）为默认提案；TypeBox/zod 作适配层备选
  （宿主生态要求时经 defineTool 入口收编，不进核心——元数据最小化纪律同理）；
- **泛型推导**：builder 的 properties 映射为 handler kwargs 类型——参数名漂移 =
  编译错误；semantics/idempotent/deprecated 同声明位收编（现四态注册 API
  registerUdf/registerTools/defineContrib/defineToolFor 保留兼容，
  defineTool 为推荐新写法——ADR-009 #4 的"统一 API"在声明层的延续）；
- defineTool 产物即 §1 的规范表示：**单声明派生全部内部形态**，双形态在声明层
  就不再出现。

## 影响与受益

- **本仓（seal-editor）**：A3 端点的 view-driven 校验/绑定特例可回退为 registry
  直调（repl-panel-plan.md §3.5 注记升级为回退条件）；贡献域作者获得 MCP SDK
  同款声明体验；定义漂移从运行期静默错配变为编译期报错；
- **jdm 侧工作量估计**：归一化 ~0.5 天（注册路径与 0.9.0 撞名检测同点）+
  defineTool/builder ~1 天 + 废弃标记随 minor；回归语料 861 例补"双形态注册
  等价性"用例（~0.5 天）；
- **兼容性**：声明 API 不破坏；内部表示变化对消费方不可见
  （udfFunctionSchemaNamespaces 视图输出不变）。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 形态二归一 + defineTool（本 ADR） | 读点收敛、DX 对齐业界、漂移编译期防护 | zen-udf 0.11.0 增量改动 |
| B. 保持双形态，validate/bind 回退读 parametersSchema | 零归一化 | 双表示永续；每个服务端消费者复刻诀窍（本仓 A3 已踩） |
| C. 直接废弃扁平、只收 parametersSchema（无派生） | 表示最纯 | 破坏现存注册方，迁移成本全转嫁 |
| D. reflect-metadata 装饰器路线 | 表面贴近 Python | 类型擦除 + tsconfig 侵入——对 published lib 否决 |

## 实施清单（分归属）

| # | 项 | 归属 | 触发 |
| --- | --- | --- | --- |
| 1 | 注册期归一化（parametersSchema 唯一规范表示 + 读点收敛 + 回归语料补双形态等价性） | zen-udf（jdm-editor） | 0.11.0 候选 |
| 2 | defineTool + P builder + 泛型推导（含单测：推导正确性/注册撞名/meta 协同） | zen-udf（jdm-editor） | 随 1 |
| 3 | 本仓 A3 端点回退 registry 直调（删 view-driven 特例） | seal-editor | 随 1 发版 |
| 4 | defineContrib 迁移示范（contrib 域改写为 defineTool，作文档范例） | zen-udf（jdm-editor） | 随 2 |

## 开放问题（逐条协商）

1. **builder 选型**：内建 `P.*` 微构建器（默认提案，零依赖）vs TypeBox vs zod 适配层？
2. **复杂 schema 的位置绑定边界**：嵌套/anyOnly 属性是否值得支持位置绑定，
   还是维持"仅顶层原始类型"？
3. **废弃周期**：扁平 parameters 的声明位何时打 deprecated（0.11.0 警告、
   何时物理移除——建议跟随 1.0/major）？
4. **defineTool 与现四态 API 的关系**：新增推荐位即可，还是排 defineContrib
   的迁移时间表？
5. **回归语料**：双形态等价性用例的口径（同函数双形态注册 → validate/bind/
   call 结果逐字段相等）？

## 后果

- 正面：双形态空转从机制上消失；贡献域作者 DX 对齐 MCP SDK 业界标准；参数
  漂移编译期防护；本仓 A3 特例回退；ADR-009 #4"统一 API"在声明层收口；
- 约束：zen-udf 0.11.0 增量（归一化 + builder）；扁平声明位进废弃周期；
  本仓需随 1 发版回退特例；
- 协商方式：jdm-editor 仓在本文档逐节标注（接受/否决/修改），裁定后更新
  状态行；实施随 zen-udf 0.11.0，本仓侧联动项见实施清单 #3。
