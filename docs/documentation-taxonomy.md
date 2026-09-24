# 文档分类指南

> 本仓文档按决策生命周期分为四类。写文档前先对照此表选形态——
> 同一问题写错了文档类型，后续追溯时会断链。

## 生命周期与文档形态

```
想法 → 提案（讨论）→ 计划（排期）→ 执行 → 决策记录（归档）
 RFC/PEP    Design Doc                 ADR
```

| 阶段 | 文档形态 | 核心问题 | 仓内位置 | 本仓实例 |
| --- | --- | --- | --- | --- |
| **提案** | RFC / PEP | "我们要做 X，为什么、怎么做、大家讨论" | `docs/rfc/`（给上游的 issue 草稿） | gorules-zen-async-context.md |
| **计划** | Design Doc / 开发计划 | "怎么建、排期、依赖、门禁" | `docs/design/`（活跃）；执行完毕移入 `docs/archive/plans/` | development-roadmap.md |
| **设计** | Design Doc（架构面） | "架构怎么分层、约束是什么" | `docs/design/` | zen-udf-multi-tenant / sync-counting / context-propagation |
| **决策归档** | **ADR** | "选了什么、为什么、放弃了什么" | `docs/adr/` | 001–006 |
| **对接规范** | Integration Spec | "消费方怎么接入、验收标准" | `docs/design/` | handoff-verdict-integration.md |

## 与业界实践的对应

| 业界实践 | 说明 | 与本仓的对应 |
| --- | --- | --- |
| **PEP**（Python） | 增强提案：语言特性/标准/流程的全生命周期治理。比 ADR 范围更广——被接受的 PEP 变成规范，ADR 只记录选型原因 | 本仓无直接对应；如果未来需要提出 zen-engine/zen-expression 语言级特性提案，形态参照 PEP |
| **Rust RFCs** | 提案→讨论→接受→实现；接受的 RFC 即规范 | 同上 |
| **Google Design Doc** | 实现前架构方案，比 ADR 范围广、更协作 | `docs/design/` 下的设计与计划文档 |
| **ADR / MADR** | 决策归档（选了什么/为什么/放弃了什么） | `docs/adr/` |
| **Y-statement** | ADR 一句话格式：*In context X, facing Y, we chose Z for A, accepting B* | 可作为 ADR 的 TL;DR 段 |

## 选用规则

| 你在做什么 | 写什么 |
| --- | --- |
| 提出一个上游（gorules 等）应修的缺陷或特性 | **Upstream Issue Draft** → `docs/rfc/` |
| 规划一轮开发（排期/依赖/门禁/决策点） | **开发计划** → `docs/design/`，执行完毕移入 `docs/archive/plans/` |
| 设计一个子系统的架构（分层/隔离/端口/约定） | **设计文档** → `docs/design/` |
| 做了一个**不可轻易撤回**的技术选型（换实现需重写或迁移） | **ADR** → `docs/adr/NNN-*.md` |
| 沉淀可复用的操作模式（跨项目/跨仓适用） | **最佳实践** → `docs/bp/` |
| 定义消费方接入规范/验收标准/命名约定 | **Integration Spec** → 对接方设计文档附录 |

## 目录规约（2026-09-24 重分类后）

| 目录 | 收什么 | 状态约定 |
| --- | --- | --- |
| `docs/` 顶层 | 双语对照的参考文档（使用指南 + 内部实现两类，见 `README.md` 分组索引） | 长期维护，与代码同步 |
| `docs/design/` | **只放活跃文档**：主线路线图、交接文档、权威设计稿、治理裁决 | 每篇文首标注状态行；执行完毕即移出 |
| `docs/adr/` | 不可撤回选型的决策归档 | accepted 后不改，只能 superseded |
| `docs/bp/` | 可复用最佳实践 | 长期维护 |
| `docs/rfc/` | 待提交上游的 issue 草稿 | 提交上游后移入 `archive/` 并注明 issue 链接 |
| `docs/archive/plans/` | 执行完毕的开发计划与执行记录 | 只读；文首状态行应已回写 shipped |
| `docs/archive/migration/` | 已完成的迁移记录 | 只读 |
| `docs/archive/research/` 等 | 历史研究与规划 | 只读 |

判定规则：新文档先进 `design/`（带状态行"plan/设计中"）；**执行完毕的当天**把状态行改为 shipped 并移入 `archive/plans/`——目录结构与状态行不一致时以目录为准修正文档。

## 反面模式

- **用 ADR 记录实现细节**——ADR 只记"选了什么+为什么"，"怎么做的"归 Design Doc
- **用 Design Doc 替代 ADR**——Design Doc 是活的（会更新），ADR 是死的（不可改，只能 superseded）
- **一份文档跨多个阶段**——提案和决策混写会导致"为什么当时选了 X"被后续计划变更淹没
- **没有决策点的纯排期文档不需要进 design/**——用 issue tracker 或 TODO 即可
