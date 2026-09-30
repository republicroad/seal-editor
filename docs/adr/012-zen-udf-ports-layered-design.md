# ADR-012：zen-udf 端口层分层设计——集中管理 vs per-tenant 覆写

## 状态
accepted（2026-09-30，jdm-editor 仓裁定并实施——ADR-011 尾项多语言修订的落地档；
CONTRACT.md §6 端口注入模式的立法化）

## 背景

ADR-011 确立了 contract-first 多语言修订（§1 升格契约层 / §2 降位 TS DX 层 /
§3 新增 conformance fixtures），但遗留了一个开放设计问题：**端口依赖
（EgressGuard/SecretResolver/RateStore）与 tool()/pack() 声明如何共存？**

zen-udf 的三端口域（http/notify/rate-window）的 handler 在运行时需要访问
基础设施端口（出网防护、密钥解析、频控存储），而这些端口的实现由宿主注入。
注入后 handler 怎么拿到它们？per-tenant 差异在哪一层决策？

## 业界三种 handler 依赖注入模式

| 模式 | 代表 | 处理器怎么拿到端口 | 优劣 |
| --- | --- | --- | --- |
| **闭包捕获**（工厂函数） | Vercel AI SDK `tool({ execute })`；AWS Lambda 冷启动 SDK 客户端 | 端口在 tool() 工厂调用时以参数传入，handler 经 JS 闭包持有 | ✅ 显式、可测试；❌ tool() 签名膨胀 |
| **ctx 注入** | gRPC handler 的 context、K8s admission webhook 的 client bundle | 注册表持有端口引用，每次调用时组装 ctx 传给 handler | ✅ 端口集中管理、per-tenant 可覆写；❌ ctx 类型随端口膨胀 |
| **模块单例** | Fastify decorate、Node.js 常见 DI | 框架/宿主在启动时 set 模块级变量，handler import 读取 | ✅ 零 API 变化；❌ 隐藏依赖、多实例/测试隔离差 |

## 决策：三层分层

```
┌─ 组合根（composition root）────────────────────────────────┐
│  createUdfRuntime({ packs, ports })                       │
│                                                            │
│  ports（策略层）─ 宿主注入基础设施实现                       │
│  ├── egressGuard: EgressGuard         ← 出网策略           │
│  ├── secretResolver: SecretResolver   ← 凭证策略           │
│  └── rateStore: RateStore             ← 频控策略           │
│                                                            │
│  packs（机制层）─ 声明即契约，不感知端口                     │
│  ├── creditPack.tools[]  ← handler 闭包持有 ports 引用      │
│  └── ...                                                   │
└────────────────────────────────────────────────────────────┘
         ↓ 每次调用
┌─ 执行期 ──────────────────────────────────────────────────┐
│  runtime.call(name, kwargs, { tenantId })                  │
│  ├── handler 闭包捕获的端口实现做出 per-tenant 决策          │
│  │   (EgressGuard.assertAllowed(url, tenantId))            │
│  └── 错误码与 CONTRACT §5 对齐                              │
└────────────────────────────────────────────────────────────┘
```

三条规则：

| # | 规则 | 理由 |
|---|---|---|
| **M1** | 端口 MUST 经组合根一次注入，运行时**不提供事后设值入口** | 时序脆弱性（configureHttpUdf 的教训——宿主忘调则静默降级） |
| **M2** | 端口接口 MUST 自带 `tenantId` 参数，per-tenant 差异 = **端口实现内部的数据决策** | 不同租户不同实现是误判——正确做法是同一实现查不同数据 |
| **M3** | 工具声明（schema）MUST NOT 感知端口——声明描述业务接口，端口描述基础设施 | 机制/策略分界 |

**关键区分**：

| 层 | 谁决定 | 注入时机 | 粒度 |
| --- | --- | --- | --- |
| **基础设施实现**（EgressGuard 类、Redis RateStore 类） | 宿主/zen-udf | 组合根一次注入 | 全局唯一 |
| **per-tenant 决策**（哪些 URL 允许、频控阈值） | 端口实现内部按 `tenantId` 查 | 每次调用 | 端口接口自带 `tenantId` 参数 |

类比：一个数据库连接池服务所有租户（查询带 tenantId）——不是一个租户一个池。

### 为什么不需要 per-tenant 注入不同实现

极少数场景（如某个租户用了完全不同的云厂商、需要不同的出网 SDK），做法是
**策略路由模式**：

```ts
// 一个 EgressGuard 前端，内部按 tenantId 路由到不同策略引擎
class RoutingEgressGuard implements EgressGuard {
  private strategies = new Map<string, EgressGuard>();

  register(tenantId: string, guard: EgressGuard): void {
    this.strategies.set(tenantId, guard);
  }

  async assertAllowed(url: string, tenantId: string | undefined): Promise<void> {
    const guard = this.strategies.get(tenantId ?? '') ?? this.defaultGuard;
    return guard.assertAllowed(url, tenantId);
  }
}
```

这是**宿主侧的策略路由**，不是 zen-udf 机制层的事——机制层只管定义 EgressGuard
接口并把它传给 handler。

### per-tenant 不同实现的误区

容易误以为需要「每个租户一个不同的 EgressGuard 实例」——不是的。正确类比：

- **一个数据库连接池**服务所有租户（查询带 tenantId）——不是一个租户一个池
- **一个 auth 中间件**服务所有路由（token 携带 userId）——不是一个路由一个中间件
- **一个 EgressGuard 实现**服务所有租户（调用带 tenantId）——不是一个租户一个 Guard

per-tenant 差异是**数据**（allowlist 条目、频控阈值），不是**代码**（不同的 Guard 类）。
端口实现读同一份数据库/配置就能做出正确的 per-tenant 决策。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 三层分层（本 ADR） | 基础设施一次注入、per-tenant 数据决策、机制/策略清晰 | 无显著劣势 |
| B. per-tenant 注入不同 EgressGuard 实例 | 每租户完全独立 | 实例爆炸（N 租户 N 份连接池）、违背单例语义 |
| C. ctx 携带全部端口 + handler 按需读取 | 无隐式依赖 | ctx 类型随端口膨胀、所有工具可见所有端口（无能力收窄） |
| D. 声明位含端口（`tool({ ports })`） | 声明自包含 | schema 描述业务接口，混入基础设施违反机制/策略分界 |

## 实施清单

| # | 项 | 归属 | 状态 |
| --- | --- | --- | --- |
| 1 | ports.ts（端口接口 + UdfPorts 聚合） | zen-udf 0.12.0 | ✅ |
| 2 | runtime-ports.ts（组合根设值 + getPorts() 读取） | zen-udf 0.12.0 | ✅ |
| 3 | createUdfRegistry gains ports parameter | zen-udf 0.12.0 | ✅ |
| 4 | http/notify/rate-window 工厂化 + 域迁移 | zen-udf | 0.13.0 |
| 5 | seal-editor 撤 strictFunctionTypes 豁免 | seal-editor | 随 0.12.0 升级 |

## 后果

- 正面：端口一次注入、per-tenant 决策在端口实现内部、机制/策略分界清晰、多语言
  移植版按同一契约实现
- 约束：端口 MUST 在组合根注入（不可事后设值）；多实例隔离需宿主自行创建多个
  runtime 实例（每实例独立 ports）
- 中性：per-tenant 策略路由是宿主侧策略路由模式的职责，机制层不感知
