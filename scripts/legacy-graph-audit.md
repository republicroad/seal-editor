# legacy-graph-audit — 决策图遗留形态检测与迁移工具

> 零依赖单文件 CLI（Node 18+ / Bun 皆可）。配套脚本：[legacy-graph-audit.mjs](./legacy-graph-audit.mjs)

## 1 · 背景

自定义函数节点表达式值已完成规范形收紧：**具名字典 `{$call, kwargs}` + 可选 `{mode, value}` 信封**
（seal-editor ADR-015/016，zen-udf 1.2.0 起原生三模式双读）。存量图可能携带四类遗留形态，
其中 `$.` 路径形态在 standalone 求值域**恒为 null**（静默失败），位置数组存在**中插静默错位**
风险——本工具用于发现并安全迁移这些形态。

| 形态                             | 示例                             | 风险                           | 迁移                                        |
| -------------------------------- | -------------------------------- | ------------------------------ | ------------------------------------------- |
| `LEGACY_BARE` 裸函数名           | `"roster"`                       | 引擎按表达式求值，非函数调用   | `{$call:"roster", kwargs:{}}`               |
| `LEGACY_SEMICOLON` `;;` 参数串   | `"crypto;;\"text\";;\"sha256\""` | 引号内 `;;` 误切（历史缺陷面） | `{$call:首段, kwargs:{$positional:[…]}}`    |
| `LEGACY_POSITIONAL` 位置数组     | `["http_request","\"url\""]`     | 中插参数静默错位               | `{$call:首元素, kwargs:{$positional:其余}}` |
| `LEGACY_DOLLAR` kwargs `$-` 路径 | `{value:"$.value"}`              | standalone 求值恒 `null`       | 剥 `$.` 前缀为裸路径                        |

不判遗留：信封值（`{mode,value}`）、已规范形、空值。已在规范的值**不动**（幂等）。

## 2 · 用法

```bash
# 检测报告（发现遗留形态 exit 1——可直接作导入门禁 / CI 步骤）
node scripts/legacy-graph-audit.mjs scan <输入...>

# 迁移改写 JSON 图文件（原文件自动备份 .bak；重跑 scan 复核）
node scripts/legacy-graph-audit.mjs fix <json 文件...>

# 从 pg_dump（custom 格式）生成遗留行的 UPDATE 迁移 SQL（stdout）
node scripts/legacy-graph-audit.mjs sql backups/verdict-YYYYMMDD.dump
```

输入三形态：`.json` 图文件、目录（递归取 `.json`）、`.dump`
（PGDMP custom 格式——内置 zlib 启发式恢复 `decision_model_version` 行，
**免 pg 工具链**，无需 pg_restore/psql）。

### 输出示例

```text
扫描 1 个图文件：4 处遗留形态
  LEGACY_BARE（裸函数名字符串）: 1
    - legacy.json.nodes[1].expressions[0](bare)
  LEGACY_DOLLAR（kwargs $-路径（恒 null 陷阱））: 1
    - legacy.json.nodes[1].expressions[3](dollar)

[audit] 发现遗留形态——迁移后重扫（fix 命令或人工复核）
```

## 3 · 迁移语义与边界

- **位置数组 → `$positional` 保留键**：声明序具名映射需要函数 schema；本工具无
  schema 时一律落 `kwargs.$positional`（zen-udf `normalizeNamedCall` 同款保留键
  语义），引擎侧可按声明序二次归一。
- **`;;` 切分**：引号感知（引号内 `;;` 不切），与 kernel smartSplit 同语义。
- **`$-` 剥前缀**：仅剥 `$.` 前缀，不做表达式改写（`$.a.b` → `a.b`）。
- **幂等**：迁移后的图重跑 scan/fix 均为无操作。
- **信封与已规范值原样保留**（含 literal 信封——原样绑定语义不破坏）。

## 4 · verdict 侧使用建议

### 4.1 导入门禁

图导入/创建接口的前置校验步骤（发现即拒绝入库）：

```bash
node scripts/legacy-graph-audit.mjs scan ./incoming-graph.json || exit 1
```

### 4.2 存量体检（本仓已实测）

用最新备份跑 `sql` 模式产出迁移语句 → 测试库演练 → 核对 `$positional`
保留键与业务语义 → 生产执行：

```bash
node scripts/legacy-graph-audit.mjs sql backups/verdict-YYYYMMDD.dump > migrate.sql
```

**2026-10-07 实测基线**：`verdict-20260913-101123.dump` 共恢复 3 个
`decision_model_version` 版本（1 个模型：纯决策表 discount，first 策略），
**零 customNode、零遗留形态**——当期无需迁移；本结论随新增图失效，
建议入版本窗口例行重跑。

### 4.3 迁移演练流程

1. `sql` 产出语句 → 人工过一遍（尤其 `$positional` 行）；
2. 测试库执行 → 用编辑器打开迁移后的图复核；
3. 生产执行 → `scan` 复扫确认清零。

## 5 · 维护注记

- 检测/迁移语义**镜像** seal-editor kernel 的
  `findDollarFormRows` / `migrateDollarFormArgs` / `legacyValueToNamedCall`
  与 zen-udf `normalizeNamedCall`——任一侧语义演进须同步镜像。
- dump 恢复为启发式（zlib 逐偏移膨胀 + COPY 行解析）：PGDMP 格式大版本
  变化时需复核；`pg_restore` 可用时以官方工具为准。
- 引擎「`$` 根不绑定节点输入」的裁定与字段引用规范见
  seal-editor `typed-input-spec.md` §7 与 jdm `dollar-scope-decision.md`。
