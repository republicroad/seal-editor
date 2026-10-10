# ADR-022：自定义节点调用表达式写路径切具名嵌套形——`{$call, kwargs}` canonical 施工计划

- 日期：2026-10-04
- 状态：**待实施**（宿主口令后执行；归 seal-editor 会话）
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
