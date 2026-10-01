# ADR-010：函数目录租户过滤接口——过滤边界分层与接口形态（轨道 B 启动前置）

## 状态
accepted（2026-09-29 seal-editor 起草；2026-09-29 verdict 逐节裁定回填——方案 C
接受、生效面取默认提案、六项开放问题全部有结论，另立「参考域缺省可见、有条件
可过滤」原则（ed4595d 修正：出网域可按租户显式关闭，SSRF 面管控）；2026-09-29
本仓确认转 accepted（确认随修正更新）。**轨道 B HOLD 解除**）

> **✅ verdict 侧 Phase 0 + Phase 1 已落地（2026-10-01，verdict 仓批次 11）**：
> `workspace.enabled_packs`（0008 迁移，null = 全量）+ **工作间目录端点**
> `GET /v1/workspaces/:ws/custom-nodes/schema`（viewer+ 鉴权：会话成员或 api
> key；`filterNamespaces` 双闸 = 部署 env `CATALOG_ALLOWED_NAMESPACES` ∩ 工作
> 间白名单；编辑器 schemaSource 已接线带 ws）。**过滤语义与本 ADR 立法一致**：
> 体验层过滤、执行面不加闸（服务端注册表唯一事实源）。设置页按全量口渲染
> 勾选（origin 徽标 + 工具数），admin 可配。**遗留一致性问题**：下方补录的
> appshell 四内建基础节点不经目录载荷——verdict 关 http 域后 httpRequestNode
> 仍可见（归属本仓 ①/② 两案，verdict 未动，待轨道 B）。

## 背景

轨道 B 裁定（宿主 2026-09-29）：函数生态产品化（A1 目录 UI / A2 补全 / A4 弃用
标记移植 + 治理叠加）**待与 weaveseal/verdict 协商租户过滤接口形态后启动**。
本文档即协商底稿：给出过滤边界的设计空间、seal-editor 侧的接口提案、verdict
侧的落点选项与开放问题清单。

职责分层（函数生态治理文档 §0，宿主 2026-09-26 裁决）：**过滤机制归
seal-editor，过滤策略（哪个租户可见什么）归宿主后端**。词汇表沿 ADR-009：
参考域 / 通用扩展 / 行业包三层，`UdfPackMeta { origin, version, license? }`，
namespace 立法（`{pack-id}.{domain}` 强制前缀）。

现状数据流（已全部在产）：

```
zen-udf 注册表 ──▶ udfFunctionSchemaNamespaces()
                     │
                     ├─▶ 动态端点  GET /api/custom-nodes/schema
                     └─▶ 文件协议  host-functions.json（L5 信封 {version, generatedAt, namespaces}）
                              │
                              ▼
              appshell useCustomNodes({ schemaSource })
                              │
              ┌───────────────┼───────────────┐
           目录面板(A1)     补全/悬浮(A2)    REPL(A3)
```

verdict 当前经静态文件接入（14 域 22 工具）。**任何租户差异今天都不存在**：
所有租户看到同一份全量目录。

## 问题陈述

1. **entitlement 差异**：行业包（`verdict.risk` 等，ADR-009 第三层）按客户
   行业/套餐启用——不是所有租户都该看见；
2. **IP/许可证保护**：行业包永不开源（license: proprietary）——其**函数签名
   本身**（名称/参数/描述）是否允许进入任意租户的浏览器载荷？
3. **试用/分级租户**：试用租户仅参考域，企业租户全量；
4. **体验层个性化**（非安全）：收藏、最近使用、按角色折叠——这是过滤吗？
   不是，但协商中极易与 entitlement 混淆，必须先分层。

## 方案空间（协商核心：过滤发生在哪一层）

### 方案 A · 服务端过滤（entitlement 安全边界）

宿主在目录生成管线按租户过滤：动态端点读取租户上下文（cookie/token）后只
下发可见 namespaces；或 per-tenant 静态文件（`host-functions.{tenant}.json`）。

