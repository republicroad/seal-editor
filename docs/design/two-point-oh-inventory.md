# 2.0 盘点档——破坏性面清单一页档

- 日期：2026-10-25 起草
- 状态：**活档**（2.0 窗口前置立法档；各项独立裁断，不捆绑发版）
- 判据：2.0 = 唯一的破坏性版本窗口——1.x 期间挂账的所有「留到 2.0」在此清点，
  逐项给出现状/动作/依赖，避免窗口开启时靠记忆拼图

## 1 · LEGACY 退役（ADR-023 D2 后半）

| 项 | 现状 | 2.0 动作 | 依赖 |
| --- | --- | --- | --- |
| tokens `:root` 接管规则 | ISLAND/LEGACY 双轨并存（LEGACY = `:root:not(:has(.seal-root))` 全局注入兜底） | 两段删除，token 只剩 `.seal-root` 作用域 | **✅ 前置达成**：verdict 回执（[alignment-reply](./upstream/verdict-console-2point0-alignment-reply.md)）确认无岛外 token 消费、挂载=根 div（类名 grl-root，2.0 随版更名 seal-root 由 verdict 同步）；哨兵随 LEGACY 已删版同发 |
| guard-dist-css `:root` 禁令 | 禁令注释挂起（--check 只断言层化） | `--strict` 启用：断言无 `:root` 接管 | 上行完成后 |
| verdict 兜底层插件/哨兵 | 值守中（补位未层化 dist 时代产物） | 随 LEGACY 删除退役（verdict 仓动作） | 跨仓协调 |

## 2 · functionLibraries 空注入语义（ADR-024 注记挂账）

- 现状：`dg-empty` 把空数组注入也回落内置表——宿主无法表达「空参考面」；
  `TabFunction` 的 `?.length ? : undefined` 实为防御性死代码。
- 状态：**✅ 已裁断（2026-10-28 verdict 回执）＝方案 A**（无注入=不显示）：verdict
  唯一挂载点恒注入宿主目录（prop=undefined 非 []，空数组路径不存在），A 的独立
  模式代价 verdict 零承担。
- 2.0 动作（**四处一起动**）：`dg-empty` 不回落 + `TabFunction` 直传 +
  `Function` 组件缺省值去除 + **§3 Dg 内置缺省目录随之撤销**（prop absent=不显示）。

## 3 · D6 · `Dg` 缺省目录去留

- 现状：缺省保留（1.x 兼容；独立应用开箱体验）。
- 状态：**✅ 已裁定（2026-10-28，随 §2 方案 A）＝缺省目录撤销**（互斥条款兑现：
  A 语义下 prop absent=不显示；§2 实施时四处一起动）。

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

## 6 · 新增挂账（2026-10-27 增补）

| 项 | 来源 | 处置 |
| --- | --- | --- |
| primitives 归档 prop 桶终清 | b2ebb87f（antd 语义接线批）：popover title/arrow/destroyTooltipOnHide/defaultOpen、date-picker variant/format、switch checkedChildren 族、tabs type、dropdown arrow/destroyPopupOnHide/transitionName、modal maskClosable/getContainer | 2.0 从类型签名删除（调用面=零，已核） |
| bundle 预算回血 | 图标全量 lucide（7d078c71）后实际 ~850kB / 预算 900kB | 2.0 收紧至 870kB 恢复紧约束 |
| style-debt HK 债缩减 | LEGACY 段删除后 HK-03/08（cascade-layer）范围缩小 | 随 §1 一并清 |

## 7 · UI 前沿对齐批（2026-10-29 增补，verdict 宿主提案）

verdict 宿主 2.0 提案的 UI/UX 批次（与 LEGACY 退役批/语义裁断批同窗——动内核的改动在破坏性窗口内做省一次大版本）：

| 批 | 状态 | 落点 |
| --- | --- | --- |
| P0-1 undo/redo 全操作栈 | ✅ **已落地**（0d90f6fe） | S009-A 快照栈补齐全操作面：undo/redo 三写通道（RF 视图+模型态+onChange）+ 选区保持 + addEdges/removeEdges 进栈补口 + resetHistory 边界动作（宿主在切模型/恢复版本时调用）+ ⌘Z/⌘⇧Z（Win Ctrl+Z/Ctrl+Y）window 键位（文本焦点让路）+ 工具条按钮。`BREAKING`: actions 新增 resetHistory 必选成员 |
| P0-2 校验面板产品化 | ✅ **已落地**（656d801d） | 内置校验器（MISSING_INPUT/EMPTY_EXPRESSION error + EMPTY_RULES warning；表达式语法错归宿主通道——内核无 zen 解析器）+ DiagnosticsController 250ms 防抖 + 画布停靠面板（行点击选中+定位）+ `diagnostics` prop 宿主通道 + 工具条错误计数徽标 |
| P1-3 快捷键帮助面板 | ✅ **已落地**（b76c31fc） | 非输入焦点 `?` 弹清单（平台感知 ⌘/Ctrl）+ 随批补 ⌘C/⌘D/⌘V 的 Ctrl 等价 |
| P1-4 diff 独立入口 | 待排（~0.5 天） | 建议：侧工具条开关切 diff 基线视图（复用 diffBaseline/calculateDiffGraph 既有面），与版本历史恢复流解耦 |
| P1-5 聚焦模式（chrome collapse） | 待排（~0.5 天） | 建议：扩展 hideLeftToolbar state 为 hideChrome（左栏+面板收起，Esc 退出）；与浏览器全屏互补 |
| P1-6 presence 展示位 | 裁定：**2.0 不立项原生位，宿主 overlay** | presence 是多用户语义，内核=单用户组件（ADR-008 host-owned 同一哲学）；verdict 自建 heartbeat + overlay 零内核 API 面；真实时协作属 3.0 级立项。宿主 overlay 注意 z 阶梯（<50 浮层位）+ nodrag 容器 |
| base-ui 迁移残留自查 | ✅ **已落地**（4441b098） | 五类扫描：asChild/textValue（词边界）/forceMount/GroupLabel 全净；onSelect 真残留=数据网格列显隐菜单 2 处（Radix 防关闭惯用法→closeOnClick={false}） |

## 触发与协调

- ~~窗口开启前置：verdict 侧确认 ≥1.38.0 消费~~ **✅ 已达成（2026-10-27：verdict 升级消费 1.42.0）——窗口开启**；
- 前置核查 **✅ 全部回收**：verdict 回执见 [verdict-console-2point0-alignment-reply.md](./upstream/verdict-console-2point0-alignment-reply.md)（六项全答；③修正定性=插件 monaco/scalar 分支为长期现役设施不可整删，仅删哨兵+seal 分支）；
- **时间语义裁定（2026-10-28 深夜）**：verdict 定位**实时决策引擎**——状态算子时间恒为请求到达时刻，不暴露 eventTime/processingTime 概念对；客户入参时间＝标量数据（表达式任意标量处理）；对外仅提供**决策历史查询**。单跑 asOf 批取消（回执④裁定入档）；Run all fixtures 的 asOf 保留（QA 内部通道，非产品语义）。
- 每项独立分支独立裁断，禁止捆绑；本档随裁断逐项更新状态。
