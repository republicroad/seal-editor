# 函数生态创作与治理体验设计（自定义节点函数 · 下一阶段）

- 日期：2026-09-26
- 状态：规划 · 待排期（来源：jdm-editor 仓会话的业界实践盘点 + 宿主裁决）
- 职责裁决（宿主 2026-09-26）：**自定义函数的核心职责由 seal-editor 承担；jdm-editor
  （创新线）做与租户、权限、存储无关的编辑器与自定义函数设计**。

## 0. 定位与职责分层

| 层 | 职责 | 本设计中的落点 |
| --- | --- | --- |
| **zen-udf** | 通用机制与契约 | schema 扩展（`deprecated` 字段）、函数级测试夹具契约、单函数执行（REPL）端点协议 |
| **jdm-editor**（创新线） | 与租户/权限/存储**无关**的创作体验设计与原型 | 函数目录 UI、类型感知补全 provider、REPL 面板、画布弃用标记、夹具视图——全部无状态 |
| **seal-editor**（产品线） | 函数核心职责的产品化与**治理** | 版本治理、弃用策略落地、设计时变更日志、租户/权限相关的目录过滤、夹具持久化 |
| **宿主应用** | 领域函数本身与领域参数表单 | 按 2026-09-26 分层原则：通用进 zen-udf，领域细节宿主继承/扩展 |

**协作模式**（先例已验证）：创作体验在 jdm-editor 原型验证（无状态、无租户）→
移植 seal-editor 产品化并叠加治理。反向移植先例：WS1 R4/R6/R7、Excel data-grid
三批（其 b38026a/f26d279）、PanelEmpty（其 24abf20）。

## 1. 创作体验蓝图（五项）

### A1 · 函数目录 UI

浏览已注册函数包：签名、文档、示例、版本、来源 pack，一键插入画布为自定义节点。

- 业界参照：Camunda connector 模板库、Decisions function browser
- 契约：`udfFunctionSchemaNamespaces()` 已在（zen-udf `register.ts:379`）；
  目录 UI 为编辑器通用面
- 量级：1–2 天

### A2 · 类型感知补全与悬浮文档

Monaco completion + hover provider 从 registry schema 生成——输入函数名前缀弹出
签名、参数说明、示例；悬浮显示文档与弃用标记。

- 业界参照：IBM ODM 的 BAL 智能补全
- 契约：同 A1 schema；provider 为编辑器通用机制（与语言无关）
- 量级：~1 天

### A3 · UDF 试运行 REPL

不经图直接调用单个函数试参数——函数级"curl"：选函数 → 填参数（schema 驱动表单）→
执行 → 看输出/耗时。

- 契约：demo-server 需增**单函数执行端点**（zen-udf 机制）；REPL 面板为编辑器面
- 量级：~1 天（端点 ~0.5 + 面板 ~0.5）

### A4 · 弃用与版本标记

zen-udf schema 增 `deprecated?: { since?: string; note?: string }`；画布节点角标、
补全列表、目录三处标黄提示。

- 分层：字段=zen-udf 契约；三处显示=编辑器
- 量级：~0.5 天

### A5 · 函数级测试夹具视图

每 UDF 的样例参数→期望输出（zen-udf conformance 已有库侧机制），编辑器出
pass/fail 视图；夹具随 pack 走（通用样例）或宿主补业务夹具。

- 分层：夹具契约=zen-udf；视图=编辑器；**业务夹具持久化=seal-editor 治理**
- 量级：~1 天（视图；持久化随 seal-editor）

## 2. 治理体验（B 组摘要——归属 seal-editor）

| 项 | 说明 | 归属 |
| --- | --- | --- |
| 集中验证面板 | 全图校验错误集中列表，点击跳节点 | UI 原型可 jdm-editor 出；产品化 seal-editor |
| 图 lint | 不可达节点/缺 default 分支/重复条件/孤儿子图静态分析 | 遍历逻辑通用；报告面板随产品线 |
| 规则覆盖率视图 | simulator trace 聚合为规则命中统计 | 编辑器聚合视图（无状态原型）|
| 设计时变更日志 | 谁/何时/改了哪个节点 | **seal-editor**（依赖持久化与身份）|

治理项天然绑定租户/权限/存储——按职责裁决归 seal-editor；jdm-editor 至多出
无状态视图原型。

## 2.5 UDF Lab 验证结论输入（2026-09-27，来自 jdm-editor A1 走查）

UDF Lab（jdm-editor 树内验证面）已通过浏览器端到端走查，以下实测事实直接支撑本设计的批次判断：

1. **契约面已就绪**：schema 端点（udfFunctionSchemaNamespaces）在真实浏览器中驱动了
   目录面板——schema 驱动节点（查询名单/HTTP 请求/摘要签名/当前日期/ab-bucket/
   custom-list-query/datetime）全部出面板，4 个重名被内置专用节点接管。A1 目录 UI、
   A2 补全的数据源即此端点，无需新增契约。
2. **执行链路实测数据**（批次 2 REPL 的性能基线）：roster query 2672µs、crypto 622µs、
   current_date 首调 50138µs（TSFN/wasm 冷启动）。**REPL/耗时展示需标注冷启动**，
   或 zen-udf 侧加预热口——已列入 jdm-editor 二期打磨。
3. **Trust 三步全通**：执行→审计（decisionId+inputHash+UDF observe 行）→回放
   CONSISTENT。批次 3 夹具视图可复用此审计行数据源。
