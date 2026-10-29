# verdict console ↔ seal-editor · 2.0 升级核查协商包

- 日期：2026-10-27 起草 · 2026-10-29 更新（④ 随架构裁定取消）
- 状态：**已回收**（verdict 六项全答，见
  [alignment-reply.md](verdict-console-2point0-alignment-reply.md)；其中
  **④ 单跑 asOf 随 2026-10-28 架构裁定取消**——verdict 定位实时决策引擎，
  verdict 侧 simulateHandler 适配义务解除，双侧零动作；裁定全文见
  [two-point-oh-inventory.md](../two-point-oh-inventory.md) §5）
- 背景：seal-editor 2.0 破坏性窗口已开启（verdict 已升级消费 1.42.0，满足窗口前置）。
  本档列出需要 verdict 侧核查/表态的六项——前两项一句话级回答即可解锁两大破坏性批次。
- 关联：[two-point-oh-inventory.md](../two-point-oh-inventory.md)（2.0 盘点活档）·
  [release-verification.md](../release-verification.md)（验证流程）

---

## 速答版（verdict 直接复制填写即可）

```text
1. 挂载形态：.seal-root 挂在 [ body / html / 根 div ]；data-mode 放在 [ ___ ]；
   .seal-root 之外的 UI [ 有 / 没有 ] 依赖 seal token。
2. 函数参考面：verdict console [ 会 / 不会 ] 通过 functionLibraries 注入自己的函数库；
   不注入的页面希望 [ 显示内置目录 / 不显示 Libraries 页签 ]。
3. 兜底插件：确认 1.42 层化产物消费正常后，verdict 仓的层化兜底插件/哨兵
   [ 可以删除，随 ___ 发版 / 暂不删 ]。
4. asOf 单跑：编辑器单次仿真需要指定事件时间调试时序规则吗？
   [ 需要，愿意做 simulateHandler 适配 / 暂不需要 ]
5. 类型冲突连线：使用中遇到过不同数据类型端口连线的情况吗？
   [ 常见 / 偶尔 / 没遇到过 ]
6. localStorage 键：jdm-editor: 前缀键 2.0 维持不改名——
   [ 知悉，无异议 / 希望改名隔离 ]。
```

---

## ① 宿主挂载形态 🔴（阻塞：LEGACY 退役批）

**问**：verdict console 里 seal-editor 的 token 作用域根 `.seal-root` 挂在哪个元素
（body / html / 根 div）？`data-mode`（深浅切换）放在哪？页面里是否有**任何** .seal-root
之外的 UI 依赖 seal token？

**为什么**：2.0 删除 `tokens.css` 两段 LEGACY fallback（`:root:not(:has(.seal-root))`
全局注入兜底）。删后 token 只在 `.seal-root` 子树内生效——若 verdict 有岛外 UI 吃
seal token，删除即掉样式。

**解锁**：LEGACY 退役批（tokens 两段删除 + guard `--strict` + kernel 迁移告警移除）
+ verdict 仓哨兵退役（见 ③）。

## ② 空注入 vs 缺省目录表态 🔴（阻塞：语义裁断批）

**问**：verdict console 会通过 `functionLibraries` prop 注入自己的函数参考
（host-functions 的 trailing 算子族）吗？是否存在**不注入**的编辑器页面？若存在，
那些页面希望显示内置示例目录，还是不显示 Libraries 页签？

**为什么**：`dg-empty` 现状把空数组注入也回落内置表（宿主无法表达「空参考面」）。
2.0 二选一：**A**=无注入=不显示（诚实语义，独立模式失去开箱目录）；**B**=保留
缺省目录（开箱体验，空注入语义不成立）。两项互斥，窗口期必须显式裁断一次。

**解锁**：语义裁断批（§2+§3 一起动：`dg-empty` 不回落 + `TabFunction` 直传 +
`Function` 组件缺省值去除，或全部维持现状）。

## ③ 兜底层插件/哨兵退役安排 🟡（verdict 仓动作项）

