# Zen 表达式与节点参考

状态：**客户参考核心档 · 持续跟进**（2026-10-10 立档）
口径：运行面 `@gorules/zen-engine-wasm` 0.23.1 · 实测线 `@gorules/zen-engine`（原生）2.1.x · 文档格式 jdm（`application/vnd.gorules.decision`）
关联：[zen-udf](./zen-udf)（自定义函数运行时） · [`$` 绑定实测矩阵（证据档）](./design/zen-dollar-binding-matrix) · [表达式节点夹具](./graph/expression-node-dollar-ref.json) · [ADR-015](./adr/015-custom-function-node-spec) / [ADR-016](./adr/016-custom-function-typed-value-envelope) / [ADR-017](./adr/017-dedicated-editor-plugin-system)

> 本文管辖 **zen 表达式语言** 与 **zen-engine 节点语义**，是客户集成决策引擎时的首要参考。
> 维护纪律：① 每条语义尽量钉实证锚点（夹具图 / 回归语料 / 测试文件）；② zen-engine 升级必须走 §7 核查清单并在 §6 追加跟进记录；③ 本档持客户面结论，实测过程与锐边分析留在证据档。

---

## 1. 表达式语言（Zen Expression Language）

### 1.1 词法与类型

| 类别 | 形式 | 示例 |
| --- | --- | --- |
| 数字 | 十进制、科学计数法 | `42` · `1.5e3` · `2E-2` |
| 字符串 | 单引号 | `'hello'` |
| 模板串 | 反引号 + `${expr}` 插值 | `` `sum: ${sum([1,2,3])}` `` |
| 布尔 / 空 | | `true` · `false` · `null` |
| 数组 | 方括号 | `[1, 2, 3]` |
| 对象 | 花括号 | `{a: 1, b: 'x'}` |
| 标识符 | 裸名、点路径、动态键 | `a` · `user.name` · `obj[key]` |

类型集合：`null` / `boolean` / `number` / `string` / `date` / `object` / `array`。
类型探测 `type(x)`、判型 `isNumeric(x)`、转换 `number()` / `string()` / `bool()` / `date()`。

赋值表达式：`key = expr` 在独立求值中产出对象（`"a = 5"` → `{"a": 5}`），支持嵌套路径与多重赋值。

### 1.2 运算符总表

| 运算符族 | 形式 | 示例（语料实证） |
| --- | --- | --- |
| 算术 | `+ - * / %` | `a + b` |
| 比较 | `== != > < >= <=` | `score > 70` |
| 区间 | `[lo..hi]` 开闭可变 | `[20..40]`（决策表范围测试） |
| 逻辑 | `and or not` | `true and false` |
| 三目 | `cond ? a : b`（可链式） | `score > 90 ? 'A' : score > 80 ? 'B' : 'C'` |
| 空合 | `??`（取首个非 null） | `null ?? 123 ?? 321` → `123` |
| 模板插值 | `` `...${expr}...` `` | `` `reference: ${a}` `` |
| 赋值 | `path = expr` | `name = 'John'` |
| 成员访问 | `.`、`[i]`、切片 | `list[0]` · 字符串切片 |
| 闭包 | `#` 位置参数；`as` 别名 | `map([1,2,3], # * 2)` → `[2,4,6]`；`map(products as p, p.price)` |

科学计数法为**一等数字字面量**：解析、算术、比较、转换、数组运算、模板插值全链支持（语料 11 个分节钉死）。

### 1.3 内置函数库（标准）

语料源：jdm 仓 `packages/zen-udf/src/expression-regression/standard.csv`（657 行 · 67 分节，全部为引擎可执行断言）。
全量逐行速查见生成档 [zen-function-reference](./zen-function-reference)（861 行断言机械投影，勿手改）。

| 族 | 函数 |
| --- | --- |
| 数组变换 | `map` `filter` `flatMap` `some` `all` `none` `count` `len` `merge` `mergeDeep` |
| 统计 | `sum` `avg` `min` `max` `median` `mode` `rand` |
| 字符串 | `upper` `lower` `trim` `startsWith` `endsWith` `contains` `split` `matches` `fuzzyMatch` `extract` |
| 数学 | `round` `trunc` `floor` `ceil` `abs` |
| 类型与对象 | `type` `isNumeric` `number` `string` `bool` `keys` `values` `duration` |

### 1.4 日期时间函数

