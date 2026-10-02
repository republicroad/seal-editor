# 输入节点 UI 重设计——从三页签独立到分屏联动编辑器

- 日期：2026-09-30 起草 · 2026-10-02 校准（对照 ADR-013 批次一~三已交付现实）
- 状态：**已裁定 · 实施中**（2026-10-02 宿主裁定：分屏范式**一次性取代**三页签，
  不留长期双轨；本仓先行实施，jdm 评审并行——协商方式沿 ADR-013 惯例，评审
  注记随到随落）。数据层（ADR-013 批次一~三）已全量上线并随 1.16.0 发版；
  本文档只管视图组合。

## 0. 现状校准（2026-10-02，对照原实施切分）

| 原阶段 | 状态 |
| --- | --- |
| UI-1 契约 store + drift 检测 | ✅ 已交付——**契约模块 + 单写漏斗形态**（jdm 批次一验收接受的偏差，非 zustand 字面 store）+ drift 三类清单 + ajv 懒加载约束校验 |
| UI-4 漂移徽标 + 迁移 + 变更日志 | ✅ 已交付——Examples 视图徽标/迁移/确认（批次一）+ `onContractEvent` 事件流接 ChangeLogPanel（批次三） |
| UI-5 旧图兼容（`;;`→具名调用） | ☠️ **消解**——`;;` 兼容被 ADR-013 评审判类别错误删除（OQ5）；真正的 legacy 兼容（内嵌 examples 读取回退 + 首编辑迁移写入）已随批次一交付 |
| **UI-2 Field Tree + Context Editor** | ⬜ 本批 |
| **UI-3 Code/Design 双模式 + Example 内联 + Fixtures 面板** | ⬜ 本批（量级修正 ~1.5 天，见 §4） |

## 1 · 已裁定决策

### 1.1 取代语义

分屏编辑器**一次性取代**输入节点的三页签（Definitions/Examples/Schema 页签
消失），不留长期双轨：

- 三个页签**全部有归宿、无功能删除**：字段定义 → 左栏树 + 右栏编辑器（同一套
  BlurCommitInput/Select 控件语义）；Schema → Code 模式（同一 monaco 换挂载点）；
  用例数据 → 顶栏 Examples 下拉 + 底部 Example Preview 条；
- **数据层一行不动**：契约模块、drift、ajv、Run all 槽位、漂移事件流全部视图
  无关，替换风险面只在视图组合层，git 可整体回退；
- 会话草稿兼容：旧草稿的 `activeTab` 降级映射（schema→Code 模式，其余→Design）；
- jdm 若跟进 adopting 则两仓编辑器同构，不跟进则为「seal 创新线 / jdm 择需
  移植」的自觉分叉——由 jdm 评审**显式表态**，不默认发生。

### 1.2 多示例集合的归宿（原开放问题 5，宿主采纳修订版）

```
┌────────────────────────────────────────────────────────────┐
│ [Design|Code]  [Examples: 正常GOLD ●▾] [▶ 全部运行] [工具栏] │ ← 顶栏
├──────────────┬─────────────────────────────────────────────┤
│ Field Tree   │  选中字段的上下文编辑器                        │
│ ▼ customer   │  Name/Type/Default/Description               │
│   tier  str  │  （object → 子字段列表 + 添加子字段）          │
│ ▼ cart       │                                              │
│   weight num │  ┌─ Example Preview ──────────────────┐      │
│ [+ Add]      │  │ 可编辑 JSON（compact monaco）       │      │
│              │  │ ⚠ 缺 1 · 约束 2      [迁移] [确认]  │      │
└──────────────┴──┴────────────────────────────────────┴──────┘
╞═ Fixtures 面板（底部抽屉，与 simulator 对称，图级）═══════════╡
│ Request（唯一 inputNode）  [▶ 运行 3 个用例]    上次: 2/3 通过     │
│ ✓ 通过  正常GOLD用户  12ms          ✗ 断言… 边界:零金额  [调试→]│
╞═ Simulator 抽屉（单例调试，现状不变）═════════════════════════╡
```

