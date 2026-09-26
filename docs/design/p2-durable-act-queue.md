# P2 设计稿：durable act 队列——act 类异步副作用的 journal 待执行投影

- 日期: 2026-09-25
- 状态: **设计中（proposal）**——开放决策点见 §7；本稿为 `docs/design/` 活跃文档，
  裁决后按 taxonomy 进入实施
- 前置阅读: `zen-udf-multi-tenant.md`（L0–L3 分层）、`../bp/semantic-triad-effect-isolation.md`
  （BP-04 语义三元）、`../bp/cache-ownership-pattern.md`（BP-05 端口归属模式）

## 0. 问题陈述

当前 act 类 UDF 在 `evaluateAsync` 调用栈内**内联执行**：act 函数直接产生真实世界
副作用（拦截账户、发送通知），并把返回值快照写入审计 journal（Y2/Y3）。这条链路在
两个断点上会丢失副作用：

1. **进程崩溃窗口**：引擎已裁定"应当处置"（决策结论含 act 意图）但副作用尚未完成
   （或下游异步任务未落地）时进程死亡——审计事件说"已处置"，现实世界没有。
2. **审计持久化与副作用无原子性**：audit 落库与 act 副作用是两个独立 IO，任何一侧
   失败都产生"决策已记录、世界未改变"或反状的漂移，且**无对账依据**。

P2 的目标：为 act 副作用提供 **journal 驱动的待执行投影（durable queue）**，把
"决策结论"与"真实世界效果"解耦为两个可各自恢复的阶段，并以 decisionId 幂等
（Z1 既有契约）收敛重复投递。

非目标：exactly-once 投递（不设此目标，见 §7-D23）；同步实时性（act 走 durable
模式后为最终一致，延迟 = 队列排空周期）；query/observe 类（语义不变）。

## 1. 现状地基（零新造轮子盘点）

| 既有机制 | 位置 | 对 P2 的贡献 |
| --- | --- | --- |
| 语义三元 query/observe/act | `register.ts` Y1（`UdfSemantics`） | durable 模式的分界线：只有 act 需要 |
| act 幂等声明 + 警告 | `register.ts` Z1（`idempotent !== true` → warning "dedup relies on decisionId at the sink"） | 投递去重的契约原文已经写明——P2 把"靠 sink"变成"runtime 提供 sink 契约 + 参考实现" |
| 审计 journal | `engine.ts` `DecisionAuditEvent.observed[]`（key/name/semantics/outcome/micros/idempotent） | 意图记录的权威来源：act 的入参哈希与 outcome（intent 占位）都在 |
| 确定性回放 | `engine.ts` `evaluateReplay` Y3（observe/act 读 journal fail-closed，`REPLAY_JOURNAL_MISS`） | 回放读的 journal 是**决策结论**轴；P2 队列是**真实效果**轴——两轴分离是本设计的关键区分（§3） |
| 影子评估 | AA1（act 影子侧返回 intent 占位，绝不双次处置） | durable 模式的 act 函数签名与影子侧同构：`intent` 返回值约定直接复用 |
| 端口模式 | BP-03/BP-05（RateStore 等：机制在仓、策略在宿主 + conformance 契约测试） | `DurableActQueue` 端口照此办理 |

## 2. 核心设计：intent / effect 两阶段

act 工具可声明 `durable: true`（per-tool opt-in，§7-D22）。durable act 在
`evaluateAsync` 内**不执行真实副作用函数**，而是：

```
引擎裁定 act 调用（key/name/args）
  → runtime 捕获为 ActIntent { decisionId, tenantId, key, name, args, argsHash, seq }
  → outcome = intent 占位（与 AA1 影子侧同构，标记 mode: 'durable'）
  → journal 照常记录（observed[] 含 intent）
  → runtime 将 ActIntent 投入 DurableActQueue 端口（host 实现）
```

