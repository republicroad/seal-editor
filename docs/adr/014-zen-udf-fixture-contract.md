# ADR-014：zen-udf 测试夹具契约——executor 反转、smoke 语义与报告增强

## 状态
proposed（2026-10-01 seal-editor 起草——zen-udf 单一源与发布方在 jdm-editor 仓
（ruling 12），目标版本 **0.13.0**，旧形态 1.0 移除）→ reviewed（2026-10-01
jdm-editor 评审：定位公理 + 决策 §1-§5 全部接受，开放问题 1-5 全部同意，
评审注记见文末）→ **accepted（2026-10-01 seal-editor 调整落档，协商环闭合）**：
§4 附 A.4 蓝图 bug 依评审修正（expression 求值器上下文 `{ result: data }`），
实施清单增补 #6（jdm demo-server fixtures-route 迁移，归属 jdm-editor 仓）。
执行时序：#1/#2（zen-udf 0.13.0 + CONTRACT 测试侧）归属 jdm-editor，待宿主
口令启动；#3-#5（seal 侧批次三 M1'）随之。**增补 §6 同步面预案（2026-10-01
宿主提议）待 jdm 表态**——仅立名位与边界，不阻塞实施。→ **implemented
（2026-10-01 jdm-editor 侧 #1/#2/#6 完成：1a30cbbf + release 05f48335，
zen-udf@0.13.0 已受理发布）**：executor 反转 + createRuntimeExecutor
（`__fixtures__:` 键隔离 + promise memo + trace 显开供 traceHits）+ smoke/
outcome 三分/durationMs/traceHits + expression 断言（评审修正形态
`evaluateExpressionSync(source, { result: data })` 落地）+ CONTRACT.md §10
测试契约（contractVersion 落存库信封层，OQ2 精确化）+ #6 jdm demo-server
fixtures-route 迁移；验收=zen-udf 1078 全绿（存量两测迁移 + smoke/expression/
outcome 三分/键隔离/onProgress 九用例，含宿主键不被覆盖断言）+ demo-server
12/12。**§6 同步面预案：jdm 表态=接受（名位与边界照案）**，两点精化记录：
①sync 通道的真实可达性受本仓分发器链路约束——UDF handler/limiter/breaker/
端口皆异步，sync 面要求「全同步链路」（sync handler + 无异步策略），边界
声明宜精确到分发器层而非仅执行器层；②名位入 CONTRACT §10 的时机=随 sync
面实施批（本 ADR 立法零变更确认）。0.13.0 已按预案只落异步面。#3-#5（seal
侧批次三 M1'）随本版实施。

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

### 6 · 同步面预案（增补提案，2026-10-01 宿主提议；待 jdm 表态）

宿主提议：zen-engine 支持同步与异步方法，zen-udf 可考虑同时提供。binding
直读后的事实边界——

- **表达式层**：sync/async 双形态已存在且 zen-udf 已在用（`evaluateExpressionSync`
  即 §4/附 A.4 求值器的实现）——此层无需新增；
- **决策求值层**（夹具 runner 的世界）：`@gorules/zen-engine` 2.1.0（napi，
  zen-udf 唯一依赖的绑定）`Sync` 导出仅三个——`evaluateExpressionSync` /
  `evaluateUnaryExpressionSync` / `renderTemplateSync`；**决策求值仅 Promise**
  （`ZenDecision.evaluate` / `ZenEngine.evaluate` / `evaluateBatch`）——同步
  runner 今天没有挂点，需上游先暴露决策级 `evaluateSync`（超出 zen-udf 一侧
  能力）；
- 勘误随此记录：`zen-engine-wasm` 0.23.1 仅含表达式引擎与校验器（无
  ZenEngine/ZenDecision 面），本仓此前「完整引擎的 wasm 编译」表述不准确；
  浏览器全图执行另属 gorules 独立工件，不在两仓任何依赖内——定位公理
  （wasm 出局）因此更稳固。

**预案（上游条件达成后纯增量落地，异步契约零改动、本 ADR 立法零变更）**：

| 新增 | 形态 | 边界 |
| --- | --- | --- |
| `runDecisionTestsSync(options)` | 同签名的同步变体（匹配/报告核心为纯函数，天然可同步） | **无异步 handler 的执行子集**——http/异步算子夹具在 sync 通道显式 `execution-error` |
| `DecisionTestExecutorSync` | `(fixture, index) => {result?, error?, durationMs?, traceHits?}` | 同步 executor 不许抛 Promise |
| `createRuntimeExecutorSync` | 挂上游决策级 `evaluateSync`（待其存在） | 复用 `__fixtures__:` 键隔离 |

