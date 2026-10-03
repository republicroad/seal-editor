# ADR-016: 自定义函数参数值信封（TypedValue）——模式显式化与字面量歧义根治

- 日期：2026-10-04
- 状态：**proposed 待 zen-udf / jdm 协商**（宿主已定方向：功能重要，考虑引擎原生支持）
- 目标版本：zen-udf **1.1.0 候选**（minor，判证见 §6）
- 上位：[ADR-015](./015-custom-function-node-spec.md)（调用规范 `{$call, kwargs}`）、
  [ADR-011](./011-zen-udf-param-declaration-evolution.md)（参数声明/顶层原始类型）、
  seal [typed-input-spec](../design/typed-input-spec.md) §7（存储协议与信封来龙去脉）、
  [custom-node-editor-spec](../design/custom-node-editor-spec.md) §5（两路线雏形）
- 归属：zen-udf（引擎语义）+ seal-editor（存储与编辑面）

## 1 · 问题

kwargs 值的现状是**按 zen 表达式求值**（裸标识符解析输入字段、引号包裹 = 字符串字面量、
数字/布尔 = 字面量）——**这是宿主的设计目的，本 ADR 不改变它**（与 DMN FEEL 同构，
JDM 决策表血统）。它带来的问题是：参数值的「模式」全靠**隐式约定**承载：

1. **字面量歧义**：想要字符串字面量 `$.customer`（或任何长得像表达式的串）时，
   唯一逃生是手写引号仪式 `"$.customer"`——写错即静默变语义（求值成 undefined）；
2. **编辑器无法自证模式**：seal Typed Input（字面量/表达式/引用三模式）写入存储的
   模式信息，引擎侧无对应语义——混合协议下非字面量以 `{mode, value}` 对象入存储，
   **直连引擎执行存图的宿主会拿到信封对象而执行错**（demo-server 的
   expandTypedValues 是执行边界过渡层，契约空白）；
3. **收紧被锁**：存储全量信封化（规格原文「新写入始终 TypedValue 形态」）需要引擎
   原生认信封，否则每个执行方都要守展开义务。

## 2 · 不变量（宿主设计目标立法）

- **I1 裸字符串恒按表达式求值**——信封不改变任何既有合法输入的行为；
- **I2 引号惯例长期共存**——`"sha256"` 继续合法，信封是并列的显式通道非替代；
- **I3 信封是 opt-in 结构化通道**——只在作者显式表达模式时出现（编辑器三模式写入）。

## 3 · 信封语义设计（提案）

### 3.1 形态与窄识别

kwargs 值 / `$positional` 数组元素可为信封对象：

```jsonc
{ "mode": "literal",    "value": "($.customer)" }   // 字面量：原样绑定，不求值
{ "mode": "expression", "value": "$.vip ? 'a' : 'b'" } // 表达式：求值
{ "mode": "reference",  "value": "customer.tier" }  // 引用：按 $.value 路径求值
```

**窄识别**（防误伤）：自有键**恰为** `mode` + `value` 二键，且 `mode` ∈
`literal | expression | reference`，且 `value` 为字符串——否则按现状处理
（对象值本就出契约：ADR-011 顶层原始类型政策下合法 pack 不产生）。

### 3.2 模式语义

| mode | 绑定语义 | 与裸值惯例的关系 |
| --- | --- | --- |
| `literal` | `value` **原样绑定，不求值**——无引号仪式 | 引号惯例的显式替代（`{"mode":"literal","value":"sha256"}` ≡ 裸值 `"sha256"`，但编辑器无需仪式） |
| `expression` | `value` 按 zen 表达式求值 | ≡ 裸字符串（显式版） |
| `reference` | 按 `$.value` 路径求值；**首期 ≡ expression**（归一化加 `$.` 前缀），预留输入 schema 校验位 | 裸标识符的显式版 |

- **嵌套禁止**：信封 `value` 内不再嵌信封（组合爆炸，Typed Input 规格 §5 同款）；
- **mode 感知校验**：`validateNamedArgs` 按模式校验——`literal` 的 value 按声明
  参数类型直校（`{mode:'literal', value:'abc'}` vs 声明 number → typeMismatch）；
  `expression` 可选静态合法性校验（zen-expression validator 已有，OQ4）；
- **版本透明**：识别纯 additive——1.0 契约内的全部合法输入行为零变化（§6 判证）。

## 4 · 备选形态对照（协商点）

| 形态 | 先例 | 评估 |
| --- | --- | --- |
| **(a) 值对象 `{mode, value}`（推荐）** | Node-RED Typed Input `{type, value}` 结构化对 | 与 seal 存储直通零转换；窄识别干净；`$call/$positional` 保留键家族的自然并列 |
| (b) 键后缀标记 `roster$: "$.x"` | AWS Step Functions `.$` 后缀 | 键携带模式、值恒字符串；但与 `$` 保留键家族语义混淆（`roster$` 是输出键还是标记？），seal 存储需二次转换 |
| (c) 保留键包装 `{$lit: "..."} / {$expr: "..."}` | `$call/$positional` 家族内自洽 | 每值一对象与 (a) 等价但模式枚举散落键名，validateNamedArgs 分支更碎 |

