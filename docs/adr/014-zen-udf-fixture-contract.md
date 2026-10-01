# ADR-014：zen-udf 测试夹具契约——executor 反转、smoke 语义与报告增强

## 状态
proposed（2026-10-01 seal-editor 起草——zen-udf 单一源与发布方在 jdm-editor 仓
（ruling 12），目标版本 **0.13.0**，旧形态 1.0 移除。本 ADR 起因于 ADR-013 批次
三「Run all 复用 runDecisionTests，勿新写 runner」的复用诉求与 kernel 引擎无关
架构的张力。待 jdm 协商裁定：逐节标注接受/否决/修改，更新本状态行）

## 背景

### 现状

zen-udf `fixtures.ts`（Y7）的 `runDecisionTests(runtime, {key, model, fixtures})`：
runner 自持模型登记（`createDecisionWithCacheKey`）+ 求值（`evaluateAsync`），
消费方为 demo-server `/v1/fixtures/execute` 与 verdict 模型登记页「发布前跑夹具」。

### 问题陈述

ADR-013 批次三要把输入节点的 examples 升级为「Run all 结果矩阵」，评审裁定
复用 `runDecisionTests`——但存在四个结构性缺陷，字面复用被阻断：

1. **执行器耦合**：首参 `runtime: DecisionRuntime` 把「怎么执行」焊进 runner。
   kernel 刻意引擎无关（执行 = 宿主 handler 契约），非 runtime 世界（浏览器
   编辑器、mock executor、未来本地引擎）想复用只能重写 runner——恰是评审
   「勿新写 runner」要防的语义分叉；
2. **`expect` 必填 + predicate 不可序列化**：无期望值就不能跑（ADR-013 的
   NamedExample 是 smoke 语义：passed = 执行无异常，现有 API 表达不了）；
   `{mode:'predicate', test: fn}` 携带函数体过不了网络——夹具作为跨端交换物
   （verdict 存库、编辑器提交）此路是断的；
3. **报告太薄**：`FixtureResult` 无 `outcome` 枚举（断言失败与执行错误挤在
   `error` 字符串）、无耗时、无 hit nodes——结果矩阵（结论/耗时/命中节点）
   三列无处安放；
4. **隔离缺陷**：runner 把模型登记在共享 runtime 的**用户 key@rev** 上——同
   键会替换宿主正在服务的模型缓存，且污染 ADR-003 归宿主所有的 L1 决策缓存。

## 定位边界（公理，宿主裁定 2026-10-01）

- **zen-udf 是服务端多租户 runtime**：租户 ExecContext、数据面端口、审计
  journal/Y3 回放、breaker/OTel 是产品本体，全部是服务端关切；浏览器没有这些
  的对应物（数据面拉到浏览器 = 数据治理违规）；
- **浏览器执行唯一通道 = 宿主 handler 契约**（现 simulateHandler；本 ADR 增
  fixtures 通道），kernel 保持引擎无关；
- **wasm 化出局（非延后）**：runtime 搬浏览器 ⇒ 多租户需要重新设计 ⇒ 那是
  另一个工件，不入 zen-udf 1.0 范围。executor 契约保证将来任何本地引擎只是
  「又一个 executor 实现」，本 ADR 无需为它预留任何结构。

## 决策

### 1 · executor 反转

runner 只认识执行器，不认识 runtime：

```ts
/** 执行器契约：跨端交换物，入 CONTRACT.md 测试侧 */
export type DecisionTestExecutor = (
  fixture: DecisionFixture,          // 整夹具传入：适配器才能兑现 asOf/journal 回放
  index: number,
) => Promise<{
  result?: unknown;
  error?: string;
  durationMs?: number;
  traceHits?: string[];              // 命中节点（ADR-013 §3 矩阵列）
}>;

export async function runDecisionTests(options: {
  executor: DecisionTestExecutor;    // ← 代替 runtime + key + model
  fixtures: DecisionFixture[];
  concurrency?: number;              // 默认 1——act 类算子有副作用，并发是显式选择
  onProgress?: (r: FixtureResult, index: number, total: number) => void;
  tenantId?: string;
}): Promise<FixtureReport>;

/** 服务端便利适配器（runtime 世界一行接入；内部强制 __fixtures__: 键命名空间） */
export const createRuntimeExecutor = (
  runtime: DecisionRuntime,
  options: { key: string; model: string | object; rev?: string },
): DecisionTestExecutor;
```

runner 职责收敛为：迭代/并发、断言匹配、报告装配、进度回调。执行、租户、
回放、追踪全部留在 executor 侧。

### 2 · `expect` 可选化（smoke 语义）

