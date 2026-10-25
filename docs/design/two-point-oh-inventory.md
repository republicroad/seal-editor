# 2.0 盘点档——破坏性面清单一页档

- 日期：2026-10-25 起草
- 状态：**活档**（2.0 窗口前置立法档；各项独立裁断，不捆绑发版）
- 判据：2.0 = 唯一的破坏性版本窗口——1.x 期间挂账的所有「留到 2.0」在此清点，
  逐项给出现状/动作/依赖，避免窗口开启时靠记忆拼图

## 1 · LEGACY 退役（ADR-023 D2 后半）

| 项 | 现状 | 2.0 动作 | 依赖 |
| --- | --- | --- | --- |
| tokens `:root` 接管规则 | ISLAND/LEGACY 双轨并存（LEGACY = `:root:not(:has(.seal-root))` 全局注入兜底） | 两段删除，token 只剩 `.seal-root` 作用域 | **verdict 确认消费 ≥1.38.0**（层化版；层插件/哨兵同步退役） |
| guard-dist-css `:root` 禁令 | 禁令注释挂起（--check 只断言层化） | `--strict` 启用：断言无 `:root` 接管 | 上行完成后 |
| verdict 兜底层插件/哨兵 | 值守中（补位未层化 dist 时代产物） | 随 LEGACY 删除退役（verdict 仓动作） | 跨仓协调 |

## 2 · functionLibraries 空注入语义（ADR-024 注记挂账）

- 现状：`dg-empty` 把空数组注入也回落内置表——宿主无法表达「空参考面」；
  `TabFunction` 的 `?.length ? : undefined` 实为防御性死代码。
- 2.0 动作：改「**无注入 = 不显示参考面**」——`dg-empty` 不回落 + `TabFunction`
  直传 + `Function` 组件缺省值去除。**两处一起动**（ADR-024 实施回执注记在案）。
- 风险：standalone 应用不传 prop 时 Libraries 页签从有到无——D6 一并裁断。

## 3 · D6 · `Dg` 缺省目录去留

- 现状：缺省保留（1.x 兼容；独立应用开箱体验）。
- 2.0 裁断建议：**保留**（§2 改为「无注入=不显示」后，Dg 缺省与空语义互斥——
  若保留 Dg 缺省则空注入语义不成立；二选一。倾向：保留 Dg，§2 撤销）。
  ⚠️ §2 与本条互斥，2.0 窗口开启时显式裁断一次。

## 4 · rename 收尾清点

- user-data keys（`jdm-editor:` 前缀 localStorage 键）与 attribution **保持不改名**
  （seal-editor-rename 裁定：历史用户数据兼容优先）——2.0 是否反转属独立裁断，
  默认维持。
- 包名 `@republicroad/seal-editor|seal-appshell` 已稳定；无遗留旧包名别名。

## 5 · 其它挂账

| 项 | 来源 | 处置 |
| --- | --- | --- |
| `data-seal-standalone` 显式形态 | ADR-023 ISLAND 兼容实证 | 已裁定**可省略**（`.seal-root` 通吃）——不进 2.0 |
| excel 对话框 Steps 图级向导 | WS2-B3 | 非破坏性，1.x 演进 |
| ~~`DecisionGraphProps` 死 prop 清点~~ | 本会话 ⌘K/浮层排查 | ✅ **primitives 层 sweep 已完成（1.40.0 后批）**：popover placement 接线修复（bottomLeft 等此前被静默丢弃）+ disabled 守卫 + 非 click trigger 开发告警 + 6 文件 antd-ism 归档（title/arrow/destroyTooltipOnHide/defaultOpen/needConfirm 删除/checkedChildren 族/variant/format/tabs type）——ui 层直传组件无此面；`DecisionGraphProps` 本体 sweep 并入 2.0 窗口 |

## 触发与协调

- 窗口开启前置：verdict 侧确认 ≥1.38.0 消费（层化 + positionerClassName 语义）；
- 每项独立分支独立裁断，禁止捆绑；本档随裁断逐项更新状态。
