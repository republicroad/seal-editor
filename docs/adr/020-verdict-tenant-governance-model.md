# ADR-020：verdict 租户与治理模型——租户边界、双层治理与认证装配

## 状态

proposed（2026-10-08 seal-editor 侧起草——按 [ADR-000](./000-adr-charter.md) §2
归属：治理谓词消费面与存储键模式均为跨仓契约。）
→ **accepted（2026-10-08 verdict 侧账实核对评审——「修改后接受」，术语对齐
workspace + tenantExempt 合法面成文，执行边界差距 G-G1 确认为唯一必修项，
见文末评审注记）**

## 0 · 定位

租户边界是 SaaS 不可撤回的第一决策。执行侧隔离已被
[ADR-002](./002-zen-udf-tenant-isolation.md) 立法大半（ExecContext 强制 +
构造期捕获 + per-tenant 键构造），本 ADR 立法**服务层**的三块：租户数据
边界、双层治理（UI 过滤 + API 执行边界）、认证装配。引擎/编辑器侧零改动——
全部消费既有立法面。

## 背景

### 已有资产

1. **执行隔离**（ADR-002）：ExecContext `tenantId` 强制、审计 journal、
   breaker/limiter per-tenant 键构造；缓存键 `${tenantId}:${key}@v{rev}`
   （[ADR-019](./019-verdict-model-storage-execute-contract.md) §1 同构）；
2. **治理谓词全链**（内核批 23-24）：`allowedNamespaces` 从 DegreeGraph prop
   → dg-empty 过滤 → resolveCustomNode 输入——**kernel 零权限语义**：
   UI 过滤是装饰，API 是唯一执行边界（[PEP/PDP 协作档](../design/permission-predicate-collaboration.md)）；
3. **多租户纪律三条**（handoff 既有）：注册 deploy-time（UdfPack 全租户
   同一份）；租户差异走 ExecContext + 端口；图内容不带凭证/租户身份；
4. **端口租户面**：EgressGuard per-tenant 出口白名单、SecretResolver
   per-tenant 解析（凭证不进图内容）。

### 问题（未立法的三块）

| # | 空白 | 后果 |
| --- | --- | --- |
| P1 | **服务端治理校验缺位**——allowedNamespaces 现只有编辑器 UI 过滤，绕过编辑器直写图（API 直传 content）时无执行边界 | 被治理关停的 namespace（如 http 出网域）可经手工图越权执行 |
| P2 | **租户数据边界未成文**——L0 行级隔离、缓存/限流键前缀、跨租户访问拒绝面 | 实现各自发明，审计口径不一 |
| P3 | **认证装配未定**——tenantId 从哪来、内部调用如何传递、空/伪造 tenantId 的失败形态 | 身份伪造或 fail-open |

## 备选方案

### P1 治理执行边界

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 仅编辑器 UI 过滤（现状） | 零成本 | **不成立**——kernel 零权限语义直接否定：API 是唯一执行边界 |
| B. 执行前全图扫描校验（决策） | 覆盖一切图来源（编辑器/API 导入/迁移）；与 UI 过滤同源同语义 | execute 前一次图遍历成本（图规模实测后再议缓存） |
| C. 存储 gate（发布时校验，拒绝越权图入库） | 拦截最早 | 治理配置变更后存量图不收敛（关停后已入库的图仍可执行）——**B/C 应叠加：发布时校验拦新图，执行时校验拦存量与配置变更** |

**决策：B + C 双层**——发布校验（ADR-019 §2 保存路径内）+ 执行校验
（evaluate 前置），均为「图引用 namespace 集合 ⊆ 租户 allowedNamespaces」，
数据源同一（治理服务的租户配置）。

### P3 tenantId 装配

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 请求体携带 | 简单 | 伪造面 |
| **B. 网关换发 + 内部头传递 + fail-closed（决策）** | 单一信任源 | 内部调用协议需纪律 |

## 决策

### §1 · 租户数据边界

