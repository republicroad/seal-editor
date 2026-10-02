# 架构决策记录（Architecture Decision Record）

> 本目录归拢 seal-editor 仓库的架构决策。每条 ADR 记录一个**不可轻易撤回**的技术选型：
> 背景、备选方案、决策结论、后续条件。格式参考 [MADR](https://adr.github.io/madr/)（简化版）。

## 索引

| ADR | 标题 | 状态 | 日期 |
| --- | --- | --- | --- |
| [ADR-001](./001-esm-only-packages.md) | 全部发布包采用 ESM-only（不提供 CJS 双格式） | accepted | 2025-01 |
| [ADR-002](./002-zen-udf-tenant-isolation.md) | zen-udf 多租户隔离：语义三元 + 审计 journal + 构造期上下文捕获 | accepted | 2026-09 |
| [ADR-003](./003-zen-udf-cache-ownership.md) | L1 决策缓存责任归宿主（zen-engine 函数 loader 无引擎级缓存） | accepted | 2026-09 |
| [ADR-004](./004-source-direct-consumption.md) | workspace 包消费方源码直通（不经 dist 副本） | accepted | 2025-01 |
| [ADR-005](./005-zen-udf-esm-source-publish.md) | zen-udf 以 TS 源码发布（main = src/index.ts，不编译 dist） | accepted | 2026-09 |
| [ADR-006](./006-zustand-selector-equality.md) | zustand 选择器相等性：弃用 zustand/traditional，本地深比较 memoizer 取代 | accepted | 2026-09 |
| [ADR-007](./007-crypto-randomuuid-secure-context.md) | crypto.randomUUID 与非安全上下文：库内入口守卫式 polyfill，宿主侧仅作可选加固 | accepted | 2026-09 |
| [ADR-008](./008-host-experience-proposals.md) | 编辑器宿主体验增强提案：header 槽位注入/保存回调/仿真联动/bundle 基线 | accepted | 2026-09 |
| [ADR-009](./009-function-ecosystem-namespace-governance.md) | 函数生态分层与 namespace 治理：参考域/通用扩展/行业包三层 + UdfPackMeta | accepted | 2026-09 |
| [ADR-010](./010-function-catalog-tenant-filter.md) | 函数目录租户过滤接口：过滤边界分层（服务端安全边界 + 客户端体验谓词）与接口形态 | accepted | 2026-09 |
| [ADR-011](./011-zen-udf-param-declaration-evolution.md) | zen-udf 参数声明统一与 defineTool 声明体验：形态二归一 + builder 泛型推导（0.11.0 提案） | implemented | 2026-09 |
| [ADR-012](./012-zen-udf-ports-layered-design.md) | zen-udf 端口层分层设计：集中管理 vs per-tenant 覆写（ADR-011 多语言修订落地档） | accepted | 2026-09 |
| [ADR-013](./013-input-contract-design.md) | 输入节点契约统一：InputContract 数据模型 + 三视图同步 + Examples 即测试用例（原 ADR-012，与 ports 012 编号冲突改号；jdm 评审调整已落档） | accepted | 2026-10 |
| [ADR-014](./014-zen-udf-fixture-contract.md) | zen-udf 测试夹具契约：executor 反转 + smoke 语义 + 报告增强（0.13.1 已发布，§6 同步面 jdm 接受） | implemented | 2026-10 |
| [ADR-015](./015-custom-function-node-spec.md) | 自定义函数节点规范：定义/调用（位置数组→具名字典）/入参返回值标准化/编辑面兜底策略（zen-udf 0.14 提案；引擎与编辑器绝对重点面） | proposed | 2026-10 |

## 状态定义

| 状态 | 含义 |
| --- | --- |
| proposed | 已提出，待评审 |
| accepted | 已接受并实施 |
| deprecated | 已被后续 ADR 取代 |
| superseded by ADR-xxx | 被指定 ADR 取代 |

## 新建 ADR

1. 复制下方模板，命名 `NNN-短标题.md`（NNN 三位递增序号）
2. 填写完整后在上方索引表追加一行
3. 状态变更（如 accepted → deprecated）时在正文尾部追加 `## 后记` 说明原因与替代 ADR 链接

### 模板

```markdown
# ADR-NNN：标题

## 状态
accepted | proposed | deprecated（日期）

## 背景
遇到了什么问题、为什么现在需要决策。

## 备选方案
| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A | … | … |
| B | … | … |

## 决策
选了什么，为什么。

## 后果
正面/负面影响、约束、后续条件。
```
