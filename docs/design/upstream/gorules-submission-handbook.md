# gorules/zen 上游提交手册（W4 + 静默降级双 issue）

状态：**提交决策包就绪**（2026-10-12 立）——两份正文 paste-ready，提交动作归宿主手动；提交后按 §4 回填。
关联：[rfc/gorules-zen-async-context](../../rfc/gorules-zen-async-context.md) ·
[rfc/gorules-zen-silent-row-drop](../../rfc/gorules-zen-silent-row-drop.md) ·
[zen-reference](../../zen-reference.zh-CN.md) §6/§7 · ADR-014

## §1 双 issue 一览

| # | 标题方向 | 正文 | 证据锚点 | 性质 |
| --- | --- | --- | --- | --- |
| W4 | customNode 回调异步上下文丢失（Node ALS × Python contextvars） | rfc §3 英文正文 | 双运行时探针 + 生产回归 | 行为缺陷（多租户隔离/OTel/日志全线断裂） |
| SRD | 表达式引用失败静默降级（丢行/缺键/null） | rfc §2 英文正文 | `$` 绑定矩阵 + 夹具 ×3 + 探针（CI 常态化） | 行为缺陷（fail-visible 提案，非 fail-fast） |

两案无依赖，可同日双提；目标仓库均 gorules/zen。

## §2 提交顺序建议

推荐 **SRD 先、W4 后**（间隔 1-2 天）：

- SRD 证据自包含（最小复现图 JSON 贴 issue 即可复现）、修复面小（trace 诊断/
  warnings 数组/文档化三档任选），容易先建立"这家 fork 的报告带完整实证"的信誉；
- W4 影响面大（customNode 执行模型），紧随其后趁信誉热度提交；
- 若上游维护者偏好逐周处理，双提亦无冲突（不同子系统）。

## §3 预期上游反应三案与应对

| 反应 | 应对 |
| --- | --- |
| **接受** | 跟进 upstream PR（若上游邀稿）：SRD 按其偏好落在 rust 求值层或 trace 层；W4 按 Node/Python 拆两个 PR |
| **拆分** | 按上游切分意见重开 issue（W4 文档已预写 Node/Python 可拆互链） |
| **要复现仓 / 拒收** | SRD：提供 seal-editor 仓探针与夹具路径（公开仓可直接引）；W4：提供 zen-engine-contextvars-demo.py 独立复现。拒收则 rfc 转长期挂起，宿主侧缓解现状状（ALS 保留键通道 / 编辑器静态提示）持续有效 |

## §4 提交后本仓回填动作（机械清单）

1. rfc 档头状态 `paste-ready` → `已提交`（附 issue 链接与日期）；
2. zen-reference §6 跟进记录补一行（SRD 而言）；
3. W4 提交即解冻 zen-udf W4 项（jdm 仓 CC5 稳态清单）——触发 EE 建议 §5 EE3；
4. 上游有动作（回复/合入）时在 §1 表补"上游状态"列。

## §5 zen-udf EE 建议书（交接稿——jdm 线裁决后落 docs/design/zen-udf-plan-ee.md）

> 背景：U–DD 字母系列全部 shipped，1.4.0（OQ3）后在架；CC5 稳态三项中 W4/Z6 挂起。
> 本建议书供 jdm 线裁决，非 seal 会话执行项。

| 期 | 内容 | 前置 |
| --- | --- | --- |
| EE1 | 双上游 issue 提交（§1）| 宿主口令 |
| EE2 | Z6 子 span 复查（上游是否已修，未修则转 issue 询问） | 无 |
| EE3 | ALS 原生传播预研：W4 被上游接受后，评估"输入保留键通道 → 原生上下文绑定"迁移面（zen-udf-context-propagation.md 提案节已有底稿） | EE1-W4 上游受理 |
| EE4 | verdict U10 metrics 对接增量：CC3 命名约定表 → verdict 聚合口径落 verdict-zen-udf-integration 附录 | verdict 线节奏 |
| EE5 | verdict-007 迁移的配套观察：verdict 侧切 1.4.0 求值器后，conformance 套件（ADR-018 `./conformance` 导出）补求值器契约断言的消费反馈 | verdict-007 落地 |

裁决点建议：EE1 即刻可做；EE2 顺手；EE3/EE4/EE5 各等前置信号，不预排工期。