`expect?: Expectation`——缺省即 smoke：`passed = 执行无异常`。这是
ADR-013 `NamedExample` 与 `DecisionFixture` 的桥：示例天然是 smoke 用例，
将来逐个「毕业」为断言用例（NamedExample 增期望字段属 envelope v2 议题，
两端形状不断裂）。

### 3 · 报告增强（全 additive，旧消费者零破坏）

```ts
export interface FixtureResult {
  name: string;
  passed: boolean;                   // 保留（聚合值 passed/failed 不动）
  outcome: 'passed' | 'assertion-failed' | 'execution-error';  // 新增
  actual?: unknown;
  error?: string;
  durationMs?: number;               // 新增：矩阵列
  traceHits?: string[];              // 新增：命中节点列
}
```

### 4 · expression 断言（可序列化）

新增 `{mode:'expression', source}`——zen-expression 对结果求值（仓内同款
DSL，`evaluateExpressionSync` 已在用），跨端可序列化。`predicate` 降级为
进程内便利糖，文档标注**不入序列化契约**。

### 5 · 契约立法

fixtures 形状是跨仓交换物（verdict 存库、seal-editor 消费）——入 CONTRACT.md
**测试侧一节**，对齐 CONTRACT §8 / ADR-013 信封的 `contractVersion` 纪律
（开放问题 2）。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. executor 反转（本 ADR） | 字面复用；执行语义单源由宿主侧保证；报告矩阵就位 | zen-udf 签名形态变更（0.x 破坏许可内） |
| B. 维持 runtime 直依 + kernel 侧形状兼容重写 runner | zen-udf 零改动 | 「勿新写 runner」背反；双 runner 语义漂移；报告增强无处落 |
| C. 本地 wasm runtime 进浏览器 | 离线/零延迟 | 多租户需重新设计（定位边界公理）——**出局** |

## 实施清单（分归属）

| # | 项 | 归属 | 量级 |
| --- | --- | --- | --- |
| 1 | executor 契约 + options 形态 + createRuntimeExecutor（键隔离）+ smoke/outcome/durationMs/traceHits + onProgress/concurrency + expression 断言 | jdm-editor（zen-udf 0.13.0） | ~1.5 天 |
| 2 | CONTRACT.md 测试侧一节（executor/fixture/report 形状 + contractVersion） | jdm-editor | ~0.25 天 |
| 3 | Run all UI + `fixturesRunner` 槽位（kernel 保持零 zen-udf 依赖） | seal-editor kernel（ADR-013 批次三 M1） | ~0.5 天 |
| 4 | zen-udf 依赖 + 参考适配器（simulateHandler→executor：图快照闭包 + Simulation.trace→traceHits）注入槽位 | seal-editor appshell | ~0.5 天 |
| 5 | demo-server `/v1/fixtures/execute` 迁移 createRuntimeExecutor（字面同款验证） | seal-editor demo-server | ~0.25 天 |

## 开放问题（逐条协商）

1. **旧形态处置**：`(runtime, optionsWithModel)` 0.13.0 直接替换还是双轨
   deprecated？建议**直接替换**（0.x 破坏许可内，消费方仅 demo-server/verdict
   两处，迁移机械）；
2. **FixtureReport 契约版本**：夹具文档存库/跨端时是否带 `contractVersion`？
   建议加（对齐 CONTRACT §8——verdict 登记页是第一个存库消费者）；
3. **expression 断言求值上下文**：仅 `result` 根绑定，还是暴露 `fixture.input`？
   建议仅 result（输入上下文属 v2）；
4. **traceHits 归属**：executor 上报（建议）还是 runner 从结果提取？建议
   executor——runtime 适配器有 trace 数据面，浏览器适配器可从 `Simulation.trace`
   提取，语义各自对齐；
5. **`onProgress` 与并发**：并发 >1 时 onProgress 顺序不保证——可接受？
   建议可接受（progress 携带 index）。

## 后果

- 正面：runDecisionTests 字面复用达成且 kernel 零 zen-udf 依赖；结果矩阵
  （结论/耗时/命中节点）三列就位（ADR-013 §3）；服务端/浏览器/mock executor
  同语义；predicate 序列化债务清偿；宿主 L1 缓存免于夹具污染（键隔离）；
- 约束：zen-udf 0.13.0 一次小版本承载签名形态变更；appshell 新增 zen-udf
  依赖（集成层归属）；执行语义单源原则不变（默认通道仍是宿主服务端执行）；
- 边界公理：zen-udf 服务端定位 + wasm 出局（宿主裁定 2026-10-01）——将来
  浏览器本地引擎 = 新工件 + 多租户重设计，不经由、也不预留于本 ADR。