**问**：verdict 仓中给 seal-editor dist 兜底的层化插件/哨兵（未层化时代产物），
确认 1.42 层化产物消费正常后可否删除？随哪次 verdict 发版？

**为什么**：LEGACY 退役的跨仓配套——verdict 侧不删会继续兜底掩盖回归。

**解锁**：「LEGACY 退役完成」的最终判定（不阻塞 seal-editor 侧代码）。

## ④ asOf 时钟注入需求确认 → **已裁定取消（2026-10-28）**

> **裁定（晚于 verdict 回答「需要」）**：seal-editor 侧 2026-10-28 深夜架构裁定——
> verdict 定位**实时决策引擎**：不向客户暴露 eventTime/processingTime 概念对；
> 状态算子时间恒为**请求到达服务器时刻**（processing time，不可注入）；客户入参中的
> 时间参数＝普通标量数据，表达式可做任意标量处理；对外仅提供**决策历史查询**。
> 据此**单跑 asOf 批整体取消**：seal-editor 不再出 CONTRACT `onRun` 载荷扩展与
> 时钟选择器 UI；**verdict 侧 simulateHandler→ExecContext.eventTime 适配义务解除，
> 无需任何动作**。Run all fixtures 的 asOf 为 QA 内部通道（非产品语义），保留不变。
> 裁定全文见 [two-point-oh-inventory.md](../two-point-oh-inventory.md) §5 与回执档 ④。

**问**（历史存档，已被裁定覆盖）：trailing 类时序规则在**编辑器单次仿真**场景需要指定事件时间（asOf）调试
历史时点行为吗？Run all 批量通道已支持 asOf；单跑通道若要支持，verdict 侧
simulateHandler 需把 asOf 装进 ExecContext.eventTime（此前勘定通道可行）——
是否愿意做这个适配？

**为什么**（历史存档）：单跑 asOf 批此前勘定「等 verdict 升级后立项」——升级已完成，本项是
立项信号。verdict 答「需要」则 seal-editor 出 CONTRACT 载荷扩展 + 时钟选择器 UI。

## ⑤ 类型冲突连线的真实反馈 🟢（连线类型阻断批优先级信号）

**问**：verdict 使用 seal-editor 以来，遇到过**不同数据类型的端口之间连线**的情况
（如 number 连 string）吗？频率如何？

**为什么**：连线类型阻断（铁律 5 最后缺口）原判「等真实类型冲突反馈」。真实案例
决定形态（硬阻断 vs 警示态）与优先级。

## ⑥ localStorage 键维持告知 ⚪（知会项，非问题）

`jdm-editor:` 前缀 localStorage 键（列宽/画布状态等用户数据）2.0 **维持不改名**
（历史用户数据兼容优先）。verdict 侧已存数据自动延续；若希望改名隔离，仅在 2.0
窗口提出。

---

## 回收后动作映射

| 回答 | seal-editor 侧动作 | 批 |
| --- | --- | --- |
| ① 无外部依赖 | LEGACY 两段删除 + guard --strict + 告警移除 | LEGACY 退役批 |
| ① 有外部依赖 | 先迁移 verdict 侧样式入岛，再走上行 | 同上（+前置） |
| ② A 无注入=不显示 | dg-empty 不回落 + TabFunction 直传 + Function 缺省去除（三处一起动） | 语义裁断批 |
| ② B 保留缺省 | 现状维持，§2 撤销并注记 | 同上（零代码） |
| ③ 可删除 | seal-editor 侧无动作；verdict 随版删 | — |
| ④ 需要 | ~~CONTRACT onRun 载荷加可选 asOf + 时钟选择器 UI（seal-editor）；ExecContext 装配（verdict）~~ → **裁定取消**（2026-10-28 实时决策引擎定位，双侧零动作） | 已取消 |
| ⑤ 有案例 | 连线类型阻断批立项（形态按频率定） | 类型阻断批 |
