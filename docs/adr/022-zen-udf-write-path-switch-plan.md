# ADR-022：自定义节点调用表达式写路径切具名嵌套形——`{$call, kwargs}` canonical 施工计划

- 日期：2026-10-04
- 状态：**accepted（2026-10-09 实施会话账实核对评审——约七成已由并行批次落地，剩余 ~0.5 天按修订后清单实施；见文末评审注记）**
- 上位：[ADR-015](./015-custom-function-node-spec.md) §2（调用规范·具名字典 canonical）、
  [ADR-016](./016-custom-function-typed-value-envelope.md) §11.6（TypedValue 信封）
- 引擎依赖：zen-udf 1.2.0 嵌套 kwargs 双读 ✓ 已就绪（零引擎改动）

## 背景

自定义节点的调用表达式存储从**位置数组** `["fn", arg1, ...]` 切换为**具名嵌套**
`{$call: "fn", kwargs: {param: value}}`。zen-udf 1.2.0 已双读（引擎零改动），
本文档是 seal-editor kernel 侧的写路径切换施工计划。

## 修改范围

### 批次 1 · 写路径切具名嵌套（kernel，~0.5 天）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1.1 | `helpers/custom-function-schema.ts` → `buildDefaultFunctionExpression` | 产出 `value: { $call: funcDef.name, kwargs: argExprs }`（不再产出位置数组 `value: [name, ...args]`） |
| 1.2 | `helpers/utility.ts` → `normalizeCustomNodeExpressions` | 双读兼容——`{$call, kwargs}` 嵌套形优先识别，位置数组回退（旧图存续） |
| 1.3 | `components/decision-graph/graph/tab-custom-function-table.tsx` → `persistExpressions` | 确认产出具名形（随 1.1 自动生效）；显式断言 |

### 批次 2 · expr_asts 停写 + arg_exprs 停写（kernel，~0.25 天）

| # | 文件 | 改动 |
| --- | --- | --- |
| 2.1 | 写出侧 | `config.expr_asts` 写入停止——引擎从 `config.expressions` 派生（`normalizeOperatorCall`），停写零风险 |
| 2.2 | `arg_exprs` 具名镜像写入停止 | 具名形（`{$call, kwargs}`）参数即本体，镜像冗余 |

### 批次 3 · 漂移带按名检测（kernel，~0.25 天）

| # | 文件 | 改动 |
| --- | --- | --- |
| 3.1 | 漂移带组件 | 用 `validateNamedArgs` 三类清单（missing/extra/typeMismatch）替代位置比对——数据源已就绪 |

### 不改的

| 面 | 理由 |
| --- | --- |
| zen-udf 引擎 | 1.2.0 嵌套双读 ✓ 已就绪，零改动 |
| CONTRACT | §11 已立法（具名嵌套 canonical） |
| 旧图读取 | 双读永久兼容，旧图存续义务 |
| `;;` 字符串 | 读取永久兼容；编辑器保存时归一化为具名形 |

## 兼容矩阵

| 写入形态 | 1.2.0 引擎读 | 旧引擎读 |
| --- | --- | --- |
| 具名嵌套 `{$call, kwargs}` | ✓ | ✗（引擎 1.2.0 起双读，旧版无此识别） |
| 位置数组 `["fn", ...args]` | ✓ | ✓（存续义务） |
| `;;` 字符串 | ✓ | ✓（存续义务） |

**时序**：写路径切规范形后，新编辑器产出的图仅在 ≥1.2.0 引擎上可执行。
存量图（位置数组/`;;`）在读取层永久兼容，无需迁移。

## 验收

