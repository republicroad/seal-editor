# velocity 自定义函数规划（verdict 侧实现 · 本仓只定机制契约）

- 日期: 2026-09-26（v2：吸收宿主设计裁定——窗口语义 / 重放保真 / 性能档位 / 场景驱动四轴）
- 修订: 2026-10-09（v2.1：§0 现状核实刷新；§2 签名对齐上游 RateStore 模式
  （ExecContext 构造期捕获，去显式 tenantId）；新增 §11 与 ADR-021 草案的
  关系节（两正交轴命名切分/两层校验时刻/§11.4 ADR 立项时点与 §2 契约迁移约定）
- 性质: **规划文档** —— [handoff-verdict-integration.md](./handoff-verdict-integration.md) §5 第 3 步（velocity + fraud/kyc 首批 UDF packs）的展开；承接后转 verdict 仓执行
- 裁决基线（2026-09-17，宿主裁决）: velocity **转移到 saas/verdict 侧实现**，对照本仓
  `contrib/rate-window.ts` 的 RateStore 接口细节落地，**稳定后再开源回流；本仓不实现**
  （见 [development-roadmap.md](./development-roadmap.md) WS2 P1 行，04dd1ba3）
- 分界原则（宿主 2026-09-26 重申）: **seal-editor/zen-udf 只实现机制接口；窗口语义、
  重放策略、存储与计算档位全部是服务端（verdict）策略**。本文档 §2 只定义契约，
  §3 的档位表是 verdict 的选型参考，不是契约内容

## 0. 现状核实（2026-10-09 刷新；首版 2026-09-26）

| 侧 | 事实 |
| --- | --- |
| seal-editor 仓 | 参照物就绪：zen-udf 单一源（jdm-editor 仓；2026-09-28 ruling 12 后移出本仓，本仓经 npm 消费）的 `packages/zen-udf/src/contrib/rate-window.ts`（RateStore 端口 + InMemoryRateStore + `rate_1h`/`group_distinct_1h` 工具）与 `rate-store-conformance.ts`（注入时钟 + asOf 点算契约测试）。**zen-udf 现版 1.3.0**（1.0.0 调用契约冻结 → 1.1.0 参数值信封 → 1.2.0 具名双读 → 1.3.0 conformance 套件包外导出 ADR-018），velocity 不在其中 |
| verdict 仓 | ~~零代码~~ **已起步**：batch 17 落 RateStore 注入 + 熔断器 + zen-udf 指标入 api_logs（InMemoryRateStore 过上游 conformance）；消费 seal-editor 1.33.0 / seal-appshell 1.37.0 / zen-udf 1.3.0；velocity 本体与 fraudPack 仍未启动。`docs/udf-operators.md` T1–T5 纯函数体系已实现（T1 清零 + T2 cn-validation），velocity（有状态）独立架构位的定位不变 |
| verdict 生产栈 | ECS 2C4G 八容器（postgres×2 / api / web / site / nginx / openobserve / vector）——**仍无 Redis**。状态存储前置 = Redis 引入（VEL-0，与 handoff §1 四端口 Redis 化同船） |
| 机制面进程 | ADR-021 草案（状态算子契约：时间档位/保真披露/幂等/改名）verdict 侧拟稿、上游预评审通过（见 §11）——待 verdict-005/006 落章后提交 seal-editor 序列 |

## 1. 语义定义：velocity = 多事件 × 多窗口语义 × 多精度的滑窗聚合

业务上对应风控 velocity check：同一实体在时间窗内跨事件类型的活跃度聚合。
rate-window 是它的单事件退化情形（单 kind、count/distinct、固定 1h 滑窗）：

