# verdict console ↔ seal-editor · 2.0 协商包回复

- 日期：2026-10-28
- 状态：**已回答**（六项全答；③含 verdict 侧退役时序约束，见单 item 说明）
- 回执对象：[verdict-console-2point0-alignment.md](verdict-console-2point0-alignment.md)
- 证据基准：verdict 仓 b55ef7a（seal-editor 1.42.0 消费态）

---

## 速答版（已填写）

```text
1. 挂载形态：.seal-root 挂在 [ 根 div ]（编辑器画布容器，h-full w-full 贴边布局）；
   data-mode 放在 [ 同一根 div ]（next-themes resolvedTheme 单向桥接，ADR-023 D3
   syncDocumentTheme=false 后 appshell 不写 document）；
   .seal-root 之外的 UI [ 没有 ] 依赖 seal token（控制台全走 shadcn/next-themes
   变量；index.html 的 seal-root 哨兵不是消费者，是对抗 LEGACY 接管的防御物）。
2. 函数参考面：verdict console [ 会 ] 通过 functionLibraries 注入自己的函数库
   （唯一挂载点恒注入 17 命名空间宿主目录；加载完成前 prop=undefined 非 []，
   无「空数组注入」窗口）；无不注入页面 → 裁断选 [ A：无注入=不显示（诚实语义；
   A 的独立模式代价 verdict 零承担）]。
3. 兜底插件：哨兵 [ 可以删除，随 verdict 升级 seal-editor 2.0（LEGACY 已删版）
   的同一次发版 ]——不能先行（LEGACY 的 :root:not(:has(.seal-root)) 接管规则
   在位时删哨兵 = 暗色翻浅回归）。
   vite 层化插件 [ 不可整删 ]：seal 包分支已死代码可随 2.0 升级移除；
   monaco/scalar 分支现役（见 ③ 说明）。
4. asOf 单跑：[ 需要，愿意做 simulateHandler 适配 ]（P1 非紧急——trailing/velocity
   生产配方族的时序调试是真需求，通道此前已勘定可行）。
5. 类型冲突连线：[ 没遇到过 ]（当前作者面=开发团队；demo 阶段无第三方作者；
   图形级校验在保存/执行侧已有兜底）。
6. localStorage 键：[ 知悉，无异议 ]。
```

---

## 逐项依据

### ① 宿主挂载形态 → LEGACY 退役批解锁 ✅

- 挂载点：`apps/web/src/features/editor/editor-canvas.tsx` 编辑器画布唯一挂载
  `<div className="grl-root h-full w-full overflow-hidden" data-mode={dataMode}>`。
  verdict 侧类名仍是 1.x 的 `grl-root`——2.0 若更名 `.seal-root`，升级批次里
  verdict 同步改挂载类名（一处）。
- 岛外消费核查：`grep var(--grl / var(--seal` 在 editor feature 之外零命中；
  `styles.css` 仅层预声明（`@layer seal-editor, scalar-theme, ...`）非 token 消费。
- 哨兵（`index.html` `<div class="seal-root" hidden>`，ec522f8）性质=对抗 1.x
  未层化 CSS 的 `:root:not(:has(.seal-root))` 接管，**非 token 消费者**。LEGACY
  两段删除后该规则不复存在，哨兵即失去对象——退役时序见 ③。

**结论：①「无外部依赖」成立，LEGACY 退役批可动。**

### ② 空注入 vs 缺省目录 → 裁断 A ✅

- verdict 唯一编辑器挂载点（editor-canvas）无条件传 `functionLibraries`，恒为
  宿主目录（内建运行时库 + host-functions.json 17 命名空间，批次 30b）。
- 加载形态：`useState<FunctionLibrary[]>()` 初始 undefined、异步到位后 set——
  **不存在传 `[]` 的路径**，`dg-empty` 现状回落对 verdict 从未生效。
- 裁断 **A**（无注入=不显示）：verdict 全页面都有宿主目录，A 的唯一代价
  （独立模式失去开箱目录）verdict 零承担；且「诚实语义」与 verdict 侧
  xrule GET/POST 语义收编同一裁决原则（表达不了的状态不要伪装成缺省）。

### ③ 兜底层插件/哨兵退役安排 → 部分可删，时序约束 ⚠️

两项资产要拆开回答：

| 资产 | 现状 | 退役安排 |
| --- | --- | --- |
| `index.html` seal-root 哨兵（ec522f8） | 防御 LEGACY `:root:not(:has(.seal-root))` 接管 | **可以删除，但必须随 verdict 升级 seal-editor 2.0（LEGACY 已删版）的同一次发版**。先行删除而 LEGACY 规则仍在 = hover 预加载暗色翻浅回归（原事故复现） |
| vite `sealThirdPartyCssLayer()` 插件（bf817c7） | 见下 | **不可整删**——收窄保留 |

插件的现役职责拆解（这是对「层化兜底」定性的修正）：

- **seal-editor / seal-appshell 分支**：1.42 dist 已层化（transform 的
  `startsWith("@layer seal-editor{")` 跳过路径命中），该分支已成死代码——
  随 verdict 2.0 升级批次从 `THIRD_PARTY_CSS_ID` 正则与 dev transform 匹配中
  移除 seal 包。
- **monaco / scalar 分支**：**与 seal dist 层化无关的现役逻辑**。bf817c7 事故
  根因是第三方「独立应用」路由 CSS（Monaco 工具类、Scalar 主题）与控制台
  styles 同名 cascade layer 合并后反超——monaco/scalar 永远不会有 seal-editor
  层化，其裸层声明剥离（`@layer scalar-theme;`）+ 低层包裹必须保留。
- styles.css 的 `@layer seal-editor;` 首位预声明同理保留（它是低层优先级
  锚点，不是 LEGACY）。

**结论：③「verdict 随版删」成立，但删的是哨兵 + 插件 seal 分支；monaco/scalar
降级与层预声明为长期现役设施，不随 LEGACY 退役。**

### ④ asOf 单跑 → 需要，P1 ✅

- 需求真实：verdict 生产配方族（MK-10 查订比、MK-11/12/13、velocity 域闸）大量
  使用 trailing/velocity 时序算子，「这条规则昨天 15:00 会怎么判」是策略作者的
  高频调试问题；Run all 批量通道已支持，单跑缺口是编辑器体验的最后一截。
- verdict 侧适配面已勘定：simulateHandler（editor-canvas）把 asOf 装进
  ExecContext.eventTime（`runWithExecContext` 通道现成），工作量小。
- 优先级 P1 非紧急：不阻塞 2.0 窗口，按 seal-editor 排期即可。

### ⑤ 类型冲突连线 → 没遇到过 ✅

当前 verdict 作者面=开发团队，demo 阶段无第三方作者；类型错连的兜底在保存校验
与执行侧已有。无真实案例 → 连线类型阻断批维持原判（等真实反馈），verdict 不
给优先级加压。出现案例时按协议回传。

### ⑥ localStorage 键 → 知悉无异议 ✅

`jdm-editor:` 前缀维持——verdict 侧无改名诉求，历史用户数据自动延续。

---

## verdict 侧待办（回收后）

| 时点 | 动作 |
| --- | --- |
| seal-editor 2.0（LEGACY 已删）发布版 | 升级依赖 + 挂载类名 grl-root→seal-root（如更名）+ 删哨兵 + 插件正则收窄（去 seal 包留 monaco/scalar）——单一批次 |
| asOf 批立项 | simulateHandler asOf→ExecContext.eventTime 装配（小改） |
| 类型阻断批 | 无动作（等案例） |