立名动机：1.0 端口面冻结前定名，避免 1.0 后加名的表面断裂；本节仅预留名位
与边界，**不阻塞 #1-#6 实施**。jdm 可在 0.13.0 中先只落异步面（本 ADR 主
体），同步面随上游能力另批落地。

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
| ~~5~~ | **勘误（批次三实施核查，2026-10-01）：seal 侧 demo-server 从无 fixtures 路由**（评审「两仓各有」仅 jdm 侧成立）——seal 侧无 createRuntimeExecutor 消费点，#6 为唯一迁移项 | — | — |
| 6 | jdm 仓 demo-server `apps/demo-server/src/fixtures-route.ts` 迁移 createRuntimeExecutor（签名 `Parameters<typeof runDecisionTests>[0]` 随形态变更）——评审补充发现 2 增补 | jdm-editor | ~0.25 天 |

验收口径（评审补充发现 5）：现 fixtures.test.ts 套件迁移新形态全绿 + jdm/seal
两侧 demo-server 字面同款验证 + 新增四组用例（smoke 语义 / expression 断言 /
outcome 三分 / `__fixtures__:` 键隔离——最后一条以「宿主键不被覆盖」断言）。

## 开放问题（逐条协商）

1. **旧形态处置**：`(runtime, optionsWithModel)` 0.13.0 直接替换还是双轨
   deprecated？建议**直接替换**（0.x 破坏许可内，消费方仅 demo-server/verdict
   两处，迁移机械）；
2. **FixtureReport 契约版本** → **已裁定（jdm 同意 + 精确化落点）**：版本落在
   **存库的信封层**（verdict 登记页存的夹具文档）；运行时 `FixtureReport`
   返回值不携带——其形状随包版本走，加版本无升级语义；
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

## 包面注记（2026-10-02，verdict 浏览器消费发现）——runner 子路径导出提案

verdict 升级 appshell 1.23 后 **web 构建（rolldown）失败**，暴露一个包形态
问题（与本 ADR 决策无关，executor 反转本身是对的）：

- **现象**：appshell `import { runDecisionTests } from "@republicroad/zen-udf"`
  走的是根包——根 index 首行 `import "./reference.ts"` 是副作用导入（参考域
  注册）+ engine.ts 全量再导出，服务端 @gorules/zen-engine 2.1.0 被拖进浏览器
  包。其 browser 构建缺 native 导出面（`ZenDecisionContent` 等 MISSING_EXPORT，
  4 处）且平台可选包 `zen-engine-wasm32-wasi` 被 bun 按宿主平台跳过 → 解析失败。
- **边界澄清**：依赖**成立**——executor 反转后 runner 零引擎语义依赖，浏览器
  消费（appshell Run all，执行经 simulateHandler 适配器回宿主服务端）是本 ADR
  明示的合法形态，且不触犯「zen-udf 服务端定位」公理（执行仍回宿主）。
  **包形态不成立**——根包副作用链让"只想要 runner"的导入无法不携带服务端树。
- **提案（zen-udf 侧，一次发版两件事）**：
  1. **runner 子路径导出**：`@republicroad/zen-udf/runner`（内容 = fixtures.ts
     单文件，零引擎 import）；appshell 改一行 `from "@republicroad/zen-udf/runner"`；
  2. ** fixtures.ts 去掉仅存的引擎 import**：首行
     `import { evaluateExpressionSync } from '@gorules/zen-engine'` 只作缺省
     expression 求值器（runner 内 line 254）——改为「未注入求值器 = 断言
     不通过」（与 ADR-014 注入纪律一致，去掉引擎兜底），runner 文件即真
     零依赖，可直接进浏览器包。
- **verdict 临时解**（垫片，拆除条件 = 子路径导出发布）：vite 正则精确别名
  `@republicroad/zen-udf` → runner 面垫片（只 re-export fixtures.ts）+
  `@gorules/zen-engine` → 浏览器桩（未注入求值器按不通过处理）。appshell 与
  verdict 代码均已在此形态下验证（web build + 运行时全绿）。

## 附 A · fixtures.ts 修改蓝图（实现级）

> 现文件 140 行（Y7）。改造四步：契约类型 → runner 重写 → createRuntimeExecutor
> 新增 → 表达式求值器注入。执行/租户/回放/追踪全部从 runner 迁出到适配器，
> runner 保持零引擎导入（浏览器可移植的前提）。

