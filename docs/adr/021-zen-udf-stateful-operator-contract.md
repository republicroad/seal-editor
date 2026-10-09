# ADR-021：zen-udf 状态算子契约——时间档位、保真披露、幂等与算子改名

## 状态

proposed（2026-10-09 立项——verdict 侧起草 + 上游预评审通过后由本仓**立项
转移**（评审注记随文，R1-R4 已吸收进正文）。**立项先行理由**：verdict-005 §6
预留引用挂点等待本 ADR proposed 落档（互等死锁的解法 = 区分「立项」与
「accepted」）。

- **门序剩余**：verdict-005/006 用户落章后进入实施；zen-udf **1.4.0 候选**（纯增量）；
- 消费面立法：verdict-005（trailing 语义/双档实现族/回放策略）、verdict-006
  （时序契约/特征绑定）——本 ADR 是其内核机制面投影；
- 特性规划：[velocity-udf-plan](../design/velocity-udf-plan.md) §11（两正交轴
  切分与 VEL 合流点）。

## 背景

### 已有资产

1. **端口层已立法**（[ADR-012](./012-zen-udf-ports-layered-design.md)）：机制/策略
   分界——端口由宿主组合根注入，per-tenant 决策由端口实现内部作出；
2. **RateStore 契约已存在**：`rate(entity, windowMs, asOf?)` +
   `groupDistinct(...)`，结果 `{counter, v, idle, timestamp}`（源自宿主
   HAProxy 生产接口同构）；InMemoryRateStore 参考实现 + rate-store-conformance
   套件（注入时钟，含 asOf point-in-time 断言；
   [ADR-018](./018-zen-udf-conformance-suite-export.md) 出口 zen-udf@1.3.0）；
3. **conformance 即接入许可**已有立法与出口（ADR-018）；
4. **租户面既有模式**：端口签名无显式 tenantId，实现内部经 ExecContext
   构造期捕获（[ADR-002](./002-zen-udf-tenant-isolation.md)），数据键内含租户；
5. **宿主消费面已立法**（verdict-005/006）：trailing 语义、双档实现族
   （memory/haproxy/redis）、回放三策略、精度披露、`RATE_NO_EVENT_TIME` 处理
   ——本 ADR 把宿主单方声明升格为内核强制。

### 问题（未立法的空白）

| # | 空白 | 后果 |
| --- | --- | --- |
| P1 | **时间档位无声明**——processing 实现收到 asOf 可静默返回当前值 | 回测/影子出静默错数（verdict 侧已以策略面兜，内核无强制） |
| P2 | **近似度无披露**——桶近似/双桶插值的读数差异无契约表达 | 同一算子跨实现对比产生"语义噪音 diff"；等价性判定无 ε 口径依据 |
| P3 | **有状态调用无幂等纪律**——超时/重试（breaker 半开探测、HTTP 重试）双计 | 风控计数双计 = 误杀；HAProxy "GET 即计数"场景实测在案 |
| P4 | **算子名与语义错位**——`rate_1h` 返回计数非速率；trailing 语义不载名 | 目录语义可读性差；verdict-005 §1.1 已立法新名 |

## 备选方案

### P1 时间档位

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 仅文档约定（实现"应该"声明） | 零代码 | 无强制，静默错数依旧 |
| **B. UdfTool 声明 + 运行时强制（决策）** | 声明进 tool spec（`temporal: 'event' \| 'processing'`），运行时在 replay 执行路径检查：processing + asOf → 按宿主策略（strict→`RATE_NO_EVENT_TIME` 结构化错误 / degraded→trace 标注） | 契约面 +1 字段；执行路径 +1 分支 |

### P2 保真披露

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 不披露（全按精确语义消费） | 零成本 | 插值/桶实现与精确实现永远"不等价" |
| **B. `fidelity` 声明（决策）**：`'exact-per-event' \| 'bucketed' \| 'interpolated'`，进 trace 与目录 | ε 口径有依据；宿主影子对比可裁 | 声明面 +1 |

> 命名裁定（评审 R1）：~~`windowSemantics`~~ **改名 `fidelity`**——velocity
> 规划 §1.1 的 `windowType`（sliding/calendar/session）已先占「窗口语义」轴
> （窗的形状），本字段的三个值实为**保真/精度轴**（聚合的实现保真度，velocity
> §1.2 重放保真轴的声明面投影）。两正交轴不得共用字面。

