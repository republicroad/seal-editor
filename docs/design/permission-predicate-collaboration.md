# 谓词/权限协作模式——PEP 与 PDP 分离的最佳实践

- 日期：2026-10-07
- 状态：**立法 · 已实施**（`allowedNamespaces` 谓词槽位随 1.29.0 落地，本文档为设计依据与业界实践归档）
- 来源：治理窗 phase-2「catalogFilter 等权限模型」门禁的架构消解（宿主 2026-10-07 裁定：谓词注入 > 内建 RBAC）
- 关联：function-ecosystem-authoring-governance.md §A2（catalogFilter 面）、ADR-010 Phase 2、ADR-008 L2（capability slot 惯例）

## 1 · 核心张力：决策点与策略库的分离

权限系统的本质矛盾：**代码里「在哪里查」（谓词/PEP，Policy Enforcement Point）和「拿什么查」（策略/PDP，Policy Decision Point）必须分离，但分离又引入延迟与漂移**。

- **PEP**（Policy Enforcement Point）：代码中执行「允许/拒绝」决策的位置——目录渲染、面板开合、⌘K 调色板、API 路由入口。
- **PDP**（Policy Decision Point）：回答「允许/拒绝」的策略来源——硬编码 boolean、membership 数据库查询、OPA Rego 评估、Cedar 策略、关系元组。

所有权限架构都是对这个张力的不同取舍。 业界经过二十年演化出五种协作模式，按 PEP→PDP 的耦合度从紧到松排列如下。

## 2 · 五种协作模式（业界实践谱系）

### 模式 ①：PDP/PEP 网络分离（XACML → OPA → AWS Verified Permissions）

```
┌──────────────────┐     "alice 能用 roster 吗？"       ┌──────────────────┐
│  编辑器 PEP       │ ───────────────────────────────→  │  策略服务 PDP     │
│  (catalogFilter)  │ ←──── Permit / Deny ──────────   │  (OPA/Zanzibar)  │
└──────────────────┘                                   └──────────────────┘
```

**机制**：策略集中在一个独立服务（OPA 用 Rego 语言、AWS Verified Permissions 用 Cedar、
Zanzibar 系用关系元组），每次决策发网络查询。

**业界实例**：
- **Open Policy Agent**（CNCF 毕业项目）：策略语言 = Rego；Netflix/Pinterest 用于微服务准入
- **AWS Verified Permissions**：Cedar 语言 + 全托管策略存储
- **Google Zanzibar**（论文）→ **SpiceDB / OpenFGA** 开源实现：关系元组模型
  （`user:alice` `editor` `document:doc1`）

**利**：策略集中管理、可审计、可热更新（不重启应用）、跨微服务统一。
**弊**：每谓词调用一次网络 hop（缓存仍有 TTL 漂移）；策略语言与代码类型系统脱节
（Rego 不了解你的 TS 类型）。
**适用**：安全团队集中管控的微服务组织、多语言多栈。

---

### 模式 ②：进程内策略库（Oso「Authorization as a Library」）

```
┌────────────────────────────────┐
│  编辑器 + Oso 库（同进程）       │
│  策略文件与应用代码同仓同版本     │
│  catalogFilter → oso.query()   │
└────────────────────────────────┘
```

**机制**：策略文件与应用代码同仓同版本，策略在进程内求值——零网络 hop。

**业界实例**：
- **Oso**（osohq.com）：「Authorization as a library」开创者；npm/pip/maven 全有
- **Cedar**（AWS 开源）：既可嵌入也可走 Verified Permissions 服务——双模

**利**：零延迟；类型安全（策略可引用应用类型）；策略变更随代码走 CI。
**弊**：策略部署耦合代码部署（改权限 = 发版）；不适合跨团队集中管控。
**适用**：产品团队同时拥有代码和策略。

---

### 模式 ③：能力令牌 / 预计算清单（Backstage → Retool → Google IAM → Slack）

```
┌──────────┐    "alice 在 workspace W 有哪些函数？"    ┌──────────┐
│  编辑器   │ ───────────────────────────────────→  │  权限服务  │
│  mount 时 │ ←──── ["roster","crypto",…] ─────────  │ (一次性)  │
│  sync 过滤│                                       └──────────┘
└──────────┘
```

**机制**：不在每个条目上逐条判断——**一次性问「允许清单是什么」**，之后同步
`Set.has()` 过滤，零逐项 hop。

