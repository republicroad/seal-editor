# ADR-009：函数生态分层与 namespace 治理——参考域/通用扩展/行业包三层

## 状态
accepted（2026-09-29，verdict 起草、用户主导裁定；前置：ADR-008 L7 已实施——zen-udf 0.8.0 分发组合能力）

## 背景

zen-udf 的函数生态正在出现三类共存的内容：

1. **参考域**（开源，随 zen-udf 分发）：crypto/datetime/rate-window/validate-cn 等
   14 域 22 工具——通用、无业务逻辑，是机制协议的参考实现；
2. **通用扩展**：表达式语言标准库补齐（zen-expression-ext：lgEq/strSubstring/
   strFormat/numClamp/arrFirst/arrLast/arrJoin/distinct）、http/notify/编码类——
   通用但可能先在宿主仓孵化，稳定后回流开源（velocity 规划已确立此模式）；
3. **行业包**（未来）：风控 velocity、金融费率、电商营销等**随客户行业场景演进、
   不适合开源**的算子与节点。

三类内容共用同一套机制（注册/分发/schema/conformance/文件协议），但带来三个
治理问题：开源边界如何划分；namespace 如何立法防撞；目录视图如何统一并区分
来源。现行 `UdfPack` 无元数据、注册无撞名检测，行业包一旦出现即裸奔。

## 业界范式

| 范式 | 机制 | 本 ADR 对应 |
| --- | --- | --- |
| PostgreSQL 扩展 | core 内建 + `CREATE EXTENSION`；扩展对象进独立 schema；`pg_catalog` 保留给核心 | 参考域 vs 行业包；namespace 保留前缀 |
| K8s API groups | core group 保留 + 命名 group 带组织前缀（`apps/v1`）；组名即隔离边界 | 行业包强制 `{pack-id}.{domain}` 前缀 |
| VS Code | 内置命令 + 扩展命令（`extension.command` 强制前缀）；统一命令面板聚合 | 目录统一视图 + 来源徽标 |
| MCP | 多 server 各自暴露工具，客户端聚合视图；无跨 server 冲突 | 多 pack 聚合下发 |

共同原则：**机制开源、内容分层；namespace 描述能力，不描述批次/来源**；聚合视图
对消费方无差别，来源与治理凭元数据。

## 决策

### 1 · 三层生态位与开源边界（内容由内容决定）

| 生态位 | 例 | 开源 | 代码归属 |
| --- | --- | --- | --- |
| 参考域 | crypto/datetime/validate-cn/…（14 域） | ✅ | zen-udf 仓 |
| 通用扩展 | zen-expression-ext、http/notify/编码 | 孵化期宿主仓 → 稳定后回流 | verdict 仓 → 可回流 zen-udf |
| 行业包 | `verdict.risk`、`verdict.finance`（velocity 等） | ❌ 永不开源 | verdict 私有仓 / 私有 npm 包 |

机制开源、内容分层是 ADR-0001（公开库仓/私有产品仓分离）在函数生态的投影。
回流时 **namespace 不变**——namespace 与代码位置解耦，消费方零影响
（zen-expression-ext 为首例：现居 verdict 仓，回流后仍叫 zen-expression-ext）。

### 2 · namespace 立法

- **保留前缀**：`zen` / `core` / `reference` / `builtin` 保留给 zen-udf 本体与
  参考域；禁止行业/宿主包使用；
- **宿主通用扩展**：单词能力域名（zen-expression-ext 先例）或 `{host}.` 前缀；
- **行业包强制前缀**：`{pack-id}.{domain}`（如 `verdict.risk`、`acme.fraud`）；
- **撞名检测**：注册时函数名跨 namespace 重复 → deploy 期失败（对齐 packChecks
  「契约即测试」取向），除非显式声明 overwrite；
- **禁止过程标签**：namespace 描述能力，不描述批次/客户（t1 → zen-expression-ext
  为反例正例对；批次信息只活在覆盖矩阵文档）。

### 3 · UdfPack 元数据（统一视图的数据基础）

```ts
interface UdfPackMeta {
  origin: "reference" | "extension" | "industry"; // 目录来源徽标
  version: string;                                // 目录过期提示
  license?: "oss" | "proprietary";                // 治理面可见
}
```

`UdfPack` 增加可选 `meta?: UdfPackMeta`；`udfFunctionSchemaNamespaces()` 与
文件协议信封透传；编辑器目录渲染来源徽标（官方/扩展/行业），并预留**租户级
目录过滤**挂点（归属 appshell 治理线，见函数生态治理文档 §0）。

### 4 · 统一视图与统一 API（现状即达标，立法固化）

- 注册：`registerUdf` / `registerTools` / `defineContrib` / `defineToolFor` 四态
  并存（机制不变）；
- 分发：单 zenEngine + 单 customHandler + 注册表按函数名分发（ADR-008 L7 组合
  能力生效后，宿主协议 handler 经 decline 委托与 UDF 分发共存）；