- 优点：**行业包签名不进未授权客户端**（IP 边界成立）；编辑器零改动（L5 信封
  语义天然兼容——过滤后的响应就是更小的 namespaces 数组）；目录/补全/REPL
  三面自动一致（同一数据源）；
- 代价：动态端点需租户感知（或文件爆炸）；per-tenant 缓存键；schema 契约的
  version/generatedAt 变为 per-tenant。

### 方案 B · 纯客户端过滤

全量目录下发，编辑器按谓词在渲染层过滤。

- 优点：一份目录、策略灵活、零后端改动；
- **否决作为安全边界**：proprietary 行业包的签名进任意租户载荷 = IP 泄漏；
  客户端谓词可被绕过（devtools）。只允许作为**体验层**存在。

### 方案 C · 分层（推荐）

**安全边界在服务端（方案 A），客户端谓词仅作体验层个性化（方案 B 降级使用）**：

- 第一层（安全）：服务端按 entitlement 过滤——未授权的 namespace **不存在于
  载荷中**；
- 第二层（体验）：编辑器 `catalogFilter` 谓词在已授权集合内做视图个性化
  （按角色折叠、按 origin 隐藏等）——漏掉只影响体验，不构成泄漏。

【verdict ✅ 接受（2026-09-29）——与 verdict 架构原则同构：服务端注册表/端点是
唯一事实源与安全边界，客户端一切过滤仅体验层。文件协议（L5）在租户过滤下重新
定位：静态全量文件降级为离线开发用途，租户差异只走动态端点。】

## seal-editor 侧接口提案（仅体验层；Phase 2 随轨道 B 产品化）

```ts
// useCustomNodes 增量（additive，缺省行为不变）
export type CatalogFilterRef = {
  namespace: string;            // ADR-009 namespace 立法词汇
  origin?: 'reference' | 'extension' | 'industry';  // UdfPackMeta.origin 透传后可用
  tool?: string;                // 工具级过滤预留（缺省按 namespace 粒度）
};
type CatalogFilter = (ref: CatalogFilterRef) => boolean;

useCustomNodes({ schemaSource, catalogFilter?: CatalogFilter });
```

- 生效面（**默认提案，供协商**）：目录面板确定过滤；补全（A2）与 REPL（A3）
  **不跟随**——体验层语义是"视图个性化"，授权全集仍可用（服务端已保证安全）；
  若 verdict 希望补全也跟随，提供第二谓词或布尔开关（开放问题 2）；

【verdict ✅ 接受（2026-09-29）——生效面取默认提案：仅目录面板过滤，补全/REPL
不跟随。理由：授权全集仍可用（安全已在服务端保证），补全跟随会造成「补全有、
目录无」的口径分裂；等真实用户反馈再评估第二谓词。】

【已实施（2026-09-29，随轨道 B——seal-editor 1.9.0 / seal-appshell 1.12.0）：
useCustomNodes 增 catalogFilter（CatalogFilterRef {namespace, origin?, tool?}，
origin 维度待 ADR-009 #1/#2 透传），过滤面 = 组件面板 customNodes 构建 +
FunctionCatalog 目录视图；补全由 hook 内全量注入（setUdfCompletions），REPL
不跟随——与裁定一致。filter 生效面核验见 function-catalog 测试用例。】
- 与弃用标记（A4）正交：`deprecated` 是显示语义（角标/警示），entitlement
  才是过滤——**弃用工具不因弃用而被过滤**；
- origin 徽标（ADR-009 实施清单 #3）是本提案的前置：`origin` 进 schema 载荷
  后 `catalogFilter` 才能按来源写策略。

## verdict 侧落点（策略解析；Phase 0 即可用）

- **entitlement 数据源**：weaveseal 租户设置（哪个租户启用哪些 pack/namespace）
  ——verdict 私有，本文档不约束其形态；