**业界实例**：
- **Backstage Permission Framework**：页面挂载时一次性从 permission backend
  拉取全量授权 → 缓存 → 同步过滤 catalog 条目。**与 catalogFilter 最同构**。
- **Retool**：前端挂载时拉 `currentUser.permissions` 数组 → 同步 `can()` 过滤资源树
- **Google Cloud IAM**：`testIamPermissions` API 一次返回全量 → 客户端本地判断
- **Slack**：`users.info` 返回 `scopes` 数组 → 客户端同步判断 UI 可见性

**利**：渲染零异步、谓词是纯同步 boolean、网络开销 O(1)；权限粒度可粗可细。
**弊**：权限变更需刷新页面（或有 WebSocket 推送）；不适合行级/字段级动态权限。
**适用**：UI 层目录/菜单/面板过滤——**正是 catalogFilter 的场景**。

---

### 模式 ④：装饰器/拦截器（Spring Security → NestJS Guards → Hono middleware）

```ts
@RequirePermission('use:roster')
async useRoster(args: RosterArgs) { … }
```

**机制**：权限作为元数据声明在 handler 上，框架拦截器在执行前统一检查。

**业界实例**：Spring Security `@PreAuthorize`、NestJS `@UseGuards`、
tRPC middleware、Hono middleware（verdict 的 `requireWorkspace("editor")` 即此类）。

**利**：声明式 DRY、入口检查全覆盖。
**弊**：只管入口不管数据级过滤；对渲染期过滤（我们的场景）无用。
**适用**：API 层——verdict 已在做。

---

### 模式 ⑤：散落硬编码（`if role === 'admin'`）——反模式

策略散落在代码各处，不可审计、不可集中管理、权限变更 = 全局搜索替换。
每个系统都从这里起步，但成熟系统都应迁出。

---

## 3 · 模式对比矩阵

| 维度 | ①网络 PDP | ②进程内库 | ③预计算清单 | ④拦截器 | ⑤硬编码 |
| --- | --- | --- | --- | --- | --- |
| 渲染延迟 | 高（网络） | 零 | 零 | 零 | 零 |
| 策略可审计 | ✓✓ | ✓ | ✓ | ✓ | ✗ |
| 策略热更新 | ✓✓ | ✗（随发版） | ✗（随刷新） | ✗ | ✗ |
| 类型安全 | ✗（Rego/CEdar 外部） | ✓ | ✓ | ✓ | ✓ |
| 跨服务统一 | ✓✓ | ✗ | ✗ | ✗ | ✗ |
| 实现成本 | 高 | 中 | **低** | 中 | 零 |
| UI 目录过滤 | 间接（预计算） | 直接 | **直接** | ✗ | 直接 |
| API 入口防护 | ✓ | ✓ | ✗ | **✓** | ✗ |
| 本仓适用 | 二阶段（超规模） | 可选 | **✓ 首选** | verdict 已有 | 反模式 |

## 4 · 最佳实践：两层分离 + 同步谓词 + 异步预计算

综合以上，**最佳实践不是五种选一，而是两层协作**——第一层做重的策略计算，
第二层做轻的渲染过滤。这是 Backstage Permission Framework 和 Retool 共同的
架构形态。

```
┌─────────────────────────────────────────────────────────────┐
│  第一层：异步预计算（挂载时执行一次，或按宿主策略周期刷新）      │
│  宿主调权限后端 / membership 表 / OPA / 硬编码——              │
│  产出 allowedNamespaces: Set<string>                         │
│  → 通过 props/槽位传给 kernel                                 │
├─────────────────────────────────────────────────────────────┤
│  第二层：同步谓词（每次渲染 O(1)）                              │
│  kernel 拿 allowedNamespaces.has(tool.namespace) 过滤         │
│  三消费面（目录/⌘K 调色板/Components 面板）——零异步零网络       │
└─────────────────────────────────────────────────────────────┘
```

### 为什么两层分离优于逐条谓词调用

| 维度 | 逐条谓词（每次渲染调外部） | 异步预计算 + 同步过滤 |
| --- | --- | --- |
| 渲染延迟 | 谓词含网络 hop = 阻塞/闪烁 | O(1) `Set.has()` |
| 谓词签名 | 必须支持 async → 破坏 React 渲染契约 | 纯同步 boolean |
| 缓存策略 | 谓词内部自行缓存（易遗漏） | 预计算天然缓存 |
| 安全边界 | 谓词内可能泄漏 kernel 状态到宿主 | 谓词只见 `Set<string>`，kernel 内部零暴露 |
| 类型签名即文档 | `(tool, user) => boolean` 诱惑宿主在谓词内做 IO | `allowedNamespaces: Set<string>` 签名自解释 |