| 维度 | rate-window（zen-udf 上游已有） | velocity（本规划） |
| --- | --- | --- |
| 事件类型 | 隐含单一（rate/groupDistinct 各自固定） | 显式 `kind`（login/pay/bind_card/withdraw/…） |
| 聚合 | count / distinct / idle | count / distinct / sum / max / idle（金额类） |
| 窗口长度 | 工具内固定 1h | `window` 参数化（校验上下限） |
| **窗口语义** | 仅滑动 | **`windowType` 参数：滑动 / 自然（日历对齐）**，见下 |
| 数值载荷 | 无 | 可选 `amount` |
| **精度** | 精确 | **精确或近似（概率型结构）**，结果必须携带 provenance，见 §2 |
| 事件时间 | ExecContext.eventTime / replay.asOf 点算 | 同语义，照搬 `rate-window.ts` 的 `resolveAsOfMs` |

### 1.1 窗口语义轴（滑动 vs 自然）——按特征逐个选，不是全局选

- **自然窗口（calendar / tumbling，对齐墙钟）**："今日""本月"。合规/额度类规则的天然语义
  （日限额 5000 元 = 自然日，午夜清零是业务要求）。实现最廉价：日历桶进键的单计数器。
  缺点是边界突刺（边界前后两笔相邻事件各记一个窗）。
- **滑动窗口（rolling，last N）**：行为 velocity 的天然语义（任意 10 分钟内 10 笔）。
  无边界突刺；实现贵一档（ZSET 明细或桶计数近似）。
- **会话窗口（session，间隙切分）**：行为突发检测用，**v1 不做**，契约枚举留位。

两类语义在风控实践里共存（合规限额用自然窗、行为检测用滑动窗），因此 `windowType`
必须进契约参数；实现侧每种语义对应不同存储形态（§3）。

### 1.2 重放保真轴——"随时重放"与"高性能"是两档不同的宿主成本

- **随时精确重放**（任意 asOf 点算）⇒ 宿主必须**保留事件明细**（有界视界内的 append-only
  事件流），聚合一律读时计算或由明细重导。
- **近似重放** ⇒ **分桶概率型结构**保点算能力：每 Δ 桶一份 sketch（HLL/CMS/t-digest），
  点算 = 归并 asOf 之前的桶。**单个可变 sketch 不可点算**（PFADD 后时间戳即丢失）——
  这是概率结构方案能否支撑 asOf 回放的分水岭。
- **不重放** ⇒ 可变计数器/单 sketch，最便宜。
契约不规定保真档位，但 store 必须**声明**它做到哪档（§2 capabilities），审计与图作者
据此决策。asOf 语义本身照抄 rate-window：点算只对"数据仍在实现保真视界内"有效。

### 1.3 范围边界

velocity 是**有界视界**的有状态算子——超出实现声明的保真视界即不可见，不做 journal、
不承诺无限历史回溯。durable 化（事件持久化/投影）属 P2 议题，受北之星冻结约束，本规划
不展开。跨实体图特征（device↔card↔ip 关联 velocity）是业界 vendor 的下一站，同样不在 v1。

## 2. 机制契约（本仓/接口层——只定契约，不含策略）

对照 RateStore 端口模式（机制契约 + 参考实现 + conformance），verdict 侧新建：

```ts
interface VelocityEvent {
  kind: string;            // 事件类型（login/pay/…）
  entity: string;          // 实体（userId/deviceId/cardNo/ip/phone）
  value?: string;          // 可选观测值（device id → distinct 用）
  amount?: number;         // 可选数值（金额 → sum/max 用）
  at: number;              // epoch ms（缺省取 asOf/处理时间）
}

interface VelocityProvenance {
  windowType: 'sliding' | 'calendar' | 'session';
  exact: boolean;          // false = 概率型结构估计值
  structure?: 'hll' | 'cms' | 'bucket-counter' | …;  // exact=false 时必填
  relErrorBound?: number;  // 近似时声明的相对误差界（如 HLL ≈ 0.016）
  asOf?: number;           // 点算锚点（回放审计用）
}

interface VelocityStats {
  count: number;
  distinct?: number;
  sum?: number;
  max?: number;
  idle: number;            // 距上次事件秒数
  lastAt: string;          // ISO
  truncated?: boolean;     // 触达 per-window 事件上限（VD5）
  provenance: VelocityProvenance;   // 结果必须自证精度——审计依赖
}

interface VelocityStore {
  record(ev: VelocityEvent, opts: { windowMs: number; windowType: WindowType }, asOf?): Promise<VelocityStats>;
  stats(entity: string, kinds: string[], opts: { windowMs: number; windowType: WindowType }, asOf?): Promise<Record<string, VelocityStats>>;
}
```

