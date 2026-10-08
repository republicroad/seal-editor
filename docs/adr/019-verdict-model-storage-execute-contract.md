# ADR-019：verdict 模型存储与执行契约——L0 rev 化、发布语义与 execute API 面

## 状态

proposed（2026-10-08 seal-editor 侧起草——按 [ADR-000](./000-adr-charter.md) §2
归属：编辑器（生产者）↔ verdict 服务（消费者）的跨仓接口契约。**待 verdict 侧
评审**；实施归 verdict 服务，编辑器侧零代码改动（persistence adapter 接口已存在））

## 0 · 定位

模型是 verdict SaaS 的核心资产：编辑器生产它、L0 存储它、model-execute 消费它。
本 ADR 把三方法律定于一份——存储记录形态、发布语义、失效广播保证、执行 API 面。
它是 [handoff-verdict-integration](../design/handoff-verdict-integration.md) §2/§4/§6
从 bullet 升格为完整决策的立法化，也是 seal 侧 persistence adapter（ADR-008 L2
保存契约、auto-persist、版本历史含行级 diff）在 verdict 落地时的对接规范。

## 背景

### 已有资产（本 ADR 站在其上）

1. **adapter 接口已立法且已实施**：`GraphPersistenceAdapter`
   （load / save / listVersions / renameVersion / updateVersionMeta）+
   auto-persist 控制器（防抖/maxWait/CONFLICT 三选/退避重试）+ 版本历史面板
   （命名版本/钉住/对比/行级 diff——`diffContents` 消费相邻两版全文）；
2. **缓存键语义已有立法**：`${tenantId}:${key}@v{rev}`（handoff §2）；L1 缓存
   所有权归宿主（[ADR-003](./003-zen-udf-cache-ownership.md)），宿主自管失效；
3. **执行隔离已有立法**：ExecContext 强制 tenantId + 构造期捕获
   （[ADR-002](./002-zen-udf-tenant-isolation.md)）；哨兵测试钉住
   `decisionCache.delete` 幂等且并发安全；
4. **内容契约已立法**：图文档 = JDM 文档（[ADR-015](./015-custom-function-node-spec.md)
   规范形调用 + [ADR-016](./016-custom-function-typed-value-envelope.md) 信封）。

### 问题（未立法的三块空白）

| # | 空白 | 后果 |
| --- | --- | --- |
| P1 | **rev 语义未定**——内容哈希还是单调计数？决定「同内容重发布」行为、版本排序、diff 相邻性 | 各端各自发明，发布后无法统一 |
| P2 | **发布原子性与并发未定**——两个编辑器同时保存、发布与执行并发时的正确性 | 丢更新或脏读 |
| P3 | **失效广播保证未定**——pub/sub 丢消息时 head 缓存陈旧多久？execute 的正确性押在什么上 | 静默执行旧版模型 |

## 备选方案

### P1 rev 语义

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 内容哈希作 rev | 天然去重；内容寻址不可变 | 无时序（排序需另列时间戳）；哈希串对用户不友好；格式差异（键序/空白）扰动哈希 |
| **B. 单调计数 rev + contentHash 作列（决策）** | `v{N}` 人类可读、时序天然、与 `modelId:v{rev}` 执行 API 同构；INSERT 即原子 | 同内容重发布产生新 rev（auto-persist 防抖已缓解）；并发发号需每模型序列 |

### P3 失效保证

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 每次 execute 回源查 max(rev) | 绝对正确 | 每请求一次 L0 往返，热路径不可接受 |
| **B. head 缓存 + pub/sub 失效 + TTL 兜底（决策）** | 热路径零 L0；丢失广播自愈 | TTL 窗口内可能读到旧 head |

## 决策

### §1 · 存储模型（PostgreSQL L0）

```sql
model_revision (
  tenant_id   text        NOT NULL,
  model_key   text        NOT NULL,
  rev         int         NOT NULL,        -- 每模型单调序列，从 1 起
  content     jsonb       NOT NULL,        -- JDM 文档全文
  content_hash text       NOT NULL,        -- canonical JSON sha256，去重提示/diff 优化
  version_name text NULL,                  -- 命名版本（版本历史徽标）
  pinned      boolean     NOT NULL DEFAULT false,
  auto        boolean     NOT NULL DEFAULT false,   -- auto-persist 产物标记
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, model_key, rev)
)
```

- **head = max(rev)**，派生而非独立指针行——发布 = 单行 INSERT，天然原子；
- 元数据平铺记录顶层（GraphRecord 契约：内容放 `content`，meta 不嵌套）；
- 保留策略：每模型保留最近 N 版（N 缺省 50）+ 全部 `pinned`/命名版本；清理
  任务不得触碰被运行中缓存引用的 rev（引用计数或 TTL 宽限，实施定）。

### §2 · 发布语义（保存契约）

1. **编辑器 save** 携带 `baseRev`（加载时的 head）→ 服务端条件插入
   （`INSERT … WHERE NOT EXISTS newer rev` 等价实现）→ 已有更新 rev 则
   **409 CONFLICT**——与 appshell auto-persist 的 CONFLICT 三选
   （覆盖 / 另存副本 / 加载 head）精确对接，覆盖 = 无 baseRev 强写 head；