### A.1 契约类型（替换/新增）

```ts
export type Expectation =
  | { mode: 'deep'; value: unknown }
  | { mode: 'path'; path: string; value: unknown }
  | { mode: 'expression'; source: string }                       // 新增：可序列化
  | { mode: 'predicate'; test: (result: unknown) => boolean };   // 保留：进程内糖，不入序列化契约

export interface DecisionFixture {
  name: string;
  input: unknown;
  asOf?: string;
  journal?: ReplayJournalEntry[];
  expect?: Expectation;                                          // 必填 → 可选（smoke）
}

export type FixtureOutcome = 'passed' | 'assertion-failed' | 'execution-error';

export interface FixtureResult {
  name: string;
  passed: boolean;                                               // 保留（聚合向后兼容）
  outcome: FixtureOutcome;                                       // 新增
  actual?: unknown;
  error?: string;
  durationMs?: number;                                           // 新增
  traceHits?: string[];                                          // 新增
}

export interface FixtureReport { passed: number; failed: number; results: FixtureResult[]; }

/** 执行器契约（CONTRACT.md 测试侧）：一段「给定夹具，产出一次执行结果」的能力 */
export type DecisionTestExecutor = (
  fixture: DecisionFixture,
  index: number,
) => Promise<{
  result?: unknown;
  error?: string;
  durationMs?: number;
  traceHits?: string[];
}>;

/** expression 断言求值器（注入——runner 保持零引擎依赖；Node 世界用 A.4 工厂） */
export type ExpressionEvaluator = (source: string, data: unknown) => boolean;

export interface RunDecisionTestsOptions {
  executor: DecisionTestExecutor;
  fixtures: DecisionFixture[];
  concurrency?: number;            // 默认 1——act 类算子副作用，并发是显式选择
  onProgress?: (result: FixtureResult, index: number, total: number) => void;
  expressionEvaluator?: ExpressionEvaluator;   // 缺省遇 expression 断言 → assertion-failed
  // tenantId/rev 移除：执行关切，归 createRuntimeExecutor（见 A.3）
}
```

### A.2 runner 重写（核心循环——零引擎导入）

```ts
export async function runDecisionTests(options: RunDecisionTestsOptions): Promise<FixtureReport> {
  const { executor, fixtures, concurrency = 1, onProgress, expressionEvaluator } = options;
  const results: FixtureResult[] = new Array(fixtures.length);
  let cursor = 0;

  const runNext = async (): Promise<void> => {
    while (cursor < fixtures.length) {
      const index = cursor++;
      const fixture = fixtures[index];
      const startedAt = Date.now();
      let execution: Awaited<ReturnType<DecisionTestExecutor>>;
      try {
        execution = await executor(fixture, index);
      } catch (e) {
        execution = { error: e instanceof Error ? e.message : String(e) };
      }
      const durationMs = execution.durationMs ?? Date.now() - startedAt;

      let result: FixtureResult;
      if (execution.error) {
        result = { name: fixture.name, passed: false, outcome: 'execution-error',
                   error: execution.error, durationMs, traceHits: execution.traceHits };
      } else if (fixture.expect) {
        const passed = matches(execution.result, fixture.expect, expressionEvaluator);
        result = { name: fixture.name, passed, outcome: passed ? 'passed' : 'assertion-failed',
                   actual: execution.result,
                   ...(passed ? {} : { error: 'expectation mismatch' }),
                   durationMs, traceHits: execution.traceHits };
      } else {
        result = { name: fixture.name, passed: true, outcome: 'passed',
                   actual: execution.result, durationMs, traceHits: execution.traceHits };
      }

      results[index] = result;
      onProgress?.(result, index, fixtures.length);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, runNext));

  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

// matches() 增分支：expression → evaluator 存在则 try{evaluator(source,result)}
// （抛错=断言失败，error 注明 expression evaluation failed），缺省=断言失败；
// deep/path 分支与现实现逐字保留。
```

### A.3 createRuntimeExecutor（新增——现 runDecisionTests 的执行侧原样迁入）