> **v2.1 签名对齐（上游评审 M2）**：去显式 tenantId 参数——上游 RateStore
> 模式为端口签名无租户、实现内部经 ExecContext 构造期捕获（ADR-002）取租户
> 入数据键；VelocityStore 同构（§8 多租户纪律不变：键内含租户、禁 per-tenant
> 注册）。

**能力声明与部署期校验**（机制，不是策略）：

```ts
interface VelocityStoreCapabilities {
  windowTypes: WindowType[];        // 实现支持的窗口语义
  maxWindowMs: number;              // 如 30d
  exact: boolean;                   // 是否全程精确
  replayHorizonMs: number | null;   // asOf 点算保真视界；null = 不可重放
  perWindowEventCap: number;        // 截断上限（VD5）
}
```

- 图保存/部署时校验图内 velocity 调用 vs capabilities，**不匹配在 deploy 期失败**
  （如 store 声明 `replayHorizonMs: null` 而图开启 replay 校验、或用了不支持的
  windowType），而不是运行期才炸——对齐 `packChecks` 的"契约即测试"取向
- provenance 恒在结果里：近似结果**必须**可被判别（决策分支与审计都要能区分
  "精确 3 次"与"3 ± 1.6%"）
- 多租户纪律不变：tenantId 必入数据键；禁止 per-tenant 注册（handoff §2）

## 3. 策略档位（verdict 侧选型参考——场景决定档位，档位可随 capabilities 平滑升级）

| 档 | 形态 | 精度/重放 | 成本 | 适用场景 |
| --- | --- | --- | --- | --- |
| T0 | InMemory（参考实现，随 conformance 交付） | 精确、单实例 | 零 | 开发/单测/simulator |
| T1 | Redis ZSET 事件明细 + 读时聚合（pipeline：ZREMRANGEBYSCORE + ZRANGE） | 精确、asOf 可点算（视界=窗口+余量） | O(窗内事件) 读 | 支付风控 inline 检查、硬限额（金额必须精确） |
| T1' | Redis 日历桶计数器（桶进键 + EXPIRE，自然窗专用） | 精确 | O(1) | 合规日/月限额——最廉价形态，v1 与 T1 同做 |
| T2 | 分桶近似：桶计数器加权插值（Cloudflare 式滑窗计数）/ 分桶 HLL（distinct）/ CMS（频次） | 近似（声明误差界）、**分桶可点算归并** | O(1)-O(桶数)/键 | 营销反滥用、超大基数实体（爬虫 ip）、distinct at scale |
| T3 | 流式预聚合（Flink/Kafka Streams 级，增量维护长窗聚合） | 精确或近似、低延迟读 | 需流式基建 | 30d+ 长窗、极高 QPS——v1 不做，架构留位 |
| T4 | 原始事件流冷存（append-only + 离线重算，落地形态见 §3.1） | 精确、任意重放（有界保留期） | 冷存储 | 调查取证、回测、模型再训练——audit 需求出现时引入 |

场景 → 档位示例：支付 inline（P99 <100ms + 金额精确）→ T1；日限额 → T1'；
券防刷 distinct 设备 → T2（HLL）；case 调查回测 → T4。**同一契约、同一工具面**，
verdict 按 capabilities 声明逐档演进，图不改。

### 3.1 明细留存选型（T4 落地形态，2026-09-26 增补——审计要明细，SoR 用已部署的 PG）