4. **夹具格式兼容实证**：手写夹具（udf-fixtures.ts）直接执行成功——画布产出与
   pack 契约格式一致，A5 夹具视图的数据形状以此为准。
5. **待补**：影子对比（step ③）未走查（需候选模型输入）；大表/首调预热为二期项。

## 2.6 批次 1 已在 jdm-editor 原型落地（2026-09-27）

- **A2 补全**：zen-udf registry 函数经 `setUdfCompletions(tools)` 注入内核 completion
  模块（module-level slot，与 WASM 内置补全合并，boost 提升）——**全部 zen 表达式
  编辑器**（含 CodeMirror 的 custom-node 表达式）即时获得 UDF 补全与悬停文档；
  2 项单测（合并/清空/零参）。
- **A1 目录 UI**：UDF Lab 的 Sheet 抽屉（pack 分组 + 搜索过滤 + 签名/参数表/返回/
  插入画布）；插入的 customNode 序列化与夹具契约一致（expressions: key=函数名、
  value='udf名;;参数名…' 位置绑定），live 验证通过（搜索 crypto → 插入 → 画布节点
  与状态条确认）。
- **移植路径**：seal-editor 产品化时把 playground 的 function-catalog 移入内核或
  appshell（组件本身无状态），并叠加治理（租户过滤目录、deprecated 标记后补）。

## 2.7 批次 2 已在 jdm-editor 原型落地（2026-09-27）

- **A3 REPL**：demo-server 新增 `POST /v1/functions/:name/execute`（位置参数经
  validatePositionalArgs 校验 + funcBindParams 默认绑定 → registry.call，返回
  result/micros/kwargs）；UDF Lab 增加 REPL tab（函数下拉 + schema 驱动参数表单 +
  耗时展示），目录卡片"试运行"一键跳转预选。live 验证：legacy_hash 位置传参
  sha1("hello") 精确、94µs 暖态。
- **A4 弃用标记**：zen-udf schema/ContribToolDef/CustomFunctionTool 增
  `deprecated?: { since?, note? }`（additive minor）；demo-server 注册弃用演示工具
  legacy_hash；目录卡片警示 tint + 徽章 + note 行、补全 info 前置 ⚠️ 行（单测覆盖）。
  **seal-editor 治理接入点**：租户/权限相关的目录过滤与业务夹具持久化按本设计 §0 归属，
  可直接消费 deprecated 字段做产品级弃用治理。

## 2.8 批次 1/2 产品化已在本仓落地（2026-09-29，随 seal-editor 1.9.0 / seal-appshell 1.12.0）

- **A1**：FunctionCatalog 组件移入 appshell（components/function-catalog，无状态；弃用卡 A4 内置 + catalogFilter 面）；playground UDF Lab 接线（目录按钮 + 插入画布，序列化契约与夹具一致）
- **A2**：setUdfCompletions 移植内核 completion 模块并导出；产品化改进——接线收编进 useCustomNodes hook（schema 到达即全量注入），宿主零接线；补全不跟随 catalogFilter（ADR-010 裁定）
- **A4**：CustomFunctionTool.deprecated 类型 + 目录卡（tint/徽章/note）+ 补全 ⚠️ 首行（画布角标原型亦无，维持）
- **治理叠加**：catalogFilter 谓词（ADR-010 Phase 2）+ 专用函数注册表（tester+rank 去硬编码）+ migrateGraph 版本迁移器——见 [dedicated-node-registry-design.md](./dedicated-node-registry-design.md)
- **A3 已落地（2026-09-29）**：demo-server POST /v1/functions/:name/execute（view 驱动校验/绑定 + ExecContext 包装，见 repl-panel-plan.md §3.5）+ appshell FunctionRepl 组件 + UDF Lab REPL 页签（catalog 试运行衔接）

## 3. 实施批次建议

| 批 | 内容 | 量级 | 仓 |
| --- | --- | --- | --- |
| 1（随 UDF 生态启动） | A1 目录 UI + A2 补全/悬浮 | 2–3 天 | jdm-editor 原型 → seal-editor 产品化 |
| 2 | A3 REPL（含 demo-server 端点）+ A4 deprecated | 1.5 天 | 端点/字段=zen-udf；UI=jdm-editor |
| 3 | A5 夹具视图 | 1 天 | 视图=jdm-editor；持久化=seal-editor |
| 4（治理窗） | 集中验证面板 + 设计时变更日志 | 2 天+ | seal-editor |

## 4. 开放问题

1. REPL 端点形态：单函数执行走 demo-server 新路由还是复用 `/v1/execute` 单节点图？
2. 弃用粒度：函数级 vs pack 版本级（影响 schema 字段设计）；
3. 夹具存放：随 pack（通用样例，zen-udf 侧）vs 随图/随租户（业务夹具，seal-editor 侧）——
   建议两者都支持，契约上分开。

## 5. 本仓（jdm-editor）状态备注

本设计写于 jdm-editor 仓会话（创新线）。jdm-editor 侧现状：UDF Lab 闭环已建成
待浏览器验证；dt 核心编辑器已 data-grid 化；ReUI 优化转填缝
（[其 backlog 活档](../../../jdm-editor/docs/design/reui-optimization-backlog.md)）。
创作体验原型的工作面（A1/A2/A3 UI）在 jdm-editor 承接，与裁决一致。

相关：[development-roadmap.md](./development-roadmap.md) ·
[handoff-verdict-integration.md](./handoff-verdict-integration.md) ·
[velocity-udf-plan.md](./velocity-udf-plan.md)