- `tenantId` 是唯一租户标识（认证层签发，格式随 verdict 认证体系）；
- **一切数据面键带租户前缀**：L0 行（ADR-019 §1 主键首位）、L1/决策缓存、
  head 缓存、rate/limiter/breaker 键（键构造循 ADR-002 既有立法）；
- 跨租户零共享：除 deploy-time pack 代码（全租户同一份，含编辑器侧
  参考域/扩展域规范形定义）外，任何数据、缓存、配额不跨租户读写；
- 跨租户访问一律 `TENANT_MISMATCH` 拒绝（不区分不存在与无权限，防枚举）。

### §2 · 双层治理（PEP/PDP 落地）

- **策略数据**：治理服务持有租户 → `allowedNamespaces: Set<string>` 配置
  （DB 表 + 管理台编辑；缺省 = 参考域全集）；异步预计算为 Set、同步
  `Set.has` 过滤（[PEP/PDP 档](../design/permission-predicate-collaboration.md)
  两层分离最佳实践）；
- **UI 层（PEP-装饰）**：verdict 托管编辑器从治理服务拉取租户
  allowedNamespaces，传入 `SkinnedDecisionGraph`——面板/补全/新增入口过滤
  （内核全链已实施，零开发）；
- **执行层（PEP-边界）**：发布校验（ADR-019 保存路径内）+ execute 前置校验
  （§P1 决策），违例错误码 `NAMESPACE_FORBIDDEN`（列出越权 namespace，
  不列出可用集合——防探测）；
- **配置变更生效**：治理配置更新 → 治理服务广播（与 ADR-019 失效广播
  同通道机制，独立频道）→ 副本刷新本地 Set；TTL 兜底同款。

### §3 · pack 与图内容纪律（重申既有立法并落执行点）

- deploy-time 注册不变（per-tenant 注册永久不做）；
- 图内容零凭证零租户身份——发布校验（§2）顺带静态扫描 `content` 内
  `${secret:}` 引用形态合法性（密钥只可引用不可内联）；
- 租户差异只允许三处表达：ExecContext 传值、端口实现行为、
  allowedNamespaces 治理配置——出现第四处即纪律违例。

### §4 · 认证装配（fail-closed）

- 外部请求：网关认证 → 换发内部身份头（`X-Verdict-Tenant` + 签名/内部
  mTLS）→ 服务校验签名后取 tenantId；**请求体 tenantId 永不采信**
  （ADR-019 §4 已落 execute 面）；
- 内部服务间调用：服务身份 + 显式 tenantId 传递；**tenantId 缺失/空/
  校验失败 = 拒绝执行**（fail-closed，绝不缺省租户）；
- 编辑器托管面：用户登录（verdict 认证体系）→ 会话绑定租户 → 编辑器
  全部持久化调用经同一网关换发——adapter 不接触裸 tenantId。

### §5 · 配额与容量（立法框架，数值运营期定）

- per-tenant rate limits（RateStore 配置维度）+ per-tenant 并发容量
  （limiter 信号量，容量字段进租户配置）；
- breaker/limiter 键构造循 ADR-002（tenantId 内建）；
- 超限错误码：`RATE_LIMITED` / `CONCURRENCY_LIMITED`（结构化，可重试语义
  由调用方裁量）。

## 实施清单

| # | 项 | 归属 | 量级 |
| --- | --- | --- | --- |
| 1 | 治理服务：租户 allowedNamespaces 表 + 管理台 CRUD + 变更广播 | verdict | ~1 天 |
| 2 | 发布校验 + execute 前置校验（namespace 集合 ⊆ 检查，共享同一 Set 源） | verdict | ~0.5 天 |
| 3 | 网关换发 + 内部头签名校验 + fail-closed 装配 | verdict | ~1 天 |
| 4 | 编辑器托管接线：租户配置 → SkinnedDecisionGraph allowedNamespaces | verdict | ~0.25 天（内核零改动） |
| 5 | 纪律走查用例：直写图越权执行被拒 / 治理变更后存量图收敛 / 无 tenantId 拒绝 | verdict | ~0.5 天 |

## 开放问题