语料源：同目录 `date.csv`（303 行 · 17 分节）。日期是**一等类型 + fluent 方法链**。全量速查同上生成档。

| 族 | API |
| --- | --- |
| 构造 | `d('2023-10-15')`（ISO 8601 全形态：日期/时刻/偏移） · `duration(n, unit)` |
| 读取 | `.year()` `.month()` `.day()` `.hour()` `.minute()` `.second()` `.weekday()` `.dayOfYear()` `.quarter()` `.timestamp()` `.string()` |
| 变换 | `.add(n, unit)` `.sub(n, unit)` `.set(unit, v)` `.startOf(unit)` `.endOf(unit)` `.tz(zone)` |
| 判定 | `.isValid()` `.isSame()` `.isBefore()` `.isAfter()` `.isSameOrBefore()` `.isSameOrAfter()` `.isToday()` `.isYesterday()` `.isTomorrow()` `.isLeapYear()` |
| 差值与格式 | `.diff(d2, 'day'|'hour'|'month'|…)` `.format(fmt)` `.offsetName()` |

实例：`d('2023-10-15').diff(d('2023-10-10'), 'day')` → `5`。
DST 语义：落在间隙内的本地时间**前移一个间隙**；带偏移的 ISO 时刻保持瞬时值不变。

### 1.5 `$` 作用域与根绑定总表

完整实测记录见[证据档](./design/zen-dollar-binding-matrix)；下表为客户面结论（2026-10-10，六轮原生引擎实证）。

| 求值上下文 | 裸 `$` | `$root` | `$nodes.<名>.<字段>` | 裸标识符 | 引用失败行为 |
| --- | --- | --- | --- | --- | --- |
| 表达式节点行值 | 行输出累积域：`$.<rowKey>` 引先行行 | 节点输入根 | 先行节点输出 | 输入字段 | **该行静默丢弃** |
| 决策表输入单元 · unary（field 列） | 列值（unary 左操作数） | — | — | —（操作数隐式） | 无命中 |
| 决策表单元 · 全表达式 | 未绑定 | 节点输入根 | 先行节点输出 | 输入字段 | 无命中/缺键 |
| 独立求值 `evaluateExpression` | 未绑定 | 上下文根 | — | 上下文顶层键 | 返回 null |

三条铁律：

1. **节点内交叉引用用 `$.<rowKey>`（表达式节点）或 `$nodes.<名>.<字段>`（跨节点）；输入数据一律裸名或 `$root`。**
2. 表达式节点里**行键不遮蔽裸名**：输入 `{v:1}`、先行行 `v=99`、后行 `x=v` → `x=1`（裸名永远解析输入；输出中 `v` 被行覆盖为 99）。
3. `$.<非行键>` 引用**静默丢行不报错**——集成方必须在输出侧断言期望键存在。

### 1.6 独立求值 vs 图内求值

- `evaluateExpression` / `evaluateExpressionSync`（引擎直出）：普通变量环境，上下文顶层键直引；裸 `$` 未绑定（返回 null），`$root` 绑定为上下文根。
- 完整决策图执行：各节点拿到自己的求值环境（§1.5 表逐列生效）；`$root` = 该节点输入根。
- 宿主包装层（jdm 传承）曾以 `{result: data}` 包装上下文 + `$.result.x` 取值——与引擎契约不符；**已修复（zen-udf 1.4.0，2026-10-11）**：context 平铺裸键（对象结果即 context 顶层键直引），非对象结果绑 `result` 单键（`result == 42` / `len(result) == 2` 形态），`$` 根与 `$.path` 导航恒 null 静默由哨兵测试钉扎。迁移纪律与实施回执见 [ADR-014](./adr/014-zen-udf-fixture-contract) 增补节。

---

## 2. 节点类型参考

每节点五要素：用途 / content schema / `$` 绑定 / 求值语义 / 错误行为。
示例图均可直接粘进 `contentType: "application/vnd.gorules.decision"` 文档执行。

### 2.1 inputNode — 输入声明

- **schema**：`{ "schema": "<JSON Schema 字符串>" }`（空串 = 无校验）
- **语义**：决策图入口，不做变换；schema 供编辑器推导字段与校验。

### 2.2 outputNode — 输出声明

- **schema**：无 content（仅 `id/type/position/name`）
- **语义**：标记图输出位置；图执行结果 = 到达 outputNode 的数据。

### 2.3 expressionNode — 表达式节点

- **schema**：