- **顶栏 Examples 下拉**：具名示例集合的唯一管理入口——每项 = 名称 + 漂移
  点标（hover 三类计数），选中即切换活动示例；增删改名进下拉（新建页脚 +
  悬停动作）；>20 软折叠迁移为下拉页脚「显示全部」；
- **右栏底部 Example Preview 条**：活动示例 JSON **可编辑**（compact monaco，
  保留 700ms 会话草稿 + blur-commit 语义）；**全量 JSON** 而非字段切片（选中
  字段高亮定位）；本示例漂移三类计数 + ajv 约束违例 + 迁移/确认动作内联；
- **图级 Fixtures 面板（取代原「运行报告页」提案）**：Run all 从节点页签附属
  条升格为与 simulator 对称的底部抽屉——批量是图的属性不是节点的属性；全宽
  矩阵（名称/结论/耗时/错误/命中节点五列）；报告状态升 dg-store（图级，切
  节点不丢）；`simulateHandler` 存在时由 appshell 注册（与 simulator 同款），
  kernel 渲染组件、读 `fixturesRunner` 槽位——**zen-udf runDecisionTests
  字面复用不变**；
- **联动原则：传选择，不传状态**：面板/下拉的选择经既有 `syncExampleToSimulator`
  串到模拟器；面板行「调试→」= 选中 + 打开 simulator 抽屉（浅联动）；批量
  结果不灌入模拟器面板（模型不匹配 + executor 契约不搬运完整 trace），执行
  语义单源（同一 simulateHandler）保证失败必然复现；
- 输入节点页签「全部运行」按钮 = 打开/聚焦 Fixtures 面板 + 以本节点示例集
  触发运行（注意力跟随动作）；**无绑定概念——域约束下规则图至多一个 inputNode，面板直接
  作用于它**（无节点时显式 no-input-node 错误态）。

### 1.3 开放问题 1-4 答案

1. **类型驱动控件映射**：string/number/datetime → 文本输入（datetime 带格式
   提示）；boolean → switch；object → 子字段列表 + 添加子字段；array → Design
   模式只读展示，编辑引导进 Code 模式；
2. **嵌套深度**：递归树（headless-tree 语义），不设硬深度，折叠解决展示；
3. **与 dt 一致性**：共享控件**语义**不共享组件（同 ListPanel 裁定逻辑——
   dt 字段带 enum/ref，input 字段带 default/description，强行抽件过度抽象）；
4. **undo/redo**：免费获得——契约写入全走 `updateNode`，既有 undo 快照自动
   覆盖字段增删。

## 2 · 业界参照（保留原文要点）

分屏联动（Stoplight Studio 金标准）：字段树常驻导航 / 类型驱动编辑器切换 /
schema↔example 双向校验不切页签 / Design-Code 双模式 / example 可执行 /
migrate 而非静默改。三页签（现状）= 上下文断裂；schema-driven 自动表单 = 表达
力不足。六条交互模式全部由已上线数据层支撑，本批补齐视图。

## 3 · reui 组件选型

Field Tree = kernel 内轻量递归树（先行，复用 DefinitionCard 的折叠/徽标语义；
reui tree 若后续需要再 vendoring）；Context Editor = BlurCommitInput + Select +
现有 primitives；Code = 既有 monaco schema 编辑器；Preview = compact monaco；
Fixtures 面板矩阵 = 批次三 RunAllMatrix 迁移复用；Drift = 既有琥珀点标 +
badge。

## 4 · 实施切分（修订）

| 批 | 内容 | 归属 | 量级 |
| --- | --- | --- | --- |
| 校准稿 | 本文档 + 提 jdm | docs | ✅ |
| **UI-A** | kernel：fixtures-run 纯函数（节点示例集 → ContractFixture[]）+ dg-store `fixturesRun` 图级状态 + `runFixtures` action + FixturesPanel 组件 | kernel | ~0.5 天 |
| **UI-B** | kernel：TabRequest 重写——顶栏（Design/Code 切换 + Examples 下拉 + 工具栏）+ 分屏体（FieldTree/ContextEditor/Preview 条）+ Code 模式 + 会话草稿兼容 + 旧三视图组件退役 | kernel | ~2 天 |
| **UI-C** | appshell：注册 fixtures 面板 + 透传；Storybook/交互测试更新 | appshell | ~0.5 天 |