1. namespace 集合的粒度演进：现为全有/全无 per namespace——是否需要
   工具级细粒度（namespace 内单工具白名单）？等首个真实租户诉求；
2. 治理配置变更的审计面：随 ADR-002 journal 还是独立治理审计表——实施定；
3. 租户数据驻留（region pinning）：多 region 立项时一并裁。

## 后果

- **正面**：PEP/PDP 两层分离在 verdict 完整落地（UI 装饰 + API 边界 +
  发布 gate 三层同源）；执行侧复用 ADR-002 全部既有立法零改动；绕过
  编辑器的越权路径被封死；fail-closed 装配消除身份伪造面；
- **约束**：execute 前置校验增加一次图遍历（热路径成本待实测，可缓存
  图→namespace 引用集合）；双层校验依赖治理 Set 的新鲜度（TTL + 广播
  双保险，同 ADR-019 §3 语义）；内部头协议是新增信任面（签名管理成本）；
- **后续条件**：ADR-019 落定后接续评审；多租户 beta 前全部实施项闭合。

## 评审注记（verdict 侧账实核对，2026-10-08）

### 账实对账

| ADR 条款 | verdict 现状 | 裁定 |
| --- | --- | --- |
| §2 策略数据（租户 → allowedNamespaces） | workspace.enabled_packs（null=全量/数组=白名单）——治理闸已存在（catalog.ts 工作间闸），UI 已接（editor-canvas derived Set → SkinnedDecisionGraph） | ✅ 形态对应（名称 enabled_packs vs allowedNamespaces——前者是策略数据、后者是内核消费面，同一闸的两端） |
| §2 执行层边界（发布 gate + execute 前置校验） | **无**——execute 路径零 enabled_packs 校验，直写图（API 保存 + execute）可越工作间闸执行任意 namespace | ⚠️ **差距确认，G-G1 为唯一必修实施项**（kernel 零权限语义：UI 过滤不构成边界） |
| §3 图内容纪律（零凭证/静态扫描） | 未实施（redaction.ts 存在但覆盖面待查） | 差距→实施项 G-G2（低优先，密钥引用扫描） |
| §4 认证装配 fail-closed | middleware resolve workspace/user，require 中间件拒绝未认证——大体 fail-closed | ✅ 一致；匿名 /v1/execute 是显式豁免端点（见精化 2） |
| 术语 tenantId | 隔离单元 = workspace（同 ADR-019 精化 4） | ⚠️ 术语对齐 |
| ExecContext | runWithExecContext({ tenantExempt: true }) 用于匿名端点 | ⚠️ tenantExempt 合法使用面需成文（精化 2） |

### 精化（三条）

1. **术语对齐 workspace**（同 ADR-019 精化 4）："租户"在 verdict 映射为
   workspace；§1/§2 的 tenantId 一律读作 workspaceId；
2. **tenantExempt 合法使用面成文**：豁免仅限匿名/系统内部执行
   （/v1/execute 即时体验端点、启动期编译），不触数据面（workspaceId: null
   日志隔离）；出现第三种使用即纪律违例；
3. **策略数据双名言明**：enabled_packs（verdict 策略存储）与
   allowedNamespaces（内核消费面）是同一治理闸的两端——实施 G-G1 时
   校验源 = workspace.enabled_packs ∪ kernel builtin namespaces，
   与 editor-canvas 现有 derived 口径严格一致（防止 UI 与执行边界口径漂移）。

### 差距清单（实施项，归 verdict）

| # | 差距 | 量级 |
| --- | --- | --- |
| G-G1 | 执行边界校验：execute/保存路径加 namespace 集合 ⊆ 工作间闸检查（口径对齐 editor-canvas derived），违例 NAMESPACE_FORBIDDEN | ~0.5 天（唯一必修） |
| G-G2 | 图内容密钥引用静态扫描（低优先） | ~0.25 天 |

**裁定汇总：修改后接受——策略数据/UI 层/装配面与现状收敛良好；执行边界
G-G1 是 ADR-020 唯一实质实施项（kernel 零权限语义的唯一敞口）。**