- **SoR = PostgreSQL 16 RANGE 分区表**（verdict 既有栈：`executionLog` 审计已在 PG、
  pg_dump sidecar 14 份滚动 + 月度锚点备份直接复用）：
  - `velocity_event` 按 `event_time` 月分区；**保留期 = `DROP PARTITION`**（瞬时生效、
    无 DELETE 膨胀/autovacuum 压力——与宿主机脚本 TTL 清理 executionLog 的做法相比，
    分区下清理是 O(1) 且可审计的）
  - 索引：b-tree `(tenant_id, entity, kind, event_time)`（case 调查点查）+
    BRIN `(event_time)`（asOf 重算的时间范围扫描；append-only 下 BRIN 极小）
  - 写入：api 请求生命周期内同步 INSERT（种子量级足够；失败不阻断决策，计数进
    metricsSink + 告警，与 §5 失败率阈值共用告警面）
- **观测镜像 = 既有 ADR-0004 管道**（NDJSON → Vector → OpenObserve）：明细检索/排障面，
  **不作审计 SoR**（单副本日志存储语义、无逐行精确重算保障）
- **一致性定位**：明细表是 source of truth，Redis 窗口（T1/T1'）是**可重建投影**——
  审计重放以明细重算为准；两写分歧时以明细值覆盖窗口值（回放口径唯一）。
  **金额累加以 eventId 幂等**（明细表唯一约束为锚，Redis 侧 SETNX 去重），
  at-least-once 投递不放大 sum
- **不现在引入**：ClickHouse/QuestDB（2C4G 上新状态服务 + 新备份面）、TimescaleDB
  扩展（vanilla 分区已够）、parquet/duckdb 冷档（回测量级起来后作为导出格式，非在线库）。
  量级参考：PG 分区表舒适区到数亿行/数百 GB；种子期事件量（个位数~数十 events/s）
  半年累计 GB 级，远未触顶——换档由 capabilities 隔离保护，无契约破坏
- **防篡改（轻量，VD10）**：应用层 append-only 纪律 + 每日一行锚点（分区行数 + 内容
  校验和）写锚点表；WORM/独立审计库留给合规硬要求出现时再升级

## 4. UDF 工具面

```ts
// velocityPack（归属见 VD1）——三件套缺一不可（host-functions-guide §1–§5）
velocity.record(kind, entity, value?, amount?, window?, windowType?)  // semantics: 'observe'——副作用可 asOf 回放
velocity.stats(entity, kinds?, window?, windowType?)                  // 只读，跨 kind 一次取全
```

- `parametersSchema`/`returnsSchema` 全量声明（编辑器表单 + resultValidation 共用）；
  `window`/`windowType` 为尾参（位置形态"尾部追加"约定，host-functions-guide §2.1）
- 错误码：不抛异常；`INVALID_PARAM`（空 entity/kind、window 越界、windowType 不在
  capabilities 内）、存储故障 `UDF_ERROR` + message；内建 `UDF_TIMEOUT`/`CIRCUIT_OPEN` 免费搭乘
- 重 I/O 纪律：`call.signal`/`deadlineAt` 传 ioredis commandTimeout；事件时间锚点
  照搬 rate-window `resolveAsOfMs`

## 5. conformance 套件（verdict 侧新建，回流时随行）

对照本仓 `rate-store-conformance.ts`（工厂注入时钟、任何实现同套跑绿），分两个 profile：

**exact profile**（T0/T1/T1' 必跑）：

| 类别 | 断言 |
| --- | --- |
| 基础 | 首次 count=1、递增、kind 间独立、实体间独立 |
| 滑窗 | 窗口滑出重置、idle=距上次秒数、EXPIRE 后无键泄漏 |
| **自然窗** | 日历边界两侧计数独立、跨边界不清窗地累积相邻窗、午夜对齐 |
| asOf | 事件时间锚点使窗口平移（对齐 rate-store-conformance 既有断言形状） |
| distinct | 值去重累计、值滑出后 uv 回落、跨 kind 值独立 |
| amount | sum/max 聚合精度（金额用整数分或定点断言） |
| 上限 | 触达 per-window 事件上限 → truncated 标记（VD5） |
| 租户 | 两租户同 entity/kind 并发，计数互不可见 |
| provenance | exact 实现 results.provenance.exact === true |

**approximate profile**（T2 跑；exact 断言换成**capabilities 声明的误差带**）：