2. **同内容去重**：`content_hash` 与 head 相同 → 返回现有 rev 不新发
   （幂等保存，auto-persist 的 no-op 跳过双保险）；
3. 命名/钉住 = `PATCH` 元数据（不动 content，不产生新 rev）；
4. 发布成功后发失效事件（§3），**先提交后广播**——广播失败不回滚发布，
   由 TTL 兜底（§3）。

### §3 · 失效广播与 head 解析

- **双通道读法**：显式 `rev` 调用**永远安全**（pinned read，不走 head 缓存）；
  head 调用走 head 缓存 + 失效 + TTL 兜底；
- 失效事件：Redis pub/sub，消息 `{ tenantId, modelKey }`（不带 rev——副本
  直接删条目，避免乱序覆盖）；副本消费 = `decisionCache.delete(tenantId, key)`
  + head 缓存删除，**幂等**（哨兵测试已钉）；
- 投递保证：**at-least-once + 幂等消费 + head 缓存 TTL 兜底**（缺省 60s，
  可按租户调）——广播丢失的最坏窗口 = TTL 时长内 head 调用读到旧版；
  对正确性敏感的调用方 MUST 用显式 rev（此纪律写进 execute API 文档）；
- 旧 rev 的 L0 行不因发布删除（历史与行级 diff 依赖全量），只有缓存条目
  被删；物理清理归 §1 保留策略。

### §4 · 执行 API 面

```
POST /v1/models/:key/execute        { input: unknown, rev?: number }
```

- `rev` 缺省 = head（§3 语义）；`modelId:v{rev}` 形态兼容（handoff §2）；
- 鉴权：`tenantId` 只来自认证层（网关换发），**拒绝请求体携带与缺失**——
  [ADR-020](./020-verdict-tenant-governance-model.md) §4 的执行面条款；
- 错误码：`MODEL_NOT_FOUND` / `REV_NOT_FOUND` / `REV_GONE`（已清理）/
  `CONFLICT`（保存路径）/ 执行期结构化错误透传
  （`INVALID_PARAM`/`UDF_TIMEOUT`/`INVALID_RESULT`/`CIRCUIT_OPEN`/
  `INVALID_DEPENDENCY`…——CONTRACT §5 表，不吞不转译）；
- 响应 envelope：`{ result, trace?, performance, audit: { journalId } }`
  ——journal 每 [ADR-002](./002-zen-udf-tenant-isolation.md) 强制落。

### §5 · 编辑器对接面（生产者半边）

verdict 托管的编辑器经 HTTP adapter 映射本契约：

| adapter 方法 | HTTP |
| --- | --- |
| `save(content, { baseRev, versionName?, auto? })` | `POST /v1/models/:key/revisions` |
| `load(key, { revision? })` | `GET /v1/models/:key/revisions/{rev}`（缺省 head） |
| `listVersions(key)` | `GET /v1/models/:key/revisions`（元数据列表，含 content 串供行级 diff） |
| `renameVersion / updateVersionMeta` | `PATCH /v1/models/:key/revisions/{rev}` |

auto-persist 的防抖/maxWait/CONFLICT 三选在此契约上零改动工作。

## 实施清单

| # | 项 | 归属 | 量级 |
| --- | --- | --- | --- |
| 1 | L0 表 + 条件插入 + 元数据 PATCH + 保留清理任务 | verdict | ~1 天 |
| 2 | execute API + head 缓存 + 失效广播/消费 | verdict | ~1 天 |
| 3 | HTTP persistence adapter（§5 映射）+ seal-demo 接线 | verdict | ~0.5 天 |
| 4 | 双副本失效演练（丢失消息注入 + TTL 自愈断言） | verdict | ~0.5 天 |
| 5 | 编辑器侧验收：版本历史/行级 diff/auto-persist 在 verdict L0 上全功能走查 | 双方 | ~0.25 天 |

## 开放问题

1. **canonical JSON 归一化口径**（content_hash 的输入）：键排序 + 去空白？
   JDM 文档键序是否语义无关——待 verdict 首批 pack 实测后定；
2. 保留策略 N 与清理宽限时长：按租户可配还是全局——随运营数据定；
3. 多活区域下的失效广播拓扑（跨 region pub/sub）——后置到多 region 立项。

## 后果

- **正面**：三方法律同源（编辑器 adapter / L0 / execute 各自实现同一契约）；
  发布原子性与并发正确性有明确口径；失效保证分层（pinned 绝对正确 / head
  TTL 自愈）——正确性敏感调用有明确出路；编辑器全部版本功能（历史/命名/
  钉住/diff/auto-persist）在 verdict L0 上零改动可用；
- **约束**：head 读存在 TTL 窗口（文档纪律：敏感调用用显式 rev）；保留清理
  与缓存引用的协调需要实施细节设计；content_hash 依赖 canonical 口径落定；
- **后续条件**：verdict 侧评审通过后按实施清单排期；本契约变更 MUST 同步
  handoff §2/§4。
