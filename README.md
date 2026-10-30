# seal-editor

**seal-editor** 是 [jdm-editor](https://github.com/GoRules/jdm-editor)（GoRules JDM，JSON Decision Model）的内部维护分支，以 **React + shadcn/ui + Tailwind + ReUI** 独立重写并深度演进的**规则决策编辑器组件库**。服务于 [verdict](https://github.com/republicroad/verdict) 实时决策引擎控制台，同时保持独立组件形态可被任意宿主消费。

> 在线示例与文档：https://republicroad.github.io/seal-editor/
> （Storybook + 文档站随 main 持续部署）

## 包结构

| 包                            | 说明                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `@republicroad/seal-editor`   | 内核：决策图编辑器（DecisionGraph）、决策表、仿真器、治理面板等                             |
| `@republicroad/seal-appshell` | 宿主壳层：SkinnedDecisionGraph 皮肤、版本历史/持久化（含自动保存）、simulate 适配、皮肤面板 |

## 安装

```bash
npm i @republicroad/seal-editor
```

## 快速上手

```tsx
import { DecisionGraph, JdmConfigProvider } from '@republicroad/seal-editor';
import '@republicroad/seal-editor/dist/style.css';

<JdmConfigProvider>
  <DecisionGraph value={graph} onChange={setGraph} />
</JdmConfigProvider>;
```

**部署形态（ADR-023）**：token 作用域在 `.seal-root` 岛内。宿主将应用（或编辑器根容器）包在 `.seal-root` 元素内即可；未挂岛的页面自 2.0 起不再获得样式（深浅主题随 provider 注入岛内）。

## 核心能力

- **决策图编辑器**：六类内建节点（input/decision table/expression/function/switch/output）+ 自定义节点注册（kind 推断、schema 驱动表单）；xyflow 画布、auto-layout（dagre）、网格吸附、画布锁、注释框
- **undo/redo 全操作栈**：节点/连线/参数/注释全操作可撤销（拖拽与会话合并、重点保持选中、⌘Z/⌘⇧Z）
- **诊断面板**：内置校验器（悬空连线/空表达式/零规则）+ 宿主 `diagnostics` 通道，250ms 防抖，错误行点击画布定位
- **仿真与调试**：simulator 单跑（服务端 handler 注入）、Run all 分层断言、运行对比（A/B + 双 diff）、执行内联回显（路径着色/数据探针/流动渐停）
- **示例体系**：单源 example-sources、schema 骨架生成、逐项改名、存为新用例、exampleId 稳定绑定
- **diff 视图**：`diffBaseline` prop 投影 + 画布内对比开关
- **快捷键体系**：⌘K 命令菜单、`?` 快捷键帮助、⌘\ 聚焦模式（画布独占）
- **函数参考面**：`functionLibraries` 注入宿主目录（monaco 补全/调试器联动）；`parameterOptions` 动态参数选项（工具参数渲染可搜索下拉，如 value_list 名单）
- **治理**：`allowedNamespaces` 谓词过滤、契约 fixtures（zen-udf conformance）、报告过期检查
- **宿主壳层（appshell）**：版本历史、`restoreVersion`、pattern-D 自动保存（防抖+CONFLICT 三选）、simulate handler 适配

## 宿主集成要点（2.0）

```tsx
<DecisionGraph
  value={graph}
  onChange={setGraph}
  // 诊断面板：宿主校验条目（与内置校验器合并，错误行点击画布定位）
  diagnostics={hostEntries}
  // 动态参数选项：命中参数的字面量输入渲染可搜索下拉（键=定位，节点级优先）
  parameterOptions={{ 'value_list.value_list/list': rosterNames }}
  // diff 投影基线：传入即对比（画布内对比开关随之出现）
  diffBaseline={baselineGraph}
/>
```

- **undo/redo**：内核全操作栈开箱即用；宿主在切换模型/恢复历史版本时调用
  `graphActions.resetHistory()` 清栈（受控回声不清栈）。
- **确认弹窗**：`App.useApp().modal.confirm` 的宿主（ConfirmHost）由
  JdmConfigProvider 单源挂载；裸 `AppProvider` 消费者须自挂 `<ConfirmHost />`。

## 本地开发

```bash
pnpm install
pnpm storybook          # http://localhost:9009
pnpm verify             # lint + typecheck（双包）+ tests
pnpm size               # bundle 预算门（raw ≤ 870kB）
node scripts/release-preflight.mjs   # 发版前全门
```

## 发版

独立版本（lerna packages/*）：手动 bump `packages/seal-editor/package.json` + 手写 CHANGELOG + `chore(release):` 触发头提交推送 → CI Publish（pnpm publish，catalog: 重写 + 已发版本守卫）→ Validate 三流。详见 `docs/design/release-verification.md`。

## 文档

- `docs/zen-reference.md` — zen 表达式语言参考（双语，探针守护）
- `docs/design/` — 活跃设计档（ADR 索引、2.0 盘点、最佳实践、上游协作）
- `docs/design/upstream/` — verdict 宿主协商档
- 破坏性变更集中在 2.0 窗口处理，见 `docs/design/two-point-oh-inventory.md`
