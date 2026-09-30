# ADR-011：zen-udf 参数声明统一与 defineTool 声明体验——0.11.0 演进提案

## 状态
implemented（2026-09-29 zen-udf 0.11.0 发布：e4be74d1 理想态 tool()/pack()+conformance fixtures、e4edea68 R1 required 语义；contrib 示范迁移随 0.11.x；原）（2026-09-29 seal-editor 起草，同日 jdm-editor 评审 + 宿主裁定：**直接以理想态实施**——问题陈述事实修正 + 决策 1 两条修订 + 多语言 contract-first 修订 + 开放问题 1-5 表态，见「评审注记」「多语言修订」节；zen-udf 后续路线见「后续规划」节。基石交付物=**语言中立工具契约规范 + conformance fixtures**（多语言移植的执行模式基石，1.0 前试验窗口内定稿）。zen-udf 单一源与
发布方在彼仓（ruling 12）；实施随 0.11.0 在彼仓进行，本仓侧联动项见实施清单 #3）

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

## 评审注记（jdm-editor 仓，2026-09-29——zen-udf 唯一源仓的协商裁定）

### 事实核查（五条断言/发现，三条修正两条补充）

1. **「读点只读扁平形态」——属实**（validatePositionalArgs 读 schema.parameters）；
2. **「parametersSchema 注册的工具校验恒通过、绑定恒空」——表述不准，实证修正**
   （bun 实测当前 0.9.0，两条注册路径一致）：
   - normalizeUdfSchema 自 U7（09-13，早于分叉）即有**双向派生**——parametersSchema
     注册自动派生扁平 parameters，合法位置参数的校验/绑定均正常工作；
   - **真实缺陷在缺参语义**：validatePositionalArgs 跳过越界位（注释假定 funcBindParams
     以默认值补齐）、funcBindParams 对缺位静默填**空字符串**、且派生函数**丢弃
     required 数组**——schema 工具的必填约束在规范表示里就不存在。A3 端点以
     kwargs 对象风格调用经位置换算得空串参数，即「绑定恒空」的观察真相；
3. **「视图输出不变」——成立**（视图本就优先输出 parametersSchema）；
4. **补充实测（2026-09-29，注册示例走查发现第四条缺陷）**：**ContribToolDef 没有
   `parameters` 扁平字段**——经 defineTool + registerTools 注册的工具，扁平声明被
   **静默丢弃**（validate 恒 `[]`、bind 恒 `{}`），只有 `parametersSchema` 透传
   （扁平形态仅 registerUdf 路径支持）。这是「双形态」的第三种空转：入口不一致。
   **对 seal A3 排障的直接价值**：本仓 demo 观察到的「绑定恒空」很可能就是
   defineTool+扁平 的组合（而非 parametersSchema 注册路径）；
5. **R1 缺陷的实锤复现**：`required: ['income']` 的工具 `validatePositionalArgs(name, [])`
   返回 `[]`（应报 income required）——即上述「越界位跳过」的实测例，R1 修复的
   验收断言直接以此为准。

**结论：归一化方向正确且必要，但仅「读点收敛」修不掉上述缺陷——§1 必须补
required 语义与缺参失败语义的明确条款（见修订 R1）。**

### 逐节裁定

| 节 | 裁定 |
| --- | --- |
| 决策 §1 归一化 | **修改后接受**。修订两条：**R1** 派生必须携带 required（映射为扁平无 default），并新增「缺必填位置参数 → validate 报错 / bind 拒绝」的显式失败语义——否则本节目标「双形态空转从机制上消失」不成立（消失的只是形态差，缺参静默仍在）；**R2** 归一化落点扩展现有 normalizeUdfSchema（U7 双向派生骨架），不新写 |
| 决策 §2 defineTool | **接受方向**。开放问题 1 表态：内建 P.* 为默认（TypeBox 的 type-marker 推导思路自研约百行级可行）；zod/TypeBox 作 defineTool 入口逃生舱输入，不进核心 |
| 开放问题 2 | **维持仅顶层原始类型**——与 schema-container-tab 的下拉+位置参数交互模型一致 |
| 开放问题 3 | 0.11.0 在扁平声明位打 deprecated（A4 机制现成）；物理移除随 1.0 |
| 开放问题 4 | defineTool 新增推荐位即可；#4 迁移示范做 1-2 个域，不排全量时间表 |
| 开放问题 5 | **口径修正**：「回归语料补双形态等价性」表述有歧义——861 例语料是表达式语言，与本 ADR 无关。等价性用例落在 register.test.ts / udf-pack.test.ts，且**四点口径**：同函数双形态注册 → validatePositionalArgs / **缺参报错** / funcBindParams / call 逐字段相等 |
| 工作量估计 | 修正：归一化含 required 语义与缺参失败语义后 **~1 天**（原 0.5 偏乐观，含四点等价性用例）；其余估计合理 |