| 类别 | 断言 |
| --- | --- |
| 误差带 | 全部聚合在 `relErrorBound` 内（HLL distinct 合成向量：真值 vs 估计 ≤ 界） |
| **点算可归并性** | 分桶结构对 asOf 前桶归并结果 = 截断流水的对应聚合（近似重放的核心不变量） |
| provenance | exact === false 且 structure/relErrorBound 必填 |

**capabilities 一致性**：实现自报的 `exact`/`replayHorizonMs`/`windowTypes` 与实测行为
一致（声明不可重放的实现点算断言跳过而非放宽）。

## 6. 编辑器侧影响（seal-editor / seal-appshell）

**零 kernel 改动**：velocity 工具经既有 host functions 机制由 schema 驱动自动出现在函数目录与
节点面板。核对项（不需要动代码，冒烟即可）：

- 嵌套 object 返回（`Record<kind, VelocityStats>`）与 provenance 块在节点面板、run strip、
  trace 明细的展示正常（近似/精确徽标可读）
- 三模调用形态（数组/命名/legacy `;;`）等价；`window`/`windowType` 尾参在位置↔命名互转保序
- simulator 离线跑图走 T0 InMemory 态（会话内一致即可，不承诺跨会话）
- **部署期校验的编辑器呈现**：图用到 store 不支持的 windowType/超窗时，保存期给出
  可读错误（机制来自 §2 capabilities 校验，编辑器只做展示）

## 7. 实施切片（verdict 侧排期建议）

与 verdict roadmap Phase L（备案/上线）/ Phase Q 并行可做，不阻塞上线主链。

| 片 | 内容 | 依赖 |
| --- | --- | --- |
| VEL-0 | Redis 容器引入（compose + maxmemory 2C4G 预算 + healthcheck；与四端口共享实例、键前缀隔离） | — |
| VEL-1 | 机制契约落地：VelocityStore + capabilities + provenance + InMemory 参考实现 + exact/自然窗 conformance（纯测试，无 Redis 依赖，先行） | — |
| VEL-2 | Redis T1（滑窗 ZSET）+ T1'（日历桶计数器）过 conformance | VEL-0 VEL-1 |
| VEL-3 | velocityPack（record/stats）+ `packChecks` + 部署期 capabilities 校验 + model-execute 注册 + metricsSink 观察 | VEL-2 |
| VEL-4 | 编辑器目录核对（§6 清单）+ fraud 示例模型（含一条自然窗限额规则 + 一条滑窗行为规则） | VEL-3 |
| VEL-5 | 生产浸泡 1–2 周 → T2 近似档评估（流量数据说话）与**开源回流提案**（VD6/VD8，宿主裁决后执行）。**回流提案启动 = 立 seal-editor ADR 的触发点**（§11.4：含 §2 机制契约迁移，规划文档届时归档不失立法） | VEL-3 上线 |

## 8. 决策点（待宿主裁决）