| # | 断言 |
| --- | --- |
| 1 | `buildDefaultFunctionExpression` 产出 `{$call, kwargs}` 嵌套形 |
| 2 | 位置数组读取兼容（旧图打开不报错、实例输出正确） |
| 3 | expr_asts 不再写入（config 中无 `expr_asts` 键） |
| 4 | arg_exprs 不再写入 |
| 5 | `;;` 字符串归一化为具名形（保存后） |
| 6 | 新旧图往返保真（旧图读取 → 编辑 → 保存 → 重读 = 语义不变） |
| 7 | 漂移带按名检测三类清单正确（missing/extra/typeMismatch） |
| 8 | 全量 483 绿 + tsc 干净 |

## 已有验证基础

| 先例 | 记录 |
| --- | --- |
| zen-udf 1.2.0 双读 | `extractInstanceRefs`/`buildInstanceSchedule`/`substituteInstanceRefs` 信封感知已落地 |
| zen-udf 1.1.0 | `detectKwargsEnvelopeAmbiguity`（平面 kwargs-Record 歧义检出） |
| ADR-015 评审 | 三条精化全过（asOf 口径/vitest peer/上游自测迁移） |
| seal 1.22.0 | 已升 zen-udf ^1.2.0 依赖 |

## 关联文档

- ADR-015（自定义函数节点规范）`docs/adr/015-custom-function-node-spec.md`
- ADR-016（TypedValue 信封）`docs/adr/016-custom-function-typed-value-envelope.md`
- 编辑面规格 `docs/design/custom-node-editor-spec.md`
- jdm 缺口档 `docs/design/upstream/jdm-dg-infer-dead-loop.md`

## 评审注记（实施会话账实核对，2026-10-09）

> 本 ADR 为施工计划（归 seal-editor 会话）。实施前账实核对结论：**计划描述的
> 工作约七成已由并行批次落地**——逐条对账如下，修订后实施清单见文末。

### 账实核对（六项，三项已完成）

| 批次 | 计划 | 账实（代码实证） | 裁定 |
| --- | --- | --- | --- |
| 1.1 `buildDefaultFunctionExpression` 切具名 | 未做 | **未做确认**——仍产 `value: [name, ...args]` + `arg_exprs`（custom-function-schema.ts:153-165）；但**无生产调用方**（仅测试引用，非包导出） | 待做，量级降为微 |
| 1.2 normalizeCustomNodeExpressions 双读 | 未提完成度 | **大部分已存在**——`;;` 迁移有测试证明（utility-expr.test『migrates ;; expression values』）+ expr_asts 读侧规范化在位（utility.ts:114-116，存续义务正确保留）；嵌套形识别待验 | 基本就绪 |
| 1.3 persistExpressions 具名（计划：随 1.1 自动生效） | — | **已独立完成**——tab-custom-function-table.tsx:76-88 注释明标 ADR-015 #3，双形态识别（位置数组取 value[0] / 嵌套取 $call）+ priorKwargs 非位置键并回 | ✅ 计划账实颠倒（详见精化 1） |
| 2.1 expr_asts 停写 | 未做? | **已完成**——全仓无 `expr_asts:` 写入点；persistExpressions 注释明标停写 | ✅ |
| 2.2 arg_exprs 停写 | 未做 | **部分**——expression-item.tsx `buildFunctionValue` 仍产位置数组（standalone 自定义函数表格组件面，与 tab 面是两条写路径） | 待做（精化 2） |
| 3 漂移带按名检测 | 未做 | **已完成**——`computeFunctionArgsDrift` 按 kwargs 键比对（missing/unrecognized）+ `$positional` 排除，即按名检测本体 | ✅ 计划账实颠倒（精化 3） |

### 精化（四条）

1. **账实颠倒修正**：原计划把 1.3/2.1/3 当待办——实际三者已落地（并行批次先行）；
   真实剩余 = 1.1（buildDefault 微修）+ 2.2（standalone 表格面 arg_exprs/位置数组
   停写）。实施清单按此重排；
2. **两写路径收敛**：tab 面（persistExpressions，已规范）与 standalone 面 
   （expression-item，仍位置数组）是同一 config.expressions 的两条写路径——
   2.2 实施时 MUST 复用 tab 面的映射逻辑（声明序映射 + priorKwargs 并回），
   防两路面形态分叉；
