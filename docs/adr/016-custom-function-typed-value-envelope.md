# ADR-016: 自定义函数参数值信封（TypedValue）——模式显式化与字面量歧义根治

- 日期：2026-10-04
- 状态：**accepted（jdm 已实现并发布 zen-udf 1.1.0；OQ 表态以实现 + CONTRACT §11.6
  立法形式落地，逐条对账见 §9.1；OQ7 挂 jdm 议程）**
- 目标版本：zen-udf 1.1.0（**已发布**，minor 判证见 §6）
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

## 8.5 · zen-udf 1.1.0 实证（2026-10-04，宿主发布后 seal 直测）

1.1.0 已随车实现信封识别（引擎源码 adr016-typed-envelope.test.ts + engine.ts
asTypedValueEnvelope）。seal 直测矩阵（roster 夹具，/v1/execute + 进程内双路）：

| kwargs 表达式形态 | 结果 |
| --- | --- |
| 裸标识符 roster | ✓（解析输入字段） |
| 裸点路径 q.tier | ✓ |
| 引号字面量 "demo_block" | ✓ |
| **裸 hBc路径 $.roster** | **✗（0.14 ✓ → 1.x ✗ 行为变更，见下）** |
| literal 信封 | ✓ 原样绑定（字面量歧义根治已生效） |
| reference 信封（无 $ 前缀路径） | ✓（嵌套 q.tier 亦 ✓） |
| expression 信封 + 裸标识符/点路径 | ✓ |
| expression 信封 + hBc路径 | ✗（同 hBc路径问题，非信封本身缺陷） |

**关键发现（jdm 待答，升格为 OQ7）**：1.x 命名调用 kwargs 求值域**不再绑定
$/输入根**——裸 $.roster 在 0.14 求值 ✓、1.x ✗；裸标识符/点路径两版皆 ✓。
涉 I1（表达式兼容）的边界：作者在 kwargs 用 hBc路径表达式将静默失败。
**编辑面对策已落地**：字段选择器插入裸点路径（无 $ 前缀）；reference 信封
value 恒无前缀（引擎注释同款语义）。

**OQ6 已答（实证收敛）**：expandTypedValues 收窄为**仅拆 expression 信封**
（literal/reference 引擎原生，透传）——1.1.0 下全模式展开反而有害（会把引擎
已正确绑定的字面量剥成裸值重踩歧义）。seal 已实施（demo-server）。

## 9 · 开放问题（OQ）

### 9.1 · jdm 表态对账（2026-10-04，评审以 zen-udf 1.1.0 实现 + CONTRACT §11.6 立法形式落地）

| OQ | seal 推荐 | jdm 表态 | 依据 |
| --- | --- | --- | --- |
| OQ1 reference 首期深度 | ≡ expression 加 `$.` 前缀 | ✅ 接受（首期 ≡ expression 加 `$.` 前缀） | 实现提交 + §11.6 |
| OQ2 literal 非字符串 | 禁止（校验报错） | 🔶 修改后接受：literal 的 object/array = **非信封透传**（按对象字面量过校验面报类型不符），非信封层报错 | §11.6「literal 的 object/array value = 非信封透传（OQ2）」 |
| OQ3 mode 枚举保留位 | 枚举校验放注册表，留扩展位 | 🔶 基本按推荐：窄识别（normative）锁三枚举 + `mode`/`value` 二键保留字立法；扩展位未明文（隐含于枚举校验处） | §11.6 窄识别条 |
| OQ4 expression 静态校验 | 引擎执行期不跑 | ✅ 接受（「expression 静态校验不做，执行错误语义覆盖」） | §11.6 明示 OQ4 |
| OQ5 `$positional` 元素 | 首批同支持 | ✅ 接受（同批实现） | 实现提交 + §11.6 |
| OQ6 expandTypedValues 退役 | 钉 1.1.0 即拆 | ✅ 已由 seal 实证回写（§8.5）：literal/reference 引擎原生透传、仅拆 expression——`a44f260` 实施 | 2026-10-04 直测矩阵 |
| **OQ7 $-路径 kwargs 求值域**（实证升格新增） | — | **⚠️ 未表态——挂 jdm 议程**：1.x 命名调用 kwargs 求值域不绑定 `$/输入根`（裸 `$.roster` 0.14 ✓ → 1.x ✗），涉 I1 的 $-路径子集；编辑面已落地对策（字段选择器/reference 信封恒无 `$.` 前缀） | §8.5 实证矩阵 |