| # | 问题 | 建议 |
| --- | --- | --- |
| VD1 | pack 归属：独立 `velocityPack` vs 并入 `fraudPack`（handoff §3 示例） | **独立 velocityPack**——原始定位即"风控/营销/支付共用底座" |
| VD2 | 窗口长度面：`window` 参数化 vs 预设工具族 `velocity_5m/1h/24h`（对齐 `rate_1h` 风格） | **参数化 + 上下限校验**（1min–30d）；`rate_1h` 是旧平台字段重建的特例，velocity 无历史包袱 |
| VD3 | v1 聚合范围：count/distinct/idle 首发，sum/max 是否同版 | sum/max 与 count 同版——金额聚合是 velocity 相对 rate-window 的核心增量 |
| VD4 | distinct 实现：per-value ZSET（精确、键多） vs 分桶 HLL（近似、可归并） | v1 先 per-value ZSET（精确）；T2 分桶 HLL 作为规模化档位，靠 capabilities 平滑升级 |
| VD5 | 事件上限语义：超限截断 + `truncated` 标记 vs 拒绝记录返回错误 | **截断 + 标记**——observe 语义下拒绝记录会让风控图在攻击峰值失效（恰是最需要它的时刻） |
| VD6 | 回流形态：并入 zen-udf `contrib/velocity.ts` vs 独立 `@republicroad/velocity` 包；`rate_1h`/`group_distinct_1h` 存量如何共存 | 并入 contrib、与 rate-window 共存不删；conformance 一并归还，本仓 rate-store-conformance 不动。**回流即立法时点：立 seal-editor 序列 ADR（或 ADR-021 增补 §），本文档 §2 机制契约条文随之迁移入 ADR/CONTRACT 正文**（规划文档 shipped 即归档，契约不得居住其中） |
| VD7 | v1 窗口语义范围：仅滑动（贴 rate-window 先例） vs 滑动+自然双语义 | **双语义同版**——日限额是 day-one 风控场景，T1' 日历桶实现成本极低；语义轴进契约后加参数是破坏面，一次定齐 |
| VD8 | 档位路线：v1 只做 T0/T1/T1'，T2（近似）/T4（冷存重放）何时立项 | v1 = T0/T1/T1'；T2 待 VEL-5 浸泡数据；T4 待真实 audit/回测需求——都靠 capabilities 声明接入，无契约破坏 |
| VD9 | 近似结果的可观测性：provenance 恒在结果 vs 仅近似时携带 | **恒在**（exact: true 也要回显 windowType/asOf）——审计对称性要求"精确"也是被声明的属性而非缺省 |
| VD10 | 明细保留期与防篡改等级：保留期默认值；锚点哈希是否随 v1 引入 | 保留期默认 **180 天**（月分区 DROP，可配）；v1 只做 append-only 纪律 + 每日锚点行（§3.1），WORM/独立审计库等合规硬要求出现再升级 |
| VD11 | 硬限额路径：合同性日/月限额是否提供**事务档**（PG 条件累加 `WHERE used + :amt <= :limit` + 幂等键，拒绝即结构化错误，如 `velocity.enforce`） vs 只做信号档（Redis T1' 计数器） | v1 只做信号档（record/stats）；事务档单列立项——金融实践：硬限额属账务面，最终一致的 Redis 计数不承载合同语义（§9 金融核心行） |

## 9. 业界参照（2026-09-26 查证）

**先声明覆盖面：没有任何单一系统覆盖本规划的全部四轴**（聚合面 × 窗口语义 ×
精度/重放 × 决策流契约）。下列参照各自覆盖若干格，业界完整实现一律是**拼装**；
参照的价值是"每一格的标杆做法"，不是可整体照抄的模板。