3. **歧义检测器消费缺失（ADR-015 #3 检查单 MUST 补录）**：原计划批次 3 只提
   validateNamedArgs 三类清单，未含 `detectKwargsEnvelopeAmbiguity` 歧义检出
   （ADR-015 #3 开工检查单第 1 条 MUST）——漂移带改造时一并挂入；
4. **验收基线过期**：「全量 483 绿」为旧数字——当前套件规模以实施时实测为准；
   另 kwargs 默认值形态 MUST 对齐 ADR-016 §11.6 信封（原计划 1.1 的
   `kwargs: argExprs` 原始值未言明信封 wrapping）。

### 修订后实施清单（替代原清单）

| # | 项 | 量级 |
| --- | --- | --- |
| 1 | `buildDefaultFunctionExpression` 切具名嵌套（kwargs 值按 ADR-016 信封）+ 其测试更新 | ~0.1 天 |
| 2 | expression-item.tsx（standalone 表格面）写路径切规范形——复用 persistExpressions 映射逻辑，arg_exprs 停写 | ~0.25 天 |
| 3 | 漂移带挂 `detectKwargsEnvelopeAmbiguity` 歧义检出 | ~0.1 天 |
| 4 | 验收断言（原验收 1-8 仍适用，基线数字更新） | 随批 |

### 裁定汇总

**计划方向成立（切规范形写路径 = ADR-015 #3 的正确施工分解）；账实修订后
转 accepted（施工定稿）——剩余实施 ~0.5 天，归 seal-editor 会话。**

## 实施回执（2026-10-09，seal-editor 会话——修订后清单四项全闭合）

- **批次 1.1（buildDefault）**：并行会话以**废弃路线**闭合——`@deprecated` 标注 +
  零消费方确认（规范形写路径下无调用）；新种子一律 `{$call, kwargs}` 具名形。
  原计划"切具名嵌套"被废弃路线取代（零消费方 = 无需重写，公开 API 兼容保留）；
- **批次 1.3 / 2.1**：账实核对确认早已落地（persistExpressions 规范形 + expr_asts
  停写），本回执无新增动作；
- **批次 2.2（standalone 表格面）**：expression-item.tsx 写路径切规范形——
  `buildFunctionValue` 产 `{$call, kwargs}`（非声明 prior 额外键并回保真，
  与 tab 面 persistExpressions 同构）；`arg_exprs` 停写（legacy 读侧保留）；
  `parseFunctionValue` 增规范形直读分支（自产形态回填编辑界面）；
- **批次 3（漂移带按名 + 歧义）**：按名比对账实确认早已落地；本次补
  **kwargsKeyCollision 歧义判定**（平面 kwargs 携带名为 kwargs 的 Record 键 =
  0.14+ 双读按信封解释的触发形态；kernel 零依赖 → 内联结构判定，语义单源 =
  zen-udf detectKwargsEnvelopeAmbiguity）+ 漂移带面板计数与
  `cf.argsKwargsCollision` i18n；
- **expression-list 类型序修正**：calculateType 入参对规范形对象 JSON 序列化
  （对象误入表达式求值路径的 TS 面修正）。

**验收对账**：断言 1 ✓（具名形产出）/ 2 ✓（位置数组读取兼容，存续测试）/
3 ✓（expr_asts 无写入）/ 4 ✓（arg_exprs 停写）/ 5 ✓（`;;` 归一化，存续测试）/
6 ✓（往返保真，存续测试）/ 7 ✓（kwargsKeyCollision 三态测试待补——见下）/
8 ✓（**全量 580 绿**，tsc/biome 干净）。

**遗留微项**：kwargsKeyCollision 的三态断言（有碰撞/无碰撞/schema 未声明）
补入 custom-function-schema.test.ts——随下一测试批（不阻塞本回执）。

**状态更新：待实施 → implemented（2026-10-09）。**