worker（宿主进程内或独立消费进程）从队列取 intent → 调用真实 act 函数 →
成功后 ack。投递语义 **at-least-once**：真实函数必须以
`${decisionId}:${key}:${name}:${seq}` 为幂等键去重（Z1 契约的落地形态）。

**两轴模型**（对齐 §0 的两个断点）：

- **决策结论轴** = 审计 journal（已存在）：决策是否发生、结论是什么。回放机制服务此轴。
- **真实效果轴** = durable 队列（本设计）：副作用是否投递、是否被 ack。对账任务服务此轴。
- 不变式：每个 durable ActIntent 恰好属于一个审计事件；审计事件里每个 durable act
  调用必须能在队列中找到对应条目（**完整性可对账**，见 §5）。

## 3. 与既有机制的交互

| 机制 | 交互 |
| --- | --- |
| 确定性回放（Y3） | durable act 的 journal outcome 是 intent 占位——回放读回 intent，语义自洽（回放的是"决策曾裁定此处置"，不是"副作用已重演"）；队列不受回放影响 |
| 影子评估（AA1） | 影子侧 durable act 产生 intent 但**不入队**（影子不产生真实效果，与现状"不双次处置"一致）；审计影子事件照常携带 intent 供对比 |
| L1 决策缓存（BP-05） | 缓存的是编译产物，无交互；但同模型重复执行的决策结论进缓存命中路径——durable intent 在每次 evaluate 时都会产生，**重放同输入 = 二次入队**，由 sink 幂等键收敛（文档必须明示） |
| RateStore 等端口 | 无交互；`DurableActQueue` 是第 6 个端口，归属裁决见 §7-D21 |
| OTel/metrics sink | 新事件 kind：`durable`（enqueue/ack/dead-letter/depth），沿既有 metricsSink 契约 |

## 4. 端口与参考实现

```ts
/** P2 端口：机制在本仓（接口 + 内存参考实现 + conformance），策略在宿主（生产队列） */
export interface DurableActQueue {
  enqueue(intent: ActIntent): Promise<void>;
  /** worker 拉取；visibilityTimeout 内未 ack 自动重新可见（at-least-once） */
  claim(workerId: string, visibilityTimeoutMs: number): Promise<ActIntent | null>;
  ack(workerId: string, intent: ActIntent): Promise<void>;
  /** 超过 maxAttempts 进入死信；宿主告警消费 */
  deadLetter(intent: ActIntent, lastError: string): Promise<void>;
  /** 对账：某租户/全局的未 ack 深度与最老条目年龄 */
  stats(tenantId?: string): Promise<{ pending: number; oldestAgeMs: number; deadLettered: number }>;
}

export interface ActIntent {
  decisionId: string;   // 幂等键前半（Z1）
  tenantId: string;
  key: string;          // 模型 key
  rev: string;
  name: string;         // UDF 全名 namespace.name
  seq: number;          // 同一决策内第几次 act 调用（同决策同名多次调用去重）
  args: unknown;        // 已序列化校验过的入参（parametersSchema 校验后）
  argsHash: string;     // sha256(args)——对账与审计互查
  enqueuedAt: string;
  attempts: number;
}
```

- **参考实现**：`InMemoryDurableActQueue`（开发态 + conformance 载体），语义对齐
  Redis Streams / PG `SELECT ... FOR UPDATE SKIP LOCKED` 的宿主实现形态。
- **conformance**（BP-03）：`durable-act-queue-conformance.ts`——可见性超时重投、
  ack 幂等、死信迁移、stats 准确性。宿主实现（verdict 的 PG/Redis 队列）必须跑绿
  同一套件才可接入。
- worker 参考实现：`createDurableActWorker({ runtime, queue, actResolver, maxAttempts, pollIntervalMs })`
  ——claim → 解析 act 函数 → `runWithExecContext({ tenantId, decisionId, deliveryAttempt })`
  执行 → ack / 重试 / 死信。`deliveryAttempt > 1` 时以结构化告警提示 sink 去重。

## 5. 故障矩阵与对账