### P3 幂等

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 全部有状态调用禁自动重试 | 简单粗暴 | 误伤幂等实现（SET 形态重试无害）；对 INCR 形态则本来就会双计，禁令收益趋零 |
| **B. `stateful: true` 声明 + 禁重试缺省 + 幂等键单源（决策）** | 声明显式化；存储级幂等作为可选增强 | 端口签名可选扩展 |

### P4 改名

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 立即改名 | 序列干净 | **炸存量图**（`{$call: 'rate_1h'}` 按名解析） |
| **B. 双名注册过渡（决策）**：新名注册 + 旧名 alias 同函数 + deprecated 元数据 + 目录弃用徽标；过渡期后按 ADR-009 治理退役 | 存量图永久可读（ADR-015 双读先例） | 注册表双条目过渡期 |

## 决策

### §1 · 第一批（与宿主 verdict-005 对齐的最小闭环）

1. **UdfTool 契约扩展**：`temporal?: 'event' | 'processing'`（缺省 event）+
   `stateful?: boolean`（缺省 false；true = 禁自动重试）+
   `fidelity?: 'exact-per-event' | 'bucketed' | 'interpolated'`（缺省
   exact-per-event；评审 R1 改名）；
2. **replay 路径强制**：ExecContext 带 `replay.asOf` 时，processing 工具按
   宿主注入策略执行（端口 `ReplayPolicy: 'strict' | 'degraded'`，缺省
   degraded + trace `temporal-fallback` 标）；新增结构化错误码
   `RATE_NO_EVENT_TIME`；
3. **幂等键单源（评审 R4）**：有状态调用的幂等键以 **ExecContext.requestId
   贯穿**为立法形态（与 ADR-002 构造期捕获同构——键不散到每个工具面）；
   velocity 的 eventId 幂等（PG 唯一约束 + Redis SETNX）消费同一 requestId
   通道；tool 级参数覆盖不做（防双键并行去重漂移）；
4. **conformance 分级**：rate-store-conformance 套件分 `exact`（现套件——
   asOf 断言已在——**新增重试双计向量**）/ `approximate`（同向量 + ε 容差 +
   单调性豁免声明）两档；实现按通过档位获许可（live-only / live+replay）；
5. **改名（P4 方案 B）**：

| 现名 | 新名 |
| --- | --- |
| `rate_1m/5m/1h/1d/7d` | `trailing_count_<window>` |
| `group_distinct_1m/5m/1h/1d/7d` | `trailing_distinct_<window>` |
| namespace `rate-window` | `trailing-window` |

   双名注册过渡；CONTRACT.md 补状态算子章（时间档位/保真/幂等/命名通式
   `trailing_<agg>_<window>`，`rolling` 一词禁用——Flink/pandas 语境相反）；
   **实施前置**：verdict 盘点生产存量图对旧名的按名引用数（定目录弃用徽标
   过渡期长度）。

### §1.5 · 两层校验时刻的编排（评审 R2）

本 ADR 的 runtime 强制与 velocity 机制契约的 deploy-time 校验是**互补的两层
时刻**，非二选一、非重复立法：

| 时刻 | 校验 | 载体 |
| --- | --- | --- |
| **deploy-time** | 图调用的静态能力匹配（store capabilities vs 图参数：windowType/窗口长度/保真要求/replay 视界）——不匹配 deploy 期失败 | velocity `VelocityStoreCapabilities`（velocity-udf-plan §2） |
| **runtime** | replay 路径事件时间策略（processing + asOf → strict 错误 / degraded 标注）+ stateful 禁重试 | 本 ADR §1.1/§1.2 契约字段 |

velocityPack 是本契约的第一批消费者（velocity-udf-plan §11.3 合流点）。

### §2 · 第二批（宿主需求就绪后）

5. 窗口拓扑 deploy-time 声明（`windows: []` 白名单 + 运行时校验）；
6. 键派生规则立法（`{tenant}:{node}:{entity}`）+ 基数等级 + 溢出策略声明；
7. 失败语义钩子（`onStoreError: 'fail-open' | 'fail-closed'`）+ breaker 按
   存储作用域隔离；
8. 时钟单源（内核不直读挂钟；asOf 钳制：未来事件时间报错）；
9. **特征引用与在途算子可互换声明**（宿主 verdict-006 §5 需求——同一节点
   声明、engine-native/http-platform 两种物化）。