```json
{
  "expressions": [ { "id": "必填", "key": "输出键", "value": "表达式" } ],
  "passThrough": true,
  "inputField": null,
  "outputPath": null,
  "executionMode": "single"
}
```

- **求值语义**：行内**顺序求值**（上游先行行的输出对后行的 `$` 可见）；`passThrough` 决定输入字段是否并入输出；行输出覆盖输入同名键。
- **`$` 绑定**：见 §1.5 第一行——`$`=行输出域、`$root`=输入根、裸名=输入字段、`$nodes` 跨节点。
- **实例**（`$.c` 引先行行=3，`$.a` 静默丢行）：[夹具](./graph/expression-node-dollar-ref.json)。
  输入 `{a:1, b:2}` → 输出 `{a:1, b:2, c:3, d:4, g:3}`（行 `e=$.a` 被丢弃）。

### 2.4 decisionTableNode — 决策表节点

- **schema**（jdm 平铺格式；GoRules documents 的 `columns` 变体**不受支持**）：

```json
{
  "hitPolicy": "first",
  "inputs":  [ { "id": "i1", "field": "cart.weight", "name": "Weight" } ],
  "outputs": [ { "id": "o1", "field": "fee", "name": "Fee", "default": "0" } ],
  "rules": [
    { "_id": "r1", "_description": "可选", "i1": "> 40", "o1": "40" }
  ],
  "passThrough": false,
  "inputField": null,
  "outputPath": null,
  "executionMode": "single"
}
```

- **双形态**：
  - **field 列 + unary 单元**（标准形态）：`field` 是输入字段路径（支持嵌套 `u.a`），单元是 unary 表达式（`> 40`、`"US"`、`[20..40]`）；unary 里 `$` = 列值。
  - **无 field 列 + 全表达式单元**：单元写完整表达式，裸名/`$root`/`$nodes` 按 §1.5 生效（**`$` 不指输入根**，写 `$.a` 不命中）。
- **hitPolicy**：`first`（首中即返，输出单对象）/ `collect`（收集全部命中规则，**输出数组**）；switch 节点同一取值集。其他取值（如 `standard`）引擎解析报错 `unknown variant`。
- **错误行为**：条件不命中→走 `default`；输出单元求值失败→该字段缺键（静默）。

### 2.5 functionNode — 函数节点（JS）

- **schema**：`{ "source": "import zen from 'zen';\nexport const handler = async (input) => { ... }" }`
- **语义**：JavaScript 代码节点，`input` 即节点输入；**`$` 绑定体系不适用**。适合命令式聚合与外部调用编排（同步宿主函数经 zen-udf 宿主函数机制接入，见 [zen-udf](./zen-udf)）。

### 2.6 switchNode — 分支节点

- **schema**：

```json
{
  "hitPolicy": "first",
  "statements": [
    { "id": "s1", "condition": "$.score > 70", "name": "pass" },
    { "id": "s0", "isDefault": true, "name": "fallback" }
  ]
}
```

- **语义**：按 `condition`（全表达式，`$` 语义同决策表全表达式单元）选分支；`isDefault` 兜底；`name` 镜像到出边作为分支标签。

### 2.7 customNode — 自定义节点（插件位）

- **语义**：节点种类扩展点，宿主经两层注册表接入（存在性层 appshell / 接管层 kernel，[ADR-017](./adr/017-dedicated-editor-plugin-system)）。
- **zen-udf 自定义函数节点**：调用表达式 canonical 形 `{$call: "fn", kwargs: {...}}`（旧位置数组/`;;` 串永久双读兼容，[ADR-015](./adr/015-custom-function-node-spec) / TypedValue 信封 [ADR-016](./adr/016-custom-function-typed-value-envelope)）；实例依赖调度按 DAG 顺序求值（`$.key` 自动建图）；kwargs **不接通 `$`**（jdm 仓 `packages/zen-udf/docs/dollar-scope-decision.md` 裁定）。
- **示例图**：仓内 `apps/demo-server/graphs/custom-node-example.json`（roster `$call` 规范形 / ping / expression 组合）。

---

## 3. 文档格式

- `contentType: "application/vnd.gorules.decision"`；顶层 `{nodes, edges}`，边 `{id, sourceId, targetId, type: "edge"}`。
- 表达式行节点**每行必带 `id`**（缺 id 解析失败）。
- 旧图存续义务：位置数组调用形、`;;` 串、旧 schema 永久双读；新写路径一律 canonical 形（[ADR-022](./adr/022-zen-udf-write-path-switch-plan)）。