### 谓词签名的关键设计决策

同步谓词只接受 `Set<string>`（或更窄的 `has(namespace)` 函数），**不传 user
不传权限模型**——因为：

1. kernel 不需要知道权限怎么算（它只管「在不在集合里」）；
2. 宿主可以背后换成 OPA、membership 查询、硬编码——kernel 零感知；
3. 类型签名即文档：`allowedNamespaces: Set<string>` 比
   `(tool, user) => boolean` 更安全（后者诱惑宿主在谓词内做 IO）。

这就是 **capability slot 惯例**的又一次落地——与 `simulateHandler`/
`fixturesRunner`/`persistence` 完全同构：kernel 声明接口，宿主注入实现。

---

## 5 · 反模式

| 反模式 | 危害 | 解药 |
| --- | --- | --- |
| 谓词做 IO（网络/DB fetch） | 破坏同步渲染契约；性能不可控 | 异步预计算层先行，谓词只做 `Set.has()` |
| 双真（kernel AND host 各查一次） | 策略漂移：kernel 说不允许、host 说允许（或反向）——双真=零真 | 权限判定**只在宿主**，kernel 只做过滤 |
| 静默过滤（条目消失无解释） | 用户分不清「被过滤」和「不存在」 | 保留调试出口（如 `?debug-permissions` 查询参数显全量） |
| 谓词读 kernel 内部状态 | 耦合 kernel 实现，宿主谓词变成 kernel 测试 | 谓词只接受独立入参，不读 store/specifications |

---

## 6 · seal-editor 落地设计

### kernel 侧（`allowedNamespaces` 槽位）

```ts
// DecisionGraph 新 prop（跟 fixturesRunner/simulateHandler 同层）
allowedNamespaces?: Set<string>;
// 缺省 undefined = 不过滤（现有行为零回归）
```

三消费面自动生效（同一 state 驱动）：
- FunctionCatalog → filter tools
- Components 面板 → filter custom nodes
- ⌘K 调色板 → filter add-items

### appshell 侧（桥接层）

```ts
// 宿主侧：workspace membership → allowed set
const membership = await fetchUserWorkspaceRole(workspaceId, userId);
const allowedNamespaces = new Set(
  membership.role === 'admin' ? allNamespaces : membership.allowedNamespaces
);

<SkinnedDecisionGraph allowedNamespaces={allowedNamespaces} … />
```

### 实施状态

| 项 | 状态 |
| --- | --- |
| kernel `allowedNamespaces` 槽位 | 待实施（~0.5 天） |
| 三消费面接线 | 随槽位同批 |
| verdict 侧 membership → Set 桥接 | 待实施（~0.25 天） |
| 权限变更实时推送（WebSocket/轮询） | 二阶段（等反馈） |
| 行级/字段级动态权限 | 不做（超 UI 过滤范畴） |

---

## 7 · 职责边界总结

| 层 | 职责 | 不职责 |
| --- | --- | --- |
| kernel | 声明谓词槽位、同步过滤三消费面、缺省不过滤 | 理解权限语义、查询权限后端、缓存策略 |
| appshell | 透传 allowedNamespaces、（可选）挂 Toaster 反馈 | 实现权限逻辑 |
| 宿主（verdict） | 计算允许集合（OPA/membership/硬编码）、决定何时刷新 | 干预 kernel 过滤实现 |

---

## 8 · 进阶场景与业界实践

### 8.1 行级/字段级动态权限

**问题**：不只是"能看到目录"——"这张决策表的哪些行你能编辑"、"HTTP 节点的
auth 字段你能改吗"。UI 层 `Set.has()` 无法做行级过滤——它只能隐藏后端
已返回的数据。

**业界实践**：

| 方案 | 层级 | 机制 | 业界实例 |
| --- | --- | --- | --- |
| PostgreSQL RLS | DB | `CREATE POLICY … USING (…)` 查询重写 | Supabase/Neon 默认 |
| GraphQL field directives | API | schema 声明 `@auth(level: "field")`，resolver 守卫 | Hasura/AppSync |
| Oso row filters | 应用 | ORM hook 或 query builder 注入 WHERE 子句 | Oso + SQLAlchemy/Prisma |
| Zanzibar Check | 服务 | `Check(user:alice, "edit", "row:42")` 逐条判定 | SpiceDB/OpenFGA |
| Apache Ranger | 数据平台 | Hive/Spark 列掩码 + 行过滤（policy SQL） | Hadoop 生态 |