## 实施清单

| # | 项 | 归属 | 量级 |
| --- | --- | --- | --- |
| 1 | UdfTool 三字段契约 + replay 路径强制 + RATE_NO_EVENT_TIME | zen-udf | ~0.5 天 |
| 2 | conformance exact/approximate 分档 + **重试双计向量**（asOf 断言已在套件） | zen-udf | ~0.5 天 |
| 3 | 双名注册 + deprecated 元数据 + 目录徽标（前置：verdict 存量图旧名引用盘点） | zen-udf | ~0.25 天 |
| 4 | CONTRACT.md 状态算子章 + 命名通式 + 禁用词表 | seal-editor | ~0.25 天 |
| 5 | verdict 侧：HaProxyRateStore 声明 interpolated + 目录重导出 | verdict | 随 verdict-005 清单 |

## 开放问题

- OQ1：`temporal`/`fidelity`/`stateful` 进 tool spec 还是 pack 级（同 pack
  同档是常态，pack 级更省）——随实施定；
- OQ2（评审 R3 收窄）：~~ε 具体数值口径~~ → **fidelity 目录声明与
  provenance 结果自报不一致时的仲裁**——ε 的结果侧载体已由 velocity
  `VelocityProvenance.relErrorBound` 承载（目录静态声明 vs 结果动态自证两层
  对齐）；仲裁建议：以结果 provenance 为准并告警。

## 后果

- **正面**：静默错数关死（内核强制）；跨实现对比的 ε 口径成立（声明 + 自报
  两层）；重试双计有立法且幂等键单源；算子名与语义同源（业务可读）；
- **约束**：契约面 +3 字段（MAY 全部可省，存量工具零改动）；改名双条目过渡
  期维护；幂等键贯穿要求 ExecContext.requestId 在宿主调用链赋值（缺省缺失败
  语义随实施定）；
- **后续条件**：verdict-005/006 落章后实施；**实施前置 = verdict 存量图旧名
  引用盘点**；第二批随宿主实施需求逐项启动。

## 评审注记（seal-editor / zen-udf 上游侧预评审，2026-10-09，转移自 verdict 草案）

> 按 ADR-000 §3 工作流在提交前先做上游预评审——四个空白（P1-P4）真实成立，
> 备选方案裁定全部成立（B/C/D 否决论据与决策依据均核查通过）。本转移版已将
> 精化 R1-R4 吸收进正文（fidelity 改名 / §1.5 两层时刻 / OQ2 收窄 / §1.3
> 幂等键单源），注记保留作裁定留痕。

### 事实核查（四条）

1. **ADR-018 出口**：zen-udf@1.3.0 `./conformance` 子路径在位 ✓；
2. **RateStore 签名**：`rate(entity, windowMs, asOf?)` 无显式 tenantId——
   租户隔离在实现内部经 ExecContext 构造期捕获（ADR-002），数据键内含租户；
   本 ADR §2.6 键派生 `{tenant}:{node}:{entity}` 与实现口径一致 ✓；
3. ⚠️（已修正）**「新增 asOf 向量」不成立**：现套件已含 asOf point-in-time
   断言；exact 档的实际新增项 = **重试双计向量**——实施清单 #2 已按此修正；
4. ⚠️ **改名影响面未盘点**：verdict 生产存量图对 `rate_1h`/`group_distinct_1h`
   的按名引用数需在实施前盘点（后续条件已纳入）。

### 精化（四条，已吸收）

| # | 精化 | 理由 |
| --- | --- | --- |
| R1 | `windowSemantics` 改名 `fidelity`——velocity `windowType`（窗口语义轴）先占字面，两正交轴防混淆 | 命名冲突 |
| R2 | deploy-time capabilities 校验 + runtime replay 强制的两层时刻编排成节（§1.5） | 编排清晰 |
| R3 | OQ2 收窄为「声明与自报不一致仲裁」——ε 结果侧载体 = velocity provenance | 消除双口径 |
| R4 | 幂等键单源：ExecContext.requestId 贯穿立法，tool 级覆盖不做 | 幂等单源 |

### 裁定汇总

**草案方向上游预评审通过；R1-R4 吸收后立项转移至本序列（proposed）。**
实施门序：verdict-005/006 落章 → zen-udf 1.4.0 实施 → verdict 消费
（velocity-udf-plan §11.3 合流点：velocityPack 为第一批消费者）。