- **下发通道二选一（开放问题 3）**：
  - 动态端点：`GET /api/custom-nodes/schema` 携带租户上下文（cookie/token），
    服务端解析 entitlement 后生成——缓存需 per-tenant 键；
  - per-tenant 静态文件：`host-functions.{tenant}.json` + `schemaSource` 指向
    租户专属 URL——零计算但时效/运维随租户数线性；
- 现有静态文件（host-functions.json）保留为**无租户差异租户**的缺省通道。

【verdict 裁定 + 设计（2026-09-29 回填）】

- **entitlement 数据源**：workspace 即租户单位。两阶段：
  - Phase 0（当前单租户运营够用）：env `CATALOG_ALLOWED_NAMESPACES`（逗号分隔
    namespace 白名单；缺省空 = 全量）——部署级开关；
  - Phase 1（多租户差异化时）：workspace 级设置（JSONB `enabled_packs` 列或
    独立表），管理界面配置；
- **下发通道：动态端点（已上线，8.2.a 实现 `GET /api/custom-nodes/schema`）**。
  过滤即在该端点内实现：会话 → workspace → entitlement → 按 namespace 白名单
  过滤 → 下发。per-tenant 静态文件**否决**（时效/运维随租户数线性，且 verdict
  为单实例部署，端点内存缓存按 workspace 键 + 目录版本失效即可）；
- **参考域缺省可见，非不可过滤（2026-09-29 修正）**：参考域随产品分发、
  商业上缺省全量；但机制上一份白名单管所有 namespace——按租户移除参考域是
  显式运维决策（真实场景：对试用租户关 http 域收窄出网面）。禁止的只是把
  参考域移出版本发布（代码开源边界，非授权边界）；
- 现有静态 host-functions.json 降级为离线开发用途（文件协议 L5 保留）。

## 分阶段实施

| 阶段 | 内容 | 归属 | 前置 |
| --- | --- | --- | --- |
| Phase 0（今天可用） | 服务端 entitlement 过滤（动态端点或 per-tenant 文件） | verdict | 无——L5 信封语义已兼容 |
| Phase 1 | origin 透传进 schema 载荷 + 目录来源徽标（ADR-009 清单 #2/#3） | zen-udf 0.9.0 + appshell | ADR-009 #1 |
| Phase 2 | `catalogFilter` 谓词 + REPL 过滤挂点（轨道 B 产品化一并落地） | seal-editor（appshell/kernel） | 本 ADR 协商收敛 + 轨道 B 启动 |

## 开放问题清单（逐条协商）

1. **过滤粒度**：namespace 级为主是否足够？工具级（`tool?: string`）何时需要？
2. **体验层谓词的生效面**：补全/REPL 是否跟随 `catalogFilter`？（默认提案：不跟随）
3. **下发通道**：动态端点 vs per-tenant 文件——verdict 的缓存/时效/运维取向？
4. **license 字段可见性**：`license: proprietary` 的 origin 徽标进客户端载荷
   可接受，还是行业包在服务端整包隐藏（Phase 0 默认）？
5. **试用/匿名租户**：无租户上下文的请求回落全量参考域还是 401？
6. **schema 版本语义**：过滤后 `version/generatedAt` 是否 per-tenant（影响
   目录过期提示的口径）？

### verdict 协商结论（2026-09-29 回填）

| # | 问题 | verdict 结论 |
| --- | --- | --- |
| 1 | 过滤粒度 | **namespace 级足够**：行业包以整包为授权单位；工具级属体验层（`tool?: string` 字段保留为预留） |
| 2 | 体验层生效面 | **接受默认提案**：仅目录面板过滤，补全/REPL 不跟随 |
| 3 | 下发通道 | **动态端点**（已上线）；per-tenant 静态文件否决 |
| 4 | license 可见性 | **Phase 0 服务端整包隐藏**（未授权包不存在于载荷，无徽标问题）；已授权包的 origin/license 徽标进载荷可接受 |
| 5 | 试用/匿名租户 | 编辑器在会话守卫后必有租户上下文（该场景实际不存在）；防御性回落 = 全量参考域 + zen-expression-ext 缺省可见；**例外**：http 等出网类参考域可按租户显式关闭（SSRF 面管控，属运维决策非商业决策） |
| 6 | schema 版本语义 | version 用全量目录单调值（不 per-tenant）；generatedAt 取过滤时时间戳——过期提示口径不受过滤影响 |