| 故障窗口 | 后果 | 恢复 |
| --- | --- | --- |
| intent 入队前崩溃（evaluate 中段） | 决策中断，无审计事件、无队列条目——**调用方超时可见**，无静默丢失 | 调用方重试 = 新 decisionId 新决策（幂等键未污染） |
| 审计事件已持久化、入队未持久化（两 IO 非原子） | 决策结论含 act intent 但队列无条目——**静默丢失**，本设计唯一危险窗口 | 对账任务（§6）以审计为主表左连队列，缺口告警 + 人工/自动补投；根治要求宿主把两者放进同一事务（§7-D24） |
| worker 执行中崩溃 | visibilityTimeout 到期重新可见，at-least-once 重投 | sink 幂等键去重 |
| ack 前崩溃（副作用已完成） | 重投一次，sink 去重吸收 | 同上 |
| 持续失败 | maxAttempts 后死信 | 宿主死信消费（告警 + 人工处置面板） |

**对账任务**（宿主定时任务，参考实现提供查询口）：以审计持久层为主表，对所有
含 durable intent 的审计事件左连队列 ack 记录——`pending > visibilityWindow` 或
"有 intent 无条目"即为异常，输出结构化差异报告。

## 6. 验收标准（切片）

| 切片 | 交付 | 验收 |
| --- | --- | --- |
| P2.1 | `DurableActQueue` 端口 + `ActIntent` + InMemory 参考实现 + conformance 套件 | conformance 全绿；接口评审过（宿主） |
| P2.2 | runtime 集成：`durable: true` 工具走 intent 路径；影子侧不入队；journal outcome 标记 `mode:'durable'` | 既有 450+ 测试零回归；新增单测覆盖三语义 × durable 交叉矩阵 |
| P2.3 | worker 参考实现 + 重投/死信/对账查询口 | 故障矩阵逐行有测试（注入故障模拟崩溃点） |
| P2.4 | demo-server 接线（PG/SQLite outbox 表 + worker）+ playground Trust Chain 增加"durable 待执行/死信"视图 | e2e 探针：durable act 决策 → 队列 → 执行 → ack 全链可见 |
| P2.5 | `docs/host-functions-guide.md` durable 章节 + 本稿状态回写 shipped | 文档死链检查过 |

## 7. 开放决策点（宿主裁决）

- **D21 队列实现归属**：建议按 velocity/ip2region 先例——**生产队列归 verdict 实现**
  （PG/Redis 基建依赖），zen-udf 交付端口 + 内存参考实现 + conformance（机制/基建
  分界同 D9/D13 裁决）。反方观点：outbox 表模式与审计持久层同库同事务（§5 根治项），
  由 verdict 做才能保证原子性——支持归属 verdict。
- **D22 默认模式**：act 内联执行保持缺省（不破坏既有 packs）；`durable: true` 逐工具
  opt-in。是否需要 deployment 级"全部 act 强制 durable"开关？建议暂不做（YAGNI，
  需要时宿主在 register 层包装）。
- **D23 投递语义**：at-least-once + 幂等 sink（业界 outbox 标准解）。exactly-once
  不承诺、不设计。
- **D24 原子性要求强度**：审计持久化 + 入队是否强制同事务（宿主义务写入
  host-functions-guide 的"必守约定"）？建议**强制**——否则 §5 的静默丢失窗口只能靠
  对账兜底。
- **D25 seq 语义**：同决策内多次调用同名 act（循环内）以 `seq` 区分；sink 幂等键是否
  需要 argsHash 参与以防重试时 args 变化？建议幂等键 = `decisionId:name:seq`，
  argsHash 仅入对账——args 变化属模型/输入 bug，不应被幂等层掩盖。

## 8. 明确不做

- durable 观测类（observe 语义本就允许丢弃，无真实效果）
- 跨决策的事务编排（saga/workflow——超出决策引擎边界，属工作流引擎职责）
- 队列的持久化存储选型（宿主侧事务，见 D21）