## 5 · 业界参照

| 实现 | 模式承载 | 对本设计的启示 |
| --- | --- | --- |
| **DMN FEEL**（JDM 血统） | 表达式默认 + 引号字面量 | **I1/I2 即 DMN 同构**——信封不背离标准，是叠加 |
| **AWS Step Functions** | 键后缀 `.$` = 路径，缺省 = 字面量 | opt-in 标记的保守形态——对照后仍选 (a)（键标记与保留键家族冲突） |
| **Azure Logic Apps** | `@` 前缀 / `@{}` 插值 | 带内标记的歧义面（内容以 @ 开头即踩雷）——反衬结构化通道 |
| **Node-RED Typed Input** | `{type, value}` 结构化对 + 运行时类型注册表 | **信封直系**——运行时原生解析结构化模式正是其生产验证的形态 |

结论：表达式默认（DMN 极）与字面量默认 + 显式标记（Step Functions/Logic Apps 极）
业界两大 pole 均有大规模生产验证；**信封 = 在 DMN 极之上叠加 Node-RED 式结构化
通道**，两极优点并存且互不侵犯。

## 6 · 版本判证：为什么是 minor

- 契约内输入（原始类型 kwargs：字符串/数字/布尔）行为**零变化**（I1）；
- 对象 kwargs 本就**出契约**（ADR-011 顶层原始类型）——给未定义行为下定义 = additive；
- 校验结果「报错 → 通过」（对象值此前报错）属行为修复非破坏；
- 保留字声明：对象值的 `mode`/`value` 二键自此保留（§3.1 窄识别）；
- 先例：0.14 `normalizeNamedCall`/`validateNamedArgs` 同为 parse 层 additive → minor。

**唯一会逼出 major 的情形**：改「裸字符串默认按表达式求值」本体——**本 ADR 明确不做**
（宿主确认 I1 为设计目的）。

## 7 · 实施清单与时间线

| 步 | 包 | 内容 |
| --- | --- | --- |
| 1 | zen-udf **1.1.0** | kwargs 值/`$positional` 元素信封窄识别 + literal 原样绑定 / reference `$.` 归一 + `validateNamedArgs` mode 感知 + conformance fixtures（三模式 × 声明类型 / 与引号共存 / 保留字碰撞 / 嵌套拒绝 / `$positional` 元素） |
| 2 | seal-editor minor | 存储收紧：字面量也写信封（全量形态化，typed-input-spec §2.1 原文落地）；读取侧 `coerceToTypedValue` 不变（双形态兼容） |
| 3 | seal-editor minor | `expandTypedValues`（demo-server 执行边界展开）标注最低引擎版 ^1.1.0 后**退役**（或保留为防御层，OQ6） |
| 4 | appshell / demo-server minor | 依赖 range 升格 + 回归 |

**兼容矩阵**：新引擎读旧图 ✓（无信封 = 现状）；旧引擎读收紧后新图 ✗（信封对象求值
失败）→ seal 按最低引擎版钉扎，过渡期 expandTypedValues 兜底（步骤 3 前）。

## 8 · 后果

- 正面：字面量歧义根治（无引号仪式）；编辑器模式信息全链保真（存储 → 引擎）；
  存储全量形态化解锁（Typed Input 规格原文完整落地）；conformance fixtures 进入
  引擎测试面（ADR-014 夹具契约的复用）；
- 约束：对象值的 `mode`/`value` 二键自此保留；引擎 parse 层新增一条 additive 分支；
  seal 双形态读取长期维持（存量裸值永久合法）；
- 中性：reference 首期 ≡ expression——输入 schema 校验位预留不实现（OQ1）。

## 9 · 开放问题（OQ）

1. **reference 首期深度**：≡ expression（加 `$.` 前缀即走），还是首日就对接输入
   schema 做字段存在性校验（依赖 ADR-013 InputContract 进引擎？目前不进）——推荐前者；
2. **literal 非字符串绑定**：`{mode:'literal', value: 42}` 数字/布尔原样绑定 ✓；
   value 为 object/array **禁止**（校验报错）还是原样传？——推荐禁止（与顶层原始类型一致）；
3. **mode 枚举保留位**：未来是否开放 env/date/json 等 Node-RED 式扩展模式——枚举
   校验放置于注册表而非硬编码，留扩展位不做承诺；
4. **expression 模式静态校验**：validateNamedArgs 是否对 expression 值跑
   zen-expression 合法性校验（编辑期已有，引擎执行期校验属新面）——推荐首期不跑
   （执行错误语义已覆盖），编辑器侧负责；
5. **`$positional` 元素信封**：首批支持还是仅 kwargs 值先行——推荐首批同支持
   （同属「值」位，实现同一函数）；
6. **expandTypedValues 退役时点**：引擎 1.1.0 普及前保留为防御层，还是 seal 发版
   即拆（钉最低引擎版）——推荐钉版即拆（单一语义源）。