```ts
const FIXTURE_KEY_PREFIX = '__fixtures__:';

export const createRuntimeExecutor = (
  runtime: DecisionRuntime,
  options: { key: string; model: string | object; rev?: string; tenantId?: string },
): DecisionTestExecutor => {
  const tenantId = options.tenantId ?? 'fixtures';
  const rev = options.rev ?? 'latest';
  const cacheKey = `${FIXTURE_KEY_PREFIX}${options.key}`;   // 键隔离：不碰宿主服务键空间
  let registered = false;

  const ensureRegistered = async () => {                    // 惰性登记：首次执行才落缓存
    if (registered) return;
    await runWithExecContext({ tenantId }, async () => {
      try {
        runtime.createDecisionWithCacheKey(cacheKey, options.model, rev);
      } catch {
        runtime.updateDecisionWithCacheKey(cacheKey, options.model, rev);
      }
    });
    registered = true;
  };

  return async (fixture) => {
    await ensureRegistered();
    const startedAt = Date.now();
    const execCtx = {
      tenantId,
      decisionId: `fixture:${fixture.name}`,
      ...(fixture.asOf ? { eventTime: fixture.asOf } : {}),
      ...(fixture.journal
        ? { replay: { decisionId: `fixture:${fixture.name}`,
                      asOf: fixture.asOf ?? new Date().toISOString(), journal: fixture.journal } }
        : {}),
    };
    const outcome = await runWithExecContext(execCtx, () =>
      runtime.evaluateAsync(cacheKey, fixture.input, undefined, rev));
    return {
      result: outcome.result,
      durationMs: Date.now() - startedAt,
      traceHits: extractTraceHitIds(outcome),   // 从 evaluateAsync 的 trace 数据面取命中节点 id
    };
  };
};

/** Node 世界便利工厂（@gorules/zen-engine 的 evaluateExpression 封装）。
 *  依 jdm 评审 §4 修正（2026-10-01）：input 传对象非 JSON 字符串；上下文按
 *  开放问题 3 裁定为 `{ result: data }` 根绑定。 */
export const createZenExpressionEvaluator = (): ExpressionEvaluator =>
  (source, data) => evaluateExpressionSync(source, { result: data }) !== false;
```

要点：现实现第 97-101 行的登记与 103-132 行的逐夹具 ExecContext/journal/replay
逻辑**逐字迁入**适配器，仅三处变化——键加 `__fixtures__:` 前缀（隔离修复）、
登记惰性化（不再无谓落缓存）、trace 命中提取。

### A.4 消费方迁移（各一行）

```ts
// 旧
await runDecisionTests(runtime, { key, model, fixtures, tenantId, rev });
// 新
await runDecisionTests({
  executor: createRuntimeExecutor(runtime, { key, model, tenantId, rev }),
  fixtures,
  expressionEvaluator: createZenExpressionEvaluator(),   // 夹具含 expression 断言时
});
```

demo-server `/v1/fixtures/execute` 与 verdict 登记页同款迁移（约 5 行/处）；
seal-appshell 参考适配器（批次三 M1'）则以 simulateHandler 构造 executor：
`simulation.error → {error}`、`simulation.result.result → {result}`、
`Object.keys(simulation.result.trace) → traceHits`——zen-udf 零浏览器代码。

## 评审注记（jdm-editor 仓——zen-udf 源仓，2026-10-01）

> **落档**：以上裁定已于 2026-10-01 并入正文——状态转 accepted；§4 附 A.4
> 求值器 bug 依裁定修正（`{ result: data }` 上下文）；实施清单增 #6；
> 开放问题 2 记录落点精确化。协商环闭合。

### 事实核查（四缺陷全部属实；一处行数勘误；一处消费面勘误）

1. **执行器耦合——属实**：`runDecisionTests(runtime, options)` 馂参即
   DecisionRuntime（fixtures.ts:88）；
2. **expect 必填 + predicate 不可序列化——属实**：`expect: Expectation`
   为必填字段（:30），predicate 携带函数体（:27）；
3. **报告太薄——属实**：FixtureResult 仅 {name, passed, actual?, error?}；
4. **隔离缺陷——属实且比陈述更具体**：fixtures.ts:96-102 将模型登记在
   **用户传入的 key** 上（共享 runtime）——同键替换宿主在服务的模型缓存 +
   污染 ADR-003 归宿主所有的 L1 决策缓存；跑完还驻留缓存不逐出；
5. 行数勘误：现文件 139 行（ADR 写 140，无关紧要）；
6. **消费面勘误（实施清单须补）**：demo-server 两仓各有——jdm-editor
   `apps/demo-server/src/fixtures-route.ts`（registerFixturesRoute，签名
   `Parameters<typeof runDecisionTests>[0]` 即 runtime）**不在实施清单**，
   迁移归属 jdm-editor 仓（随 0.13.0 同批）；清单 #5 的 seal demo-server
   迁移保留。