| 参照 | 覆盖的格 | 明显不覆盖 |
| --- | --- | --- |
| **AWS Fraud Detector**：变量分 raw / aggregate，aggregate 由托管侧基于 SendEvent 事件明细在预设 rolling window 上持续计算（COUNT/SUM per entity），规则/模型直接引用——"明细留存 + 托管滚动聚合 + 消费闭环"整格（[Variables 文档](https://docs.aws.amazon.com/frauddetector/latest/ug/variables.html)、[ATO 博文](https://aws.amazon.com/blogs/machine-learning/prevent-account-takeover-at-login-with-the-new-account-takeover-insights-model-in-amazon-fraud-detector/)） | 托管聚合 + 事件明细留存 + 规则/模型消费闭环 | **无自然窗**（仅滚动预设档）、**无 distinct**、**无 asOf 点算**、精度黑箱（结果不回显 exact/approx）；且 2025-11-07 起不再接新客户——托管整包路线本身在退场 |
| **Cloudflare**：固定窗计数器 + 前窗加权插值近似滑窗，O(1)/键、实测偏差 ~0.003%，分布式计数器同步是另一核心贡献（[Counting Things: A Lot of Different Things](https://blog.cloudflare.com/counting-things-a-lot)） | "预聚合近似滑窗计数"单格的标杆 | **只有 count**（无 distinct/sum/idle/多 kind）、**无明细无重放**（计数器的意义就是不存时间戳）、是限流基建不是特征契约，无 schema/审计面 |
| **流式计算（Flink/Kafka Streams 一系）** | 窗口语义最全：滑动/tumbling(自然)/session、增量聚合、exactly-once、watermark 乱序处理 | 是基建不是契约：特征定义、精度声明、点算正确性、消费面全部自建 |
| **特征存储（Feast/Tecton 一系）**：特征管道三分 batch/streaming/on-demand，**point-in-time correctness 是一等契约**（[Databricks: What is a Feature Store](https://www.databricks.com/blog/what-is-a-feature-store)） | 契约/档位/点算正确性这一格——§2 的 asOf 与 capabilities 即此思想的决策流投影 | velocity 的滑窗计算本身仍靠 Flink/Redis 在底下拼装；面向 ML 特征而非决策流算子契约 |
| **velocity 规则实践**（如 [Didit: Velocity Rules Developer Guide](https://didit.me/velocity-rules)） | 算子面共识：count/sum/distinct × 滑窗用于 structuring/mule 检测 | 实践指南，无论证工程形态 |
| **金融核心/支付限额**（银行核心、支付系统日/月限额的通行形态）：`(账户, 日期)` 主键计数行 + **原子条件累加**（`UPDATE limits SET used = used + :amt WHERE … AND used + :amt <= :limit`，一条语句完成检查+累加防丢失更新）+ 幂等键表 + 日切重置（自然窗=合同/监管语义） | **硬限额一格（自然窗+金额）的金融标准形态**：金额累加从不近似、从不最终一致——它是账务的一部分 | 不做滑窗行为特征、不做近似——那是风控特征平台的职责；两条路径在金融实践中从不混存 |
| **流式特征平台**（蚂蚁/腾讯/Stripe 一系与 Tecton/Feast 范式，[Tecton 实时反欺诈 workshop](https://www.tecton.ai)、[Chip Huyen: Real-time ML](https://readpipe.org)）：Flink 级流作业增量维护滑窗聚合 → 物化到在线 KV（Redis/DynamoDB）→ 决策引擎 O(1) 点查；distinct 流内 HLL 近似；离线链路从数仓重算保 point-in-time | **行为特征一格（滑窗+count/distinct/sum）的规模化形态**——即本规划 T3 档 | 基建重（流平台 + 双链路），种子期不引入；2C4G 阶段以 T1/T1' 近似其服务面 |
| **传统规则引擎 CEP**（Drools `window:time` 工作记忆 + `@expires` 事件过期、[IBM ODM Decision Server Insights](https://princetonblue.com/demystified-ibm-odm-advanced-decision-server-insights-dsi) 的事件溯源实体状态——事件入库、重放重建 + 快照） | "引擎自身持有窗口状态"的历史形态；DSI 把状态当事件溯源资产是罕见例外 | 内存态的审计/重放弱——现代实践一致选择把状态外置（金融限额路径/特征平台路径），引擎只做无状态求值；本规划的 store 端口外置与此一致 |

## 10. 验收清单

- [ ] exact profile conformance：T0/T1/T1' 同套跑绿（§5 矩阵全项，含自然窗与 asOf）
- [ ] approximate profile（若 v1 后引入 T2）：误差带 + 点算可归并性 + provenance 断言绿
- [ ] velocityPack 过 `packChecks`；部署期 capabilities 校验生效（不匹配在 deploy 期失败）
- [ ] model-execute 闭环：execute → trace（UDF 粒度耗时/错误码 + provenance 入 traceData）→ Prometheus 指标可见
- [ ] 多租户走查：tenantId 入键、无 per-tenant 注册、图内容无凭证
- [ ] seal-editor 函数目录可见可配、嵌套返回与 provenance 展示正常、三模调用等价（§6 清单）
- [ ] Redis 键泄漏检查：窗口滑出 + EXPIRE 后无残留
- [ ] VEL-5 浸泡后回流提案归档，VD6/VD8 形态经宿主裁决

## 11. 与 ADR-021 草案的关系（2026-10-09 增补，上游预评审后）

verdict 侧已拟 ADR-021 草案（状态算子契约：时间档位/保真披露/幂等/算子改名，
`verdict/docs/drafts/upstream-adr021-draft…md`，上游预评审通过待宿主落章）。
本规划与其是**同一问题的两份投影**，关系切分如下（防双轴混淆与重复立法）：

### 11.1 两条正交轴，命名切分

| 轴 | 本规划 | ADR-021 草案（精化后） |
| --- | --- | --- |
| **窗口语义轴**（窗的形状） | `windowType`: sliding / calendar / session（§1.1，**名称先占**） | 不涉及 |
| **保真/精度轴**（聚合的实现保真度） | §1.2 重放保真轴 + `VelocityProvenance`（结果自报：exact/structure/relErrorBound/asOf） | `fidelity`: exact-per-event / bucketed / interpolated（**原名 windowSemantics 已裁改名**，声明面）+ conformance exact/approximate 分档（§1.3） |
| 时间档位 | asOf 语义照搬 rate-window `resolveAsOfMs` | `temporal: event/processing` + ReplayPolicy + `RATE_NO_EVENT_TIME`（replay 路径内核强制） |
| 幂等 | eventId 幂等（PG 唯一约束 + Redis SETNX，§3.1） | `stateful: true` 禁自动重试 + requestId 幂等键（**传播通道与本规划 eventId 立法统一**，评审 R4） |

### 11.2 两层校验时刻，互补编排

- **deploy-time**：本规划 §2 capabilities 校验（store 能力 vs 图调用静态匹配，
  不匹配 deploy 期失败）；
- **runtime**：ADR-021 §1.2 replay 路径强制（processing 工具遇 asOf 按宿主
  ReplayPolicy 执行）；
- 两时刻互补非二选一；VEL-3 落地时在同一发布 gate 挂 capabilities 校验
  （与 namespace 边界闸同点）。

### 11.3 合流点与排期

- VEL-1（机制契约落地）实现时应对照 ADR-021 草案的 UdfTool 三字段
  （temporal/stateful/fidelity）与双名注册条款——velocityPack 是第一批消费者；
- ADR-021 提交门序：verdict-005/006 落章 → 提交 seal-editor → 上游评审转
  accepted → zen-udf 实施（1.4.0 候选）→ VEL-2/3 消费；
- 改名条款（rate_1h → trailing_count_1h 等）实施前需 verdict 盘点生产存量图
  按名引用（上游评审事实核查 4）。

### 11.4 ADR 立项时点（本规划的立法归宿，2026-10-09 补）

按 [ADR-000](../adr/000-adr-charter.md) 判据裁定：**本规划现在不单独立 ADR**——
决策面已拆进三份现有文档（ADR-021 内核机制面 / verdict-005/006 宿主消费面 /
本文档规格详设层）。两个未来立法时点写明如下，届时直接执行不再议：

| 时点 | 触发 | 立法动作 | 归属 |
| --- | --- | --- | --- |
| **时点 1** | VEL-1/3 落地（VelocityStore 在 verdict 仓内实现） | verdict-NNN 序列**增补小节**（verdict-005/006 预计已覆盖大半，预计不需要新号） | verdict 仓 |
| **时点 2** | VEL-5 回流提案启动（VD6：并入 zen-udf contrib） | **立 seal-editor 序列新 ADR**（或 ADR-021 增补 §，视其范围演化）——先例 ADR-013（design spec 升格 ADR）；**§2 机制契约条文必须迁移进 ADR 正文或 jdm CONTRACT.md 新章**（本规划 shipped 即归档，契约不得居住其中） | seal-editor 序列 |

- **VD1-VD11 裁定落档方式**：宿主裁决后直接在本档 §8 表格标注裁定结果
  （jdm OQ 表态同款先例），不逐条立 ADR；升级为公共面不可撤回的裁定
  （当前仅 VD6 回流形态可见）随时点 2 入 ADR；
- **时点 2 前置盘点**（随回流提案一并产出）：生产存量图对 `rate_1h`/
  `group_distinct_1h` 的按名引用（对齐 ADR-021 评审事实核查 4）。