jdm 评审最大发现与本 ADR 立论同源：「评审最重要发现的落地 = literal 信封跳过
`$.dep` 替换（防字面量静默变语义）」——字面量歧义根治双向确认。

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

## 评审注记（jdm-editor 仓——zen-udf 源仓，2026-10-04）

### 事实核查（四条属实）

1. **I1 基线准确**：engine.ts 具名分支字符串值 = zen 表达式求值
   （evaluateExpressionSafe + inputField 前缀）、非字符串 = 字面量
   （:1163-1167）——「宿主设计目的」表述与代码一致；
2. **契约空白属实**：seal Typed Input 三模式存储（typed-input-spec `{mode, value}`）
   引擎侧无语义，`expandTypedValues` 执行边界展开层实证存在
   （demo-server typed-values.ts:41，纯函数深走+窄识别）——每个执行宿主
   自带展开义务的现状成立；
3. **validateNamedArgs 可扩展**：按名校验面（0.14）加 mode 感知分支自然；
4. **`$positional` 已存在**（0.15）：信封元素同批支持 = 同一值位同一函数，成立。

### 逐节裁定

| 节 | 裁定 |
| --- | --- |
| §2 不变量 | **接受**——I1/I2/I3 即立法；「本 ADR 不改裸字符串默认」的划界正确 |
| §3.1 窄识别 | **接受**——「恰为 mode+value 二键 + mode 枚举 + value 字符串」的四重条件足够防误伤（对象 kwargs 本出契约，碰撞面仅手写图）；`mode`/`value` 二键自此保留的声明同意 |
| §3.2 模式语义 | **接受**——literal 原样绑定/reference 首期 ≡ expression（OQ1 同意）/嵌套禁止一致 |
| §4 形态对照 | **接受 (a)**——`{mode, value}` 值对象与 seal 存储直通零转换；键后缀 (b) 与 `$` 保留键家族混淆的反驳成立；保留键包装 (c) 分支更碎同意 |
| §5 业界参照 | 接受——「DMN 极 + Node-RED 结构化通道叠加」定性准确 |
| §6 minor 判证 | **同意**——契约内输入零变化 + 对象值出契约下定义 = additive；「唯一 major 情形=改 I1」划界清晰 |
| §7 实施清单 | **接受**，兼容矩阵是本 ADR 的硬时序：**seal 写收紧前，全部执行宿主引擎 ≥1.1.0**（旧引擎读信封图 = 对象当字面量传错，静默） |

### 对宿主两问的正面建议

**一 · 参数信封修改本身**：做，方向正确。三点精化（实施必读）：

1. **与 0.15 依赖替换的次序约束（本评审最重要发现）**：0.15 的
   `substituteInstanceRefs` 在执行前把实参字符串中的 `$.dep` 替换为裸键——
   它是**深度递归**的，会走进信封对象的 `value`。对 `expression` 模式信封
   这是对的（`{mode:'expression', value:'$.a.v'}` 里的引用就是兄弟引用）；
   但对 **`literal` 模式信封是语义破坏**——`{mode:'literal', value:'$.customer'}`
   会被错误改写成 `customer`，恰好复刻本 ADR 要根除的「静默变语义」。
   **契约：`substituteInstanceRefs` MUST 对信封形态对象整体跳过
   （literal/opaque），仅对 `expression` 信封的 value 内字符串替换**；
   实现顺序 = 先替换（旧语义值）→ 后信封识别，或替换器加信封感知——
   二选一，实施时定并写 fixtures（literal 信封含 `$.` 内容为防回归锚）；
2. **literal 绑定 MUST 绕过 inputField 前缀**：inputField 拼接
   （`${inputField}.${v}`）只作用于 expression/reference 求值路径；
   literal 在拼接前分流原样绑定——否则带 `.` 的字面量被拼成路径求值；
3. **`validateNamedArgs` mode 感知的位置**：信封识别是引擎 parse 层职能，
   校验面复用同一识别函数（单源）——避免引擎与校验对「什么是信封」双轨。

**二 · 裸字符串默认按表达式求值**：**保持不变，且永久不变**。三条理由：

1. 这是规则引擎的心智模型正位——规则作者的大多数实参就是字段引用/算式，
   表达式默认（DMN 极）对高频路径是对的；字面量是少数派，少数派走显式通道
   （引号或信封）成本最低；