### 逐节裁定

| 节 | 裁定 |
| --- | --- |
| 定位边界公理 | **接受**（宿主 2026-10-01 已裁；与本仓端口层/服务端多租户定位/审计免 trace 化立场一致。wasm 出局=新工件多租户重设计的划界，防止了 1.0 范围膨胀） |
| §1 executor 反转 | **接受**。实现注记三条：①`ensureRegistered` 闭包 boolean 在并发首跑可双重登记（try/catch 幂等兜底无害，建议 promise memo 一行）；②`model` 形态与现实现对齐（object = 图 content）；③index.ts 类型导出面同步（`RunDecisionTestsOptionsWithModel` → `RunDecisionTestsOptions` 等随签名变更重排） |
| §2 expect 可选化（smoke） | **接受**——NamedExample↔DecisionFixture 的桥成立，「smoke 起步、逐个毕业为断言」的演进路径与 ADR-011 conformance 同构 |
| §3 报告增强 | **接受**（additive、passed 保留向后兼容、outcome 枚举三分正确——断言失败与执行错误分家是结果矩阵可读性的关键） |
| §4 expression 断言 | **接受方向，附 A.4 蓝图 bug 修正一处（实施时必改）**：`createZenExpressionEvaluator` 现稿 `evaluateExpressionSync(source, JSON.stringify(data ?? {}))` 两处错——①input 须传**对象**非 JSON 字符串（回归语料 runner 同款 API 用法为证）；②按开放问题 3 的裁定（仅 result 根绑定），上下文应为 `{ result: data }`。**正确形态：`evaluateExpressionSync(source, { result: data }) !== false`**。predicate 降级进程内糖、文档标注不入序列化契约——正确，序列化债务就此清偿 |
| §5 契约立法 | **接受**——executor/fixture/report 形状随 0.13.0 同版入 CONTRACT.md 测试侧（清单 #2），契约先行纪律与 ADR-012 #0 同款 |

### 开放问题表态（1-5）

1. **直接替换——同意**（0.x 破坏许可内；消费方三处：jdm demo-server、
   verdict 登记页、seal demo-server，迁移均机械，A.4 各约 5 行）；
2. **加 contractVersion——同意，精确化落点**：版本落在**存库的信封层**
   （verdict 登记页存的夹具文档），运行时 `FixtureReport` 返回值不携带
   （其形状随包版本走，加版本无升级语义）；
3. **仅 result 根绑定——同意**（输入上下文暴露属 v2；夹具的 input 本就
   在 fixture 上，断言引用它属罕见需求）；
4. **traceHits 归 executor——同意**（runtime 侧 `Object.keys(result.trace)`、
   浏览器侧 `Simulation.trace` keys，各自语义对齐）；
5. **并发下 onProgress 乱序可接受——同意**（progress 携带 index）。

### 补充发现（五条）

1. **0.13.0 编号可用性确认**：dt months 对齐已裁随 1.0.0 发版，0.13.0 空闲——
   本提案可用；且 fixtures 契约在 1.0 端口面冻结前落位，时序正确（契约先冻结）；
2. **jdm demo-server 迁移补清单**（事实核查 6）：实施清单增 #6——
   `apps/demo-server/src/fixtures-route.ts` 迁移 createRuntimeExecutor，
   归属 jdm-editor，~0.25 天，随 #1 同批发版验证；
3. **隔离修复的价值加成**：`__fixtures__:` 键隔离顺带消除「夹具模型永久驻留
   L1 缓存」的内存驻留问题——可选增强：适配器跑完 evict（或依赖 LRU 自然
   淘汰，注记即可，不强求）；
4. **traceHits 与审计免 trace 化不冲突**：runtime 适配器取命中节点需
   `trace: true`（evaluateAsync 透传）——夹具是低频测试面，与生产热路径的
   审计免 trace 化（auditJournalRegistry，cbbbd347）互不干扰；此处 trace
   开销是测试语义的一部分；
5. **验收口径**：现 fixtures.test.ts 套件迁移新形态全绿 + jdm/seal 两侧
   demo-server 字面同款验证 + 新增四组用例（smoke 语义/expression 断言/
   outcome 三分/`__fixtures__:` 键隔离——最后一条以「宿主键不被覆盖」断言）。

**裁定汇总：全部接受（§4 附一处必改），实施清单增补 #6 后即可开工——
#1/#2（zen-udf 0.13.0 + CONTRACT 测试侧）归属 jdm-editor，待宿主口令启动。**