## 4. 错误与静默行为目录

| 行为 | 触发 | 集成方对策 |
| --- | --- | --- |
| **静默丢行** | 表达式行引用 `$.<非行键>` | 输出侧断言期望键存在；编辑器检查器应提示"改为裸名" |
| 无命中缺键 | 决策表无命中且无 `default`；输出单元求值失败 | 显式 `default`；关键字段做存在性校验 |
| null 返回 | 独立求值裸 `$` 引用 | 用裸名或 `$root` |
| `DANGLING_REF` / `INVALID_DEPENDENCY` / `CYCLE_DETECTED` | 自定义节点实例依赖：引用缺失 / 依赖键不存在 / 依赖成环 | 依 ADR-015 增补的依赖调度错误码处置 |

静默行为的上游 fail-visible 提案（fail-visible 非 fail-fast）：[rfc/gorules-zen-silent-row-drop](./rfc/gorules-zen-silent-row-drop)。

## 5. 实测夹具索引

| 夹具 | 钉住的语义 |
| --- | --- |
| [`docs/graph/expression-node-dollar-ref.json`](./graph/expression-node-dollar-ref.json) | `$`=行输出域 / 裸名=输入 / `$.<输入字段>` 静默丢行 |
| [`docs/graph/expression-dollar-root-nodes.json`](./graph/expression-dollar-root-nodes.json) | `$root`=节点输入根 / `$nodes.<名>.<字段>` 跨节点引用 |
| [`docs/graph/decision-table-dollar-policy.json`](./graph/decision-table-dollar-policy.json) | hitPolicy first/collect；全表达式单元 `$` 未绑定哨兵 + `$root`=输入根；`$nodes` 引先行表输出 |
| 仓内 `apps/demo-server/graphs/custom-node-example.json` | customNode `$call` 规范形 / 实例依赖 |
| jdm 仓 `packages/zen-udf/src/expression-regression/{standard,date,unary}.csv` | 表达式语言全量回归（1068 行断言） |
| jdm 仓 `packages/zen-udf/graph/custom_fullnode.json` | `$root` / `$nodes` 跨节点引用实例 |

夹具与语料的机械验证：`node scripts/probes/zen-reference-verify.mjs [--full]`（§7）。

## 6. 版本跟进记录

| 日期 | 引擎版本 | 变更 | 实证锚点 |
| --- | --- | --- | --- |
| 2026-10-10 | wasm 0.23.1 / 原生 2.1.0（2.1.4 线同行为） | 立档：`$` 绑定全上下文矩阵（六轮实测）；表达式语言骨架 + 函数清单（语料提炼）；7 节点 schema 实测核对 | 证据档 matrix · 夹具 expression-node-dollar-ref · CSV 1068 行 |
| 2026-10-11 | zen-udf 1.4.0 | OQ3 定稿实施：宿主求值器 context 平铺裸键（§1.6 闭合），jdm 提交 23372bdb / 发版 deb4e1b1，全量 1124 绿 | [ADR-014 实施回执](./adr/014-zen-udf-fixture-contract) |
| 2026-10-12 | 原生 2.1.4（经 zen-udf 1.4.0 依赖对齐） | §7 清单首次实战：3 夹具哨兵 + 855 行语料全量重放全绿——$ 绑定矩阵/hitPolicy/静默丢行在 2.1.4 与 2.1.0 行为一致 | 探针 zen-reference-verify --full · demo-server 依赖 ^1.4.0 |
| 2026-10-11 | wasm 0.23.1 / 原生 2.1.0 | 核查探针落成（§7 固化）：3 夹具断言 + 语料确定性抽样/全量重放（855 行）+ jdm 分歧台账门控移植；新增 `$root`/`$nodes` 与决策表 hitPolicy 哨兵夹具 | `scripts/probes/zen-reference-verify.mjs` · graph 夹具 ×3 |

## 7. 引擎升级核查清单

1. 跑核查探针：`node scripts/probes/zen-reference-verify.mjs`（夹具断言 + 语料抽样；`--full` 全量重放）；
2. 对照本档 diff：§1.2 运算符、§1.5 `$` 矩阵、§2 节点 schema、§4 错误目录逐节核对；
3. 在 §6 追加跟进记录（日期 / 新版本 / 变更 / 锚点）；行为变化时同步证据档 matrix 与 jdm 侧分歧台账。