## 5 · 后果

- 正面：消除页签上下文断裂；quality gate 落在编辑现场；结构/实例分离（树管
  结构、下拉管实例）；Run all 升图级面板与 simulator 对称，矩阵获得全宽空间，
  报告跨页签存续；数据层零改动、可整体回退；
- 约束：TabRequest 重构是本批最大 diff（旧三视图组件退役）；会话草稿形状
  变更需降级兼容；两仓编辑器可能分叉（jdm 显式表态）；
- 协商：本仓先行实施，jdm 评审并行、随到随落（ADR-013 批次同款节奏）。

## 6 · jdm 评审注记（2026-10-02，并行评审）

### 账实核对（四点全实证）

- 批次一~三全落地（cb668c2 kernel Run all/结果矩阵/漂移事件流 + 9759ace
  appshell fixturesRunner 适配器/变更日志）+ kernel 1.16.0 已发版——本档 §0
  校准表与代码一致（前次验收的「1.16.0 勘误」已被批次二/三合版解决）；
- `syncExampleToSimulator`/`simulatorExampleBinding`/`fixturesRunner`/
  `onContractEvent` 消费点逐一核实存在；
- UI-5 消解正确回溯 ADR-013 OQ5 裁定（类别错误），真正的 legacy 兼容
  （内嵌回退+首编辑迁移）已随批次一验收；
- 「contract 模块+单写漏斗」偏差沿用批次一验收裁定的接受结论。

### 逐节裁定

| 节 | 裁定 |
| --- | --- |
| §1.1 取代语义 | **接受**——一次性取代、全部有归宿、数据层零改动可整体回退，风险面控制正确。**一处「无功能删除」声称未闭合**：原 Schema 页签的 **diff 对比历史 / 格式化 / JSON→Schema 转换**三件能力去向未声明——Code 模式须继承（monaco 工具栏三钮）或在 UI-B 显式退役+迁移注记，勿静默丢失。入 UI-B 验收清单 |
| §1.2 多示例集合 | **接受**——Fixtures 升图级抽屉与 simulator 对称成立；「传选择不传状态」联动原则正确；批量结果不灌模拟器的两个理由成立。**一处精确化**：「失败必然复现」依赖 executor 的图快照闭包——「调试→」深链在图已编辑后复现的是**快照时点**而非当前图，建议面板行显示快照时点（或运行前刷新闭包），防「明明改好了还报旧错」的困惑 |
| §1.3 OQ1-4 | **接受**——array 的 Design 只读+Code 编辑引导是正确边界；undo/redo 经 updateNode 免费成立 |
| §3 reui 选型 | **接受**——「轻量递归树先行、reui tree 后置 vendoring」与两仓裁定史一致（P-2：request-definitions 是编辑器非只读树，headless-tree 不适配）；**替换单前实读目标组件**的纪律保持 |
| §4 实施切分 | 量级合理（UI-B 2 天为最大 diff，会话草稿降级映射已在案） |

### jdm 表态（§1.1 明确要求）

**暂缓跟进，自觉分叉入档**。理由：①双仓定位——seal 产品线先行实施+Storybook
走查，jdm 创新线择需移植（同面三视图在 jdm kernel 仍服务现状，无实际问题
驱动冒险）；②UI-B 是 3 天级大 diff，两仓并行重写徒增移植税；③移植链路保持
开放——seal 走查通过后按跨仓移植惯例评估（L6/Excel 先例）。此表态即 §1.1
「不默认发生」的显式化。

### 附带：ADR-014 包面注记已实施（jdm 侧，2286add3）

verdict web 构建阻塞的 runner 子路径导出已落地——三文件拆分（fixtures.ts
纯 runner **零运行时 import** / runtime-executor.ts 服务端适配器 /
expression-evaluator.ts 求值器工厂）+ exports 子路径图。**分歧点声明**：包面
注记只点名引擎 import，但 `runWithExecContext` 的 `node:async_hooks` 同样
不能进浏览器文件——纯 runner 与服务端适配器分文件才是彻底解（垫片拆除条件
=0.13.1 发版，待宿主口令）。Fixtures 面板（UI-A）的浏览器依赖面自此就绪。
