# Seal Editor — Internal Fork Documentation / 内部维护文档索引

> **Live storybook (interactive demo) / 在线演示:** https://republicroad.github.io/seal-editor/storybook/
> **Documentation site / 文档站:** https://republicroad.github.io/seal-editor/docs/
> **Site landing / 站点入口:** https://republicroad.github.io/seal-editor/

> **Fork notice / 分叉声明**
> This repository is an internally maintained fork of [gorules/jdm-editor](https://github.com/gorules/jdm-editor).
> Baseline: upstream `master` at commit `283bb11` (`chore(release): publish`). The fork intentionally diverges
> from upstream (ReactFlow 12, shadcn/ui + ReUI stack, Base UI) and will not track upstream merges.
>
> 本仓库是 [gorules/jdm-editor](https://github.com/gorules/jdm-editor) 的内部长期维护分叉。
> 基线为上游 `master` 提交 `283bb11`。本分叉按既定技术栈路线演进,不同步上游。

## 如何使用本索引 / How to read this index

文档按**受众**分四组,每组内标注状态:

- ✅ **现行** —— 长期维护,与代码保持同步
- ✅ **现行(历史注记)** —— 结论有效,但文中含已完结的历史叙述
- 📦 **归档** —— 历史记录,只读,不再更新
- ⚠️ **已取代** —— 被后续文档覆盖,仅作存档

English files are canonical; `.zh-CN.md` files are translations kept in sync.
英文文档为准,`.zh-CN.md` 为同步维护的译文。

---

## 一、使用指南 / Guide(面向使用者:怎么用)

| Document / 文档 | 语言 | 状态 | Contents / 内容 |
|---|---|---|---|
| [`features.md`](./features.md) / [`.zh-CN`](./features.zh-CN.md) | EN + 中文 | ✅ | 内核公开功能:DecisionGraph 六种内置节点、DecisionTable、表达式/函数编辑器、公共 API 速查 |
| [`nl-expression-builder.md`](./nl-expression-builder.md) / [`.zh-CN`](./nl-expression-builder.zh-CN.md) | EN + 中文 | ✅ | 决策表"业务视图":fieldType schemas、字典、操作符→表达式规范形态、WASM 运行时契约 |
| [`i18n.md`](./i18n.md) / [`.zh-CN`](./i18n.zh-CN.md) | EN + 中文 | ✅ | 国际化:Provider 接入、useT/createT、en+zh-CN 词条表(键奇偶由测试锁定)、回退链、插值 |
| [`storybook.md`](./storybook.md) / [`.zh-CN`](./storybook.zh-CN.md) | EN + 中文 | ✅ | Storybook 指南:配置、装饰器、story 清单(计数随特性滚动,以实际 Storybook 为准)、交互测试流水线、高度链 |
| [`appshell.md`](./appshell.md) / [`.zh-CN`](./appshell.zh-CN.md) | EN + 中文 | ✅ | seal-appshell 参考消费者壳:自定义节点(四个)、registry 与协议、皮肤系统、持久化契约 |
| [`host-migration-guide.md`](./host-migration-guide.md) / [`.zh-CN`](./host-migration-guide.zh-CN.md) | EN + 中文 | ✅ 历史注记 | 宿主从 `@gorules/jdm-editor` 迁移:快速切换、破坏性变更表、`--grl-*` 契约(0.x 时代叙述为历史记录) |

## 二、内部实现 / Internals(面向贡献者:怎么建的)

| Document / 文档 | 语言 | 状态 | Contents / 内容 |
|---|---|---|---|
| [`architecture.md`](./architecture.md) / [`.zh-CN`](./architecture.zh-CN.md) | EN + 中文 | ✅ | 系统架构:monorepo 布局(三包两应用)、包依赖、状态流、编辑器基础设施、主题系统、CI |
| [`editor-engines.md`](./editor-engines.md) / [`.zh-CN`](./editor-engines.zh-CN.md) | EN + 中文 | ✅ | CodeMirror 6 vs Monaco:场景矩阵、四个决定性选型维度、共享 token 主题契约 |
| [`styling-scss-vs-tailwind.md`](./styling-scss-vs-tailwind.md) / [`.zh-CN`](./styling-scss-vs-tailwind.zh-CN.md) | EN + 中文 | ✅ 历史注记 | SCSS→Tailwind 迁移决策记录(迁移已完成,SCSS 层与 sass 依赖已移除) |
| [`bundle-analysis.md`](./bundle-analysis.md) | EN | ✅ 历史注记 | index.js 产物构成、Monaco peer 化依赖模型、拆包决策(2026-09-08 快照,可重生成) |
| [`pnpm-workspace-linking.md`](./pnpm-workspace-linking.md) / [`.zh-CN`](./pnpm-workspace-linking.zh-CN.md) | EN + 中文 | ✅ | pnpm workspace 链接机制:symlink 与 peer-variant 克隆、硬链接冻结循环、取证命令 |
| [`troubleshooting.md`](./troubleshooting.md) / [`.zh-CN`](./troubleshooting.zh-CN.md) | EN + 中文 | ✅ | 排查案例档案(持续追加):高度链、Radix 值强转、sideEffects 摇树、pnpm 冻结、Base UI 陷阱 |

## 三、流程与决策 / Process(怎么决策的)

| 位置 | 状态 | Contents / 内容 |
|---|---|---|
| [`documentation-taxonomy.md`](./documentation-taxonomy.md) | ✅ | 文档分类法与目录规约(写文档前先读) |
| [`glossary.md`](./glossary.md) | ✅ | 域术语对照表(JDM 模型 / zen-udf / 端口 / 工具链) |
| [`adr/`](./adr/README.md) —— 6 条 | ✅ accepted | 架构决策归档:ESM-only、源码直通、zen-udf 租户隔离/缓存归属/源码发布、zustand 选择器 |
| [`bp/`](./bp/README.md) —— 10 篇 | ✅ | 可复用最佳实践:哨兵测试、conformance 套件、缓存归属、跨仓源码桥等 |
| [`rfc/`](./rfc/) —— 3 篇 | ✅ 待提交 | 上游 issue 草稿:zen 异步上下文、ReUI ToggleGroup 风格错配、rolldown-plugin-dts OOM |

`design/` 只保留**活跃**文档(7 篇);执行完毕的计划一律移入 `archive/plans/`:

| Document / 文档 | 状态 | Contents / 内容 |
|---|---|---|
| [`design/development-roadmap.md`](./design/development-roadmap.md) | ✅ | **主线路线图**(v1.1.0 基线):短/中/长期规划、verdict 联动、旧仓定位 |
| [`design/handoff-verdict-integration.md`](./design/handoff-verdict-integration.md) | ✅ | verdict 接入交接:三包基线、四端口 conformance、model-execute 组装规范 |
| [`design/zen-udf-multi-tenant.md`](./design/zen-udf-multi-tenant.md) | ✅ | zen-udf 多租户权威设计:L0–L3 分层、缓存键、失效广播契约 |
| [`design/zen-udf-context-propagation.md`](./design/zen-udf-context-propagation.md) | ✅ | ExecContext 跨 TSFN 边界:已 shipped 现状 + 原生传播上游提案 |
| [`design/zen-udf-sync-counting.md`](./design/zen-udf-sync-counting.md) | ✅ | 同步硬实时计数调研:一致性三档、HAProxy stick table、存储选型 |
| [`design/code-block.md`](./design/code-block.md) | ✅ 待消费 | reui code-block(Shiki)设计:已安装未消费,首次集成留给 verdict dashboard |
| [`design/upstream-contribution-plan.md`](./design/upstream-contribution-plan.md) | ✅ | 上游贡献治理裁决:贡献线由宿主手动执行,本仓不回馈上游 |

## 四、历史归档 / History(📦 只读)

| 位置 | Contents / 内容 |
|---|---|
| [`archive/plans/`](./archive/plans/) —— 18 篇 | 执行完毕的开发计划与执行记录:zen-udf U/V/W/X/Y/Z/AA/BB/CC/DD 十一轮系列、Base UI 迁移、皮肤布局槽位、ReUI flow 试点与融合、playground UDF Lab、verdict-weave 迁移(⚠️ 被"新建 seal-editor 仓"裁决取代)、verdict 接入旧指南(⚠️ 被 handoff 文档 0.6.0 基线覆盖) |
| [`archive/migration/`](./archive/migration/) —— 5 组 | 迁移记录:ReactFlow 12、antd→Tailwind+shadcn/ReUI、迁移后回归修复、React 19、dnd-kit |
| [`archive/research/`](./archive/research/) | 研究存档:CodeMirror 主题迁移、grl-var-flatten、React Compiler PoC、shadcn 换肤路线图、storybook 高度链 |
| [`archive/hostapp/`](./archive/hostapp/) · [`archive/roadmap-0.3.0.md`](./archive/roadmap-0.3.0.md) | 早期 hostapp 规划与 0.3.0 路线草案 |

---

## CI / Release / 快速命令

| 操作 | 命令 |
|---|---|
| 全量本地门禁 | `pnpm verify` |
| 样式债务预算 | `pnpm lint:debt` |
| 文档死链检查 | `node scripts/check-doc-links.mjs` |
| Playwright 探针(UI 冒烟) | `pnpm test:probes` |
| npm 安装冒烟 | `pnpm test:npm-smoke` |
| Storybook 交互套件 | `pnpm --filter @republicroad/seal-editor test:storybook` |
| 双宿主冒烟 (React 18+19) | `pnpm test:consumer` |
| Bundle 尺寸检查 | `pnpm size` |
| 版本发布触发 | `git commit --allow-empty -m "chore(release)" && git push` |
| 版本号升级 | GitHub Actions → Version → Run workflow → 选 patch/minor/major |

详见 [CONTRIBUTING.md](../CONTRIBUTING.md) CI Workflows 一节。

## Quick facts / 快速事实

- Main deliverable: `@republicroad/seal-editor` — React component library for JDM (JSON Decision Model) editing.
  主要产物:`@republicroad/seal-editor`,用于编辑 JDM(JSON Decision Model)的 React 组件库。
- Support packages (`@gorules/lezer-zen`, `@gorules/lezer-zen-template`, `@gorules/zen-engine-wasm`)
  are consumed **from npm**, not from this repository.
  支撑包(`@gorules/lezer-zen`、`@gorules/lezer-zen-template`、`@gorules/zen-engine-wasm`)直接取自 npm,不在本仓库内维护。
- Stack / 技术栈:React 19 (peer `>=18`) · Tailwind CSS + shadcn/ui primitives (Base UI) · zustand 5 · @xyflow/react · CodeMirror 6 · Monaco · TanStack Table · Vite 8 (Rolldown) · Storybook 10 · Rust/WASM engine bindings.
- Host integration / 宿主接入:Consumers wrap their app in a `.seal-root` container to opt in to the scoped mini-preflight (form controls, tables, headings, lists, images). The reset uses `:where()` (zero specificity) so component classes always win and never leak into the host document.
  消费方在最外层容器挂 `seal-root` 类以启用库作用域 mini-preflight(表单控件、表格、标题、列表、图片)。重置规则全部使用 `:where()`(零特异性),组件类天然胜出,不会泄漏到宿主文档。