**核心原则：后端强制、前端装饰（Zero Trust）**

UI 层 `Set.has()` 无法做行级过滤——它只能隐藏后端已返回的数据。行级/字段级
权限的正确落位是 **verdict API 层**：

- API 查询时按 workspace membership 过滤行（PostgreSQL RLS 或 query rewrite）；
- API 返回的 JSON 只包含用户可见的字段（field masking）；
- 前端**从不"隐藏"后端已返回的东西**——因为后端就不该发。

这就是 **Zero Trust 原则**在权限中的体现：从不信任 UI 的过滤状态，API 是
唯一的权威强制点。即使 UI 没刷新，API 仍然拒绝未授权请求。

**对 seal-editor 的映射**：

- 行级：verdict API 的 models routes 按 workspace membership 过滤——**已有 ✓**；
- 字段级：如果未来需要"alice 不能编辑 HTTP 节点的 auth 字段"——落位 =
  DecisionGraph 新 prop（如 `fieldPermissions?: (nodeType, field) => 'edit' | 'view' | 'hidden'`）
  或 verdict API 在 content 中标记字段为 readonly。**当前无此需求 → 不立项**。

**最佳实践解决了什么**："后端不发就不会泄露"——UI 装饰不可靠，API 才是
真正的边界。不解决：业务逻辑层面的动态规则（需引擎侧决策，非权限范畴）。

---

### 8.2 角色层级/权限继承树

**问题**：角色多了以后（admin/editor/viewer/guest/auditor/…），
N 角色 × M 资源 = N×M 条赋值——**权限爆炸**。

**业界实践**：

| 方案 | 机制 | 复杂度 | 业界实例 |
| --- | --- | --- | --- |
| **扁平 Set**（现状） | 直接列 namespace | 最低 | 早期 Backstage/小团队 |
| **RBAC1 层级**（NIST 标准） | 角色形成 DAG，权限沿 DAG 流下 | 中 | Keycloak composite roles |
| **ABAC 条件** | 属性匹配（`user.dept == resource.owner_dept`） | 中-高 | AWS IAM Condition keys |
| **Zanzibar 关系元组** | 组嵌套 + 关系传递闭包（`group:#member@group:`） | 高 | Google Drive/SpiceDB |
| **Oso Polar 层级规则** | `has_role(User, "editor") if has_role(User, "viewer")` | 中 | Oso 进程内 |

**最佳实践：扁平优先、层级推到宿主**

kernel 接口 `Set<string>` 天然是**层级无关的**——宿主在计算 Set 时自行
展平层级：

```ts
// verdict 侧（宿主）：层级展平发生在 Set 构建时
const role = membership.role; // 'admin' | 'editor' | 'viewer'
const hierarchy: Record<string, string[]> = {
  admin: ['editor', 'viewer'],
  editor: ['viewer'],
  viewer: [],
};
const inherited = hierarchy[role] ?? [];
const allowedNamespaces = new Set(
  inherited.flatMap((r) => roleToNamespaces[r]).concat(roleToNamespaces[role])
);
// kernel 只看到扁平 Set——零感知层级存在
```

**为什么不在 kernel 做层级**：

1. kernel 的消费者只关心"这个 namespace 在不在集合里"——层级是 Set 的
   实现细节；
2. 层级规则因宿主而异（verdict 的 workspace membership ≠ 别的宿主的
   SSO role）——kernel 做层级 = 误收非通用逻辑；
3. 调试：扁平 Set 可以直接 `console.log` 看到 alice 能用什么——层级树
   需要展开才可见。

**何时需要层级**：角色数 > 15 或权限规则 > 50 条时，扁平 Set 的维护成本
开始超过层级抽象的成本。届时在宿主侧引入 Oso/Keycloak，kernel 接口不变。

**最佳实践解决了什么**："权限爆炸"——N×M 赋值收敛为 N+M。
不解决：跨域/跨组织的权限联邦（需 Zanzibar 级基础设施）。

---

### 8.3 权限变更实时推送

**问题**：admin 撤销 alice 权限后，alice 的浏览器里多久生效？

**业界实践**：