Phase 0 实施承诺：动态端点过滤逻辑（env 白名单起步）在 verdict 8.2 收官后下一批次实施（纯 verdict 侧改动，不依赖本仓发版）。

### 本仓确认（2026-09-29，seal-editor 评审结论；随 ed4595d 修正更新）

verdict 六项结论**均无异议**，要点核验：

- `catalogFilter` 的谓词维度（namespace/origin/tool）恰落在 ADR-009「实施加强
  注记」的元数据最小化纪律内——过滤依据被正式封顶，无将来扩维度的预期管理负担；
- version 取全量目录单调值 + generatedAt 取过滤时时间戳的组合，对本仓 L5 信封
  的消费语义（目录过期提示）无破坏——过期提示口径不受过滤影响正是其设计目标；
- 「参考域缺省可见、有条件可过滤」（ed4595d 修正版）与 ADR-009 三层生态位自洽：
  商业缺省与授权边界解耦——一份白名单管所有 namespace，按租户移除参考域是
  显式运维决策（http 域 × 试用租户 = 出网面/SSRF 收窄）；禁止的只是移出版本
  发布（代码开源边界非授权边界）。本仓无异议；
- L5 文件协议降级为离线开发用途：协议本身保留（本仓 1.7.0 已实施并带单测），
  verdict 侧的重新定位不触及本仓任何改动。

**转 accepted，轨道 B HOLD 解除。**

**随 ed4595d 修正补录一项编辑器侧一致性缺口（本确认发现，归属 seal-editor，
随轨道 B/Phase 2 落地）**：服务端目录过滤对 schema 驱动域天然一致（目录/补全/
REPL 同源），但 appshell `useCustomNodes` 的四个内建基础节点（http-request /
crypto / current-date / query-list，`composeBaseNodes` 硬编码）不经目录载荷——
verdict 按租户关 http 域（本修正的真实场景）时，httpRequestNode 仍可见可拖而
执行端注册已撤，画布节点运行期报未知函数。修复方向二选一：① `useCustomNodes`
增 `disabledNamespaces?: string[]`，`composeBaseNodes` 按 namespace 排除内建
节点（约半天，可作 Phase 0 一致性临时措施）；② 四节点去硬编码、改为 schema 化渲染——设计已定稿：[dedicated-node-registry-design.md](../design/dedicated-node-registry-design.md)（tester 带 rank 校验 + 三级降级 + 部分接管；与 ADR-009 #3 徽标同批，zen-udf 核心零改动）。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 服务端过滤为唯一机制 | 零编辑器改动、安全边界清晰 | 无体验层个性化挂点；策略变更全走后端 |
| B. 纯客户端谓词 | 策略最灵活、零后端 | **IP 泄漏 + 可绕过**——作为安全边界否决 |
| C. 分层（服务端安全边界 + 客户端体验谓词，本 ADR） | 边界正确、两阶段解耦、编辑器机制最小 | 需协商两层的语义边界（开放问题 2） |

## 后果

- 正面：轨道 B 可启动（本 ADR 收敛即解除 HOLD）；Phase 0 不依赖本仓任何发版；
  行业包 IP 边界成立；namespace 立法（ADR-009）成为过滤策略的词汇表；
- 约束：`catalogFilter` 为 seal-editor 增量接口（Phase 2，随轨道 B）；origin
  透传依赖 zen-udf 0.9.0（ADR-009 清单 #1）；verdict 需建 entitlement 数据源；
- 协商方式：verdict/weaveseal 在本文档逐节标注（接受/否决/修改意见），裁定后
  更新状态行为 accepted 并回填开放问题结论。