## 多语言修订（contract-first——zen-udf 未来移植各部署后端语言的前提）

若 zen-udf 将随 zen-engine 部署后端移植多语言（Go/Rust/Python 等），业界收敛
实践是 **契约先行、DX 本地化**（MCP/gRPC-IDL/Terraform plugin protocol/Spark UDF
目录签名同构）：跨语言的只有规范表示与语义字段，一切声明期糖衣是各语言本地实现。
对本 ADR 的三条修订：

1. **§1 升格为「契约层」章节**：规范表示 = 唯一跨语言契约，必须语义自足——
   required/default/semantics/idempotent/deprecated 全部在 JSON Schema（含扩展
   字段）中可得，移植语言零重推导即可实现 validate/bind。R1 由「应该」升级为
   「必须」（否则每个移植版各自重造必填语义并各自不一致）；
2. **§2 重新定位为「TS DX 层」**：defineTool/P.* 是 TS 侧惯用糖（编译期推导是
   TS-only 产物，天然不随移植走），输出即契约；各语言移植版实现等价 builder
   （Go functional options / Python dataclass+pydantic 等），验收唯一标准 =
   输出符合契约的规范表示。开放问题 1（builder 选型）随之**降级**——选错可换，
   它不是契约的一部分；
3. **新增交付物：语言中立 conformance fixtures**——双形态等价性用例以 JSON
   fixtures 形式入 zen-udf 包（与 expression-regression 语料同思路、同目录层级），
   TS 单测消费它，语言移植版跑同一份即得 conformance。TS 单测不随移植走，
   fixtures 会。**这是开放问题 5 的最终答案**。

**宿主裁定（2026-09-29）**：本节升格为 ADR 主旨——zen-engine 未来在多后端语言执行，
zen-udf 移植各语言时，「统一的工具声明与执行模式约束规范 + conformance fixtures」是
基石；1.0 前无生态负担，直接按理想模式设计（TypeBox 结案开放问题 1：schema-as-type
不重造）。交付顺序：①契约规范（语言中立）→ ②conformance fixtures → ③TS 参考实现
（tool()/pack()）→ ④contrib 示范迁移。

配套五条最佳实践：契约是产品 DX 是适配；规范表示语义自足（零重推导）；一致性
用例语言中立（fixtures 即规范）；编译期机制永不进运行时表示（type-brand symbol
不得渗入 JSON Schema）；契约带版本字段（schema 方言版本入 pack meta 或文档）。

## 后续规划（zen-udf，0.11.0+）

| 版本 | 内容 | 备注 |
| --- | --- | --- |
| 0.10.x | 已发布：引擎 2.1.0 + 回归语料 861 例（分歧台账 6 条） | 语料即引擎升级的一键验证网 |
| **0.11.0** | 本 ADR 修订后范围：normalizeUdfSchema 扩展（R1 required 语义 + 缺参失败语义）+ defineTool/P.* DX 层 + **conformance fixtures（语言中立）** + 四点等价性用例 + 扁平声明位 deprecated | 实施清单 #1/#2/#4，~1.5-2 天 |
| 0.11.x | dt 域 vs 2.1.0 内建重叠 review（回归语料为对照基准，结论写回时间函数盘点文档） | ~半天 |
| 0.12 候选 | 上游 issue 反哺跟进（时间函数盘点 P1：now/today+isBetween；宿主手动提交后随上游版本吸收） | 依赖上游 |
| 多语言移植 | contract-first：fixtures 即移植 conformance；各语言 builder 输出契约即可 | 触发=真实部署后端语言出现 |
| ADR-009 尾项 | #4 verdict 升级消费 / #5 行业包骨架 | verdict 侧会话 |


## 后果

- 正面：双形态空转从机制上消失；贡献域作者 DX 对齐 MCP SDK 业界标准；参数
  漂移编译期防护；本仓 A3 特例回退；ADR-009 #4"统一 API"在声明层收口；
- 约束：zen-udf 0.11.0 增量（归一化 + builder）；扁平声明位进废弃周期；
  本仓需随 1 发版回退特例；
- 协商方式：jdm-editor 仓在本文档逐节标注（接受/否决/修改），裁定后更新
  状态行；实施随 zen-udf 0.11.0，本仓侧联动项见实施清单 #3。