| 方案 | 延迟 | 复杂度 | 业界实例 |
| --- | --- | --- | --- |
| **页面刷新**（现状） | 手动 | 零 | 最简合法形态 |
| **短 TTL JWT + 自动刷新** | 5-15 分钟 | 低 | Auth0/Supabase 默认 |
| **STALE-WHILE-REVALIDATE + 版本计数** | <30s | 中 | Backstage/Slack |
| **WebSocket/SSE 推送** | <1s | 高 | Grafana Enterprise/Retool |
| **服务端会话撤销** | 即时 | 高 | 安全事件逃生门 |

**最佳实践：STALE-WHILE-REVALIDATE + 逃生门**

1. **正常场景**：`allowedNamespaces` 的 Set 是挂载时快照——挂载到刷新
   之间权限不变即可。权限变更 → 用户刷新页面 → 新 Set。零基础设施。
2. **低延迟场景**（< 30s）：verdict 暴露
   `GET /api/permissions/version?workspaceId=W` 返回单调递增版本号。
   客户端每 30s 轮询一次——版本变化则重新拉全量 Set。
3. **安全逃生门**：admin 撤销关键权限时，verdict 服务端使 alice 的
   session 失效（auth.ts 已有 session 机制）→ alice 下一次 API 请求
   401 → 被踢到登录页。

**对 seal-editor 的映射**：

- kernel 零改动——`allowedNamespaces` 是宿主传入的 prop，宿主自行
  决定何时更新它；
- appshell 零改动——透传层无状态；
- verdict 侧：加一个 version endpoint + 客户端轮询/推送（~0.25 天）
  ——待安全需求触发。

**为什么不做真正的实时推送**：

1. 需要 WebSocket/SSE 基础设施 + 服务端权限变更事件总线 + 客户端
   diff/re-render——基础设施成本远超收益；
2. UI 过滤不是安全边界——verdict API 中间件才是真正的强制执行层。
   即使 UI 没刷新，API 仍然拒绝未授权请求。UI 过滤只是"装饰"；
3. 这就是 **Zero Trust 原则**的体现：从不信任 UI 的过滤状态，
   API 是唯一的权威强制点。

**最佳实践解决了什么**："撤销间隙"——admin 撤销后客户端仍可操作的
时间窗口。不解决：断网期间的本地权限状态（需离线方案，二阶段）。

---

### 8.4 场景→模式选型决策树

```
需要行级/字段级过滤？
├─ 是 → 后端强制（RLS/GraphQL guard），前端只装饰
│        → 当前无此需求，不立项
└─ 否（目录/面板/调色板粒度）
    ├─ 角色数 > 15？
    │  ├─ 是 → 宿主侧引入 Oso/Keycloak 层级展平 → kernel 接口不变
    │  └─ 否 → 扁平 Set（现状）
    │
    └─ 需要实时推送？
       ├─ 是（安全事件） → 服务端会话撤销（逃生门）
       ├─ 是（一般治理） → 版本计数轮询（STALE-WHILE-REVALIDATE）
       └─ 否 → 页面刷新即生效（现状）
```

### 8.5 三场景最佳实践解决的问题总结

| 场景 | 最佳实践解决的问题 | 不解决的问题 |
| --- | --- | --- |
| 行级/字段级 | "后端不发就不会泄露"——UI 装饰不可靠 | 业务逻辑层面的动态规则（需引擎侧决策） |
| 角色层级 | "权限爆炸"——N×M 赋值收敛为 N+M | 跨域/跨组织的权限联邦 |
| 实时推送 | "撤销间隙"——admin 撤销后客户端仍可操作的窗口 | 断网期间的本地权限状态（需离线方案） |

---

## 9 · 关联文档

- `function-ecosystem-authoring-governance.md`——治理窗设计源（Phase 2 ADR-010）
- `typed-input-spec.md` §7——`$` 作用域边界（与权限无关但同为「standalone 求值域」裁定）
- `appshell-auto-persist.md`——保存线二阶段候选（IndexedDB 草稿/Web Locks）
- [Backstage Permission Framework](https://backstage.io/docs/permissions/overview/)
- [AWS Verified Permissions / Cedar](https://docs.aws.amazon.com/verifiedpermissions/)
- [Oso — Authorization as a Library](https://www.osohq.com/)
- [Open Policy Agent](https://www.openpolicyagent.org/)
- [Google Zanzibar 论文](https://research.google/pubs/pub48190/)