- 视图：`udfFunctionSchemaNamespaces()` 聚合全部已注册域（不区分来源）→
  `/api/custom-nodes/schema` 动态下发 + host-functions.json 文件协议（L5）双通道；
- 多引擎按 handler 切分为反模式（L1 缓存碎片化/发布 N 倍/内存 N 倍）——单实例
  内部分发是架构红线。

## 实施清单（分归属）

| # | 项 | 归属 | 触发 |
| --- | --- | --- | --- |
| 1 | `UdfPackMeta` + 注册撞名检测 | zen-udf | ✅ 已实施（2026-09-29，jdm-editor 仓 701ee190，0.9.0——保留前缀立法/跨包撞名报错列出冲突方/overwrite 接管/参考域 origin 标记；两条验收注记均落地） |
| 2 | 文件协议信封/动态端点透传 meta | appshell + 宿主 | ✅ 已实施（jdm-editor 仓 106b8609，appshell 0.14.0——parse 守卫为形状检查天然透传；containerPlan→planToJdmNode 链路） |
| 3 | 目录 origin 徽标 + 租户过滤挂点 | appshell | ✅ 已实施（同上——kernel GraphComponents REF/EXT/IND 徽标 + tenantFilter 挂点（治理线实现语义）；UDF Lab 实测 14/15 命名空间带标） |
| 4 | verdict 升级（seal-editor 1.8.0 + zen-udf 0.8.0） | verdict | 8.2 收官后 |
| 5 | `@verdict/pack-*` 行业包骨架（模板 + packChecks + 导出 CLI 纳管） | verdict | ✅ 骨架已落地（2026-09-30，verdict 仓 6f97af1——registerPack 校验器（点分强制 + 保留前缀含 `default` 拒绝）+ `_template/` 三步工作流 + `packs/index.ts` 唯一纳管清单（运行时 `src/index.ts` 与导出 CLI 双接入）+ packChecks/目录/meta 透传守卫测试）；首个真实行业包出现时在清单加一行 import 即生效 |

## 实施加强注记（2026-09-29 业界范式对照，jdm-editor 会话补充）

两条业界惯例，作为实施清单 **#1** 的验收形态约束：

1. **撞名检测的报错须列出冲突方**——npm/Terraform 的注册错误都指明冲突对象
   （形如 `namespace 'crypto' already registered by reference-domains`）。
   zen-udf 0.9.0 的撞名错误信息应带「冲突 namespace + 已注册来源包」，否则宿主
   排障需要翻注册表逐包比对；
2. **UdfPackMeta 遵守最小化纪律**——只放目录渲染与过滤需要的字段
   （origin/version/license 即最终集），不收描述类内容（description/title 各有
   归属）。Grafana 插件 manifest 的教训：元数据字段一旦发布即成为兼容性
   surface，膨胀后的迁移成本极高——宁可后加，不可先滥。

## 包面缺口注记（2026-09-30，verdict 骨架实施时发现）

`UdfPackMeta`（register.ts 定义）与 `reservedNamespaceViolation` /
`RESERVED_NAMESPACE_PREFIXES`（ADR-009 立法的权威实现）均**未从 zen-udf 包根
导出**（0.10.0）。宿主实现 registerPack 时只能本地镜像类型 + 手抄保留前缀表
（verdict 仓 `apps/api/src/udf/packs/register.ts` 即此形态，且额外禁用
`default`——schema 无 namespace 时的回退组，行业包不应占用）。建议下次发版
补三者的根导出，宿主侧收敛到单一事实源；`default` 是否入官方保留清单一并裁定
（verdict 侧已按「禁用」执行，上游若采纳即为立法对齐，若否决则 verdict 收窄回
四前缀）。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 三层生态位 + namespace 立法 + pack 元数据（本 ADR） | 防撞有法、视图可治、开源边界清晰 | 元数据字段与注册校验为增量改动 |
| B. 单层扁平 + 纯命名约定（无保留前缀/无检测） | 零改动 | 撞名运行期才炸；目录无来源语义；行业包污染开源域 |
| C. 多 UdfRegistry 实例隔离（每来源一个 registry + 多 runtime） | 物理隔离彻底 | 缓存碎片化/发布 N 倍/内存 N 倍——反模式（见 ADR-008 L7 背景） |

## 后果

- 正面：行业包可安全私有化而不破坏统一目录；namespace 防撞前移到 deploy 期；
  目录来源可治（徽标/过滤）；回流机制有名分（zen-expression-ext 首例）
- 负面/约束：`UdfPackMeta` 为 zen-udf 增量字段（0.9.0 候选）；宿主升级
  （1.8.0 / 0.8.0）前 L6/L7 能力对 verdict 不可见；
- 中性：行业包命名带组织前缀会稍长——可读性换防撞，值得；
- 回流提案（zen-expression-ext）与 velocity 包回流沿用本 ADR 的 namespace
  不变原则。
