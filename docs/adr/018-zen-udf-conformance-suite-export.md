# ADR-018：zen-udf 端口 conformance 套件包外导出——`./conformance` 子路径（verdict Redis 化 RateStore 前置）

## 状态
proposed（2026-10-08 verdict 侧起草——消费方立项前置，按协作规范只提 ADR 不改代码；目标版本 zen-udf **1.3.0**）

## 背景

### 立法源

handoff-verdict-integration.md §1 的既有立法：宿主的端口实现（RateStore /
ConcurrencyLimiter / EgressGuard / SecretResolver）必须**复用上游同一套
conformance 跑绿后才可接入**（契约即测试，BP-03）。

### 现状

- `RateStore` 的 conformance 套件已存在：`src/contrib/rate-store-conformance.ts`
  （`rateStoreConformance(name, createStore)`，注入时钟，覆盖 rate 计数/滑窗/idle
  与 groupDistinct pv/uv/组独立等语义）。上游自测 `rate-store.test.ts` 以
  `rateStoreConformance('InMemoryRateStore', …)` 消费。
- 但该套件**未从包根导出**。包 exports map 仅有两入口：
  `"." → ./src/index.ts` 与 `"./runner" → ./src/fixtures.ts`（ADR-005 源码发布
  + ADR-014 fixtures 契约的产物）。`rateStoreConformance` 位于 contrib 内部，
  deep import 被 exports map 拒绝。

### 问题陈述（verdict 侧实证）

verdict 批次 17（2026-10-08，d54adc0）已在组合根注入 `InMemoryRateStore`——参考
实现本身被上游自测钉住，当前无风险。但 verdict 的 **Redis 化 RateStore**（触发制
队列：等二副本）落地时，按立法必须跑同一套 conformance，而宿主**没有任何合法
导入路径**。现实的坏替代只有复制粘贴语义向量——契约从此双源维护，上游演进
（如 idle 口径、asOf 语义调整）时宿主实现静默漂移，违背「契约即测试」立法本意。

四个端口中 RateStore 首先到达该节点（Redis 化是四端口里最早排期的服务化项），
但 EgressGuard / SecretResolver / ConcurrencyLimiter 的宿主实现（Redis 信号量、
租户密钥服务等）随后都会撞同一堵墙。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 包根 re-export `rateStoreConformance` | 宿主一行导入 | **conformance 文件 `import { describe, expect, test } from 'vitest'`**——根入口静态链接会把 vitest 拖进所有宿主的运行时依赖图（宿主测试框架各异：verdict 用 bun:test），且 vitest 仅是 zen-udf devDep。除非先把套件改框架无关，否则不可行 |
| B. 新增子路径导出 `"./conformance"`（建议） | 测试专用入口与宿主运行时面隔离（仅在宿主测试代码 import 时加载）；vitest 依赖留在 devDep + optional peer 注记；**与 `./runner` 先例同构**（ADR-014 已为测试面开过非根子路径先例，消费方无新认知成本）；子路径命名留扩展位，未来 limiter/egress/secret conformance 归同一入口 | exports map 多一个公共入口（面 +1） |
| C. 不导出，宿主复制语义向量 | 上游零改动 | 契约双源、漂移风险，违背 handoff §1 立法本意 |
| D. 套件改纯数据向量（JSON fixtures）+ 宿主自带 runner | 框架彻底无关 | 重构成本大；断言语义（时钟注入、异步、跨实体隔离）难以数据化；上游自测也要跟着改 |

## 决策

**方案 B**：zen-udf 包新增测试专用子路径导出 `"./conformance"`，最小落地面：

1. `package.json` exports 增 `"./conformance": "./src/conformance.ts"`——**新增
   聚合文件**（而非直指 contrib 内部路径），公共面稳定：contrib 内部重组不破宿主；
2. 聚合文件 re-export `rateStoreConformance`（本期唯一成员；ContributionGuide
   注记：后续端口的宿主实现 conformance 落同处）；
3. vitest 依赖处置：保持 devDep + `peerDependenciesMeta.vitest = optional`
   注记；聚合入口头部注释声明「仅宿主测试代码消费」；（可选加固：宿主未装
   vitest 时动态 import 报人话错误——实施侧裁量）
4. 上游自测 `rate-store.test.ts` 可迁移为消费同一入口（去重，非必须）；
5. CONTRACT.md §7（Conformance 协议）补一行导出位说明。

verdict 侧消费形态（Redis 化批次验收口径）：

```ts
import { rateStoreConformance } from '@republicroad/zen-udf/conformance';
rateStoreConformance('RedisRateStore', (now) => new RedisRateStore(redis, now));
```

## 后果

**正面**

- handoff §1「复用同一套 conformance」从立法条文变为可执行事实；宿主端口实现
  的接入门槛客观化（套件跑绿 = 接入许可）；
- 测试面与运行时面隔离清晰（`./runner` 同构，宿主零新认知）；
- 上游契约演进时（rate/groupDistinct 语义调整），宿主实现自动被新套件钉住。

**负面 / 约束**

- 包公共面 +1 入口（以 ADR 立法约束：`./conformance` 仅收 conformance 套件，
  不作为绕过 exports 收口的通用后门）；
- vitest 成为宿主测试环境的隐式依赖（optional peer 注记缓解；宿主若用非 vitest
  框架，需装 vitest 仅为跑套件——verdict 可接受，bun 与 vitest 可共存于 dev）。

**后续条件**

- 目标版本 zen-udf 1.3.0（纯增量，无破坏）；
- verdict Redis 化 RateStore（触发制：等二副本）实施时若本 ADR 未落地，
  **先推本 ADR 发版再动工**（批次 17 交付注记已留此前置）；
- limiter/egress/secret 的宿主实现 conformance 化（现为分散语义测试）不在本
  ADR 范围，届时按同一入口逐个归拢。