2. 改默认 = 全部存量图逐处改写 + I1 破坏 = major 且无收益；
3. 1.0 契约已把「表达式默认」立法（CONTRACT §11 兼容形读取永久）——改默认
   即契约 2.0。真正的痛点（引号仪式/静默歧义）由信封 opt-in 精确解决后，
   默认没有再动的理由。若未来字面量占比反转（数据说话），再议不迟。

### OQ 表态（1-6）

1. **reference 首期 ≡ expression——同意**（schema 校验位等 InputContract 进引擎再说）；
2. **literal 非字符串：value 为 number/boolean 原样绑定；object/array 禁止（校验报错）——同意推荐**
   （与顶层原始类型一致；嵌套组合爆炸已由「嵌套禁止」封口）；
3. **mode 枚举扩展位放注册表——同意**（不硬编码、不做承诺）；
4. **expression 静态校验首期不跑——同意**（执行错误语义已覆盖；编辑器侧已有）；
5. **$positional 同批支持——同意**（同一值位同一函数）；
6. **钉版即拆——同意**（兼容矩阵为硬时序：全部执行宿主 ≥1.1.0 后 expandTypedValues
   退役，单一语义源；过渡期保留兜底）。

### 补充发现（两条）

1. **版本窗口赞同 + 一个前提**：1.1.0 minor 判证成立；前提 = seal 写收紧
   （步骤 2）严格钉在「执行宿主全部 ≥1.1.0」之后——兼容矩阵 ✗ 格是
   唯一的静默破坏路径，建议 seal 侧把「最低引擎版钉扎」做成运行时断言
   （引擎版本探测 + 拒绝信封图）而非仅文档钉；
2. **CONTRACT §11 增补义务**：信封形态入 CONTRACT §11（调用形态）第 11.6 节
   （或并入 11.2 兼容形表）+ §3.1 保留字清单增补 `mode`/`value` 二键——
   步骤 1 随 1.1.0 同版落地（契约先行纪律）。

**裁定汇总：全案接受（方向/形态/版本判定），两点精化（替换次序契约/
literal 绕过 inputField）为实施必读；#1（zen-udf 1.1.0）待宿主口令。**

关于「可惜了没进 1.0」：时序上放进 1.0 反而是错的——信封的价值以 seal
Typed Input 编辑面落地为前提（编辑器写入三模式才有信封图），而编辑面批次
晚于 1.0 冻结窗口；1.0 冻结已裁定面、信封走 1.1 minor 正是 semver 的用法。

## 实施回执（2026-10-04，jdm-editor）——#1 完成，zen-udf@1.1.0 已发布

- **已发布且 registry 实证**（feat 89f10469 + release 04bab6ad；validate success）：
  ①信封窄识别 `asTypedValueEnvelope`（单源：恰 mode+value 二键 + mode 枚举 +
  **value 原始类型**——literal 允许 string/number/boolean〔OQ2 前半〕，
  expression/reference 要求字符串；object/array value = 非信封按现状对象字面量
  透传，validateNamedArgs 报类型不符〔OQ2 后半以类型不符形态落地〕）；
  ②三模式求值：literal 原样绑定（**绕过 inputField 拼接与求值**——评审精化 2
  落地）；expression ≡ 裸字符串；reference 首期 ≡ 裸路径（OQ1，standalone
  绑定 `$.` 非属性访问故不加前缀——与替换后上下文等价）；③**替换器/提取器
  信封感知**（评审精化 1 落地）：literal 整体跳过（防 `$.` 字面量静默变语义，
  防回归锚测试在案）；expression 信封 value 内 `$.refs` 照常提取替换；
  **reference 信封取路径根段建依赖边**（tier.v → tier）；④`validateNamedArgs`
  mode 感知（literal 按声明类型直校/缺失按声明参数集判定——评审中发现并
  修正的遍历缺陷）/非信封对象字面量 vs 声明类型报不符；
  ⑤`$positional` 元素信封同批（OQ5）；⑥CONTRACT §11.6 立法（窄识别
  normative/嵌套禁止/保留字 mode+value 二键）；
- **验收**：11 例新测（literal 无引号仪式/引号共存/expression 显式版/
  reference 路径/$positional/嵌套透传/保留字碰撞/mode 感知校验/**literal 含
  `$.` 防回归锚**）全过；全量 **1113 绿** + tsc 干净；
- **seal 侧衔接就绪**（清单步骤 2-4）：写收紧（字面量也写信封）可随
  seal-editor minor 落地；`expandTypedValues` 退役前置=执行宿主全部 ≥1.1.0
  （本版发布即满足 zen-udf 侧；钉版断言建议照评审补充发现 1）。
