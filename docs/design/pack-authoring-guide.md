# Pack 作者指南——专用编辑器插件体系上手（ADR-017 配套）

- 日期：2026-10-08
- 状态：**生效**（ADR-017 §2 编辑接管层已实施）
- 上位：[ADR-017](../adr/017-dedicated-editor-plugin-system.md)（立法——为什么这样裁定）、
  [custom-node-editor-spec](./custom-node-editor-spec.md)（config 键主权）、
  [dedicated-node-registry-design](./dedicated-node-registry-design.md)（存在性层——服务端目录）
- 活文档：Storybook **Decision Graph/PackAuthoring** 故事——~60 行迷你 pack
  （同 kind 双代编辑器 + tester 仲裁 + renderTab 表单），照抄即可起步。

## 0 · 一句话

**新增一个 pack 自带编辑面板 = 在 pack 内声明 spec（`renderTab` 必选、`tester`
按需），装进 `customNodes` 即自动接管——seal-editor 内核零改动、零发版。**

## 1 · 最小 pack（零新概念）

```tsx
import { createJdmNode } from '@republicroad/seal-editor';

const rosterSpec = createJdmNode({
  kind: 'roster',                      // 文档模型 content.kind——匹配身份
  displayName: '查询名单',
  group: '风险名单',
  icon: <ShieldSearchIcon className='size-4' />,
  renderTab: ({ id, disabled, node }) => <RosterTab id={id} disabled={disabled} node={node} />,
  generateNode: ({ index }) => ({
    name: `roster${index}`,
    config: { schemaVersion: 2, expressions: [] },   // 只写自己的键（§4 键主权）
  }),
  renderNode: RosterCanvasNode,        // 画布节点视觉
});

// 宿主装载
<DecisionGraph customNodes={[rosterSpec]} ... />
```

只有 `renderTab` 是插件体系的核心承诺：画布节点双击/页签打开时自动路由到它，
无 `renderTab` 的 kind 节点回退通用兜底表格（永不白块）。

## 2 · renderTab 上下文（ADR-017 M3）

| prop | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 节点 id——状态读写的锚点 |
| `disabled` | `boolean` | 编辑器禁用态——面板 MUST 据此切只读（与内建 tab 同源） |
| `node` | `{ id, name?, kind?, config? }` | 只读快照——免 hook 取初值 |
| `user` / `customFunctions` | 遗留 | 兼容字段 |

**状态桥硬纪律**：写配置必须走内核导出的管道，不得绕过：

```tsx
const { updateNode } = useDecisionGraphActions();
const config = useDecisionGraphState((s) =>
  s.decisionGraph.nodes.find((n) => n.id === id)?.content?.config);

const setQueryName = (name: string) =>
  updateNode(id, (draft) => {
    draft.content.config = { ...draft.content.config, queryName: name };
    return draft;                        // immer 回调需返回 draft
  });
```

绕过直改文档 = 撤销/自动保存/onChange 链全部断裂。

## 3 · tester 与 rank——接管仲裁（ADR-017 §2）

**优先级矩阵**（固定语义，不可由宿主改写）：

1. 内建五节点永远优先——pack 不可劫持（结构性保证，解析器只管辖 customNode 域）；
2. **kind 精确组**按 rank 降序——组内 tester 仲裁，第一个「无 tester 或 tester
   通过」者胜；
3. 精确组全部 tester 拒绝 → **跨 kind tester 组**按 rank 降序（仅显式声明了
   tester 的 spec 参与）；
4. 同 rank 按声明序；开发模式同分冲突 `console.warn`；
5. tester 抛异常 = 不匹配（单 pack 故障隔离，编辑器不倒）。

### 什么时候写 tester

| 场景 | 写法 |
| --- | --- |
| 常规 pack（一个 kind 一个编辑器） | **不写**——kind 精确匹配足够 |
| 同 kind 多代编辑器（按 config 形态分流） | 双 spec 同 kind 各带 tester：`tester: (ctx) => ctx.config.schemaVersion === 1`（v2 那个设 `rank: 10` 保新优先） |
| 按 config 形态认领未知 kind | spec 声明一个不撞车的 kind + tester 检查形态 |

```tsx
tester?: (ctx: NodeMatchContext) => boolean;
// NodeMatchContext = { kind, type, config, node }——全部只读
```

### rank 惯例

- 常规 pack：不设（= 0）；
- 兜底/兼容 pack：负值；
- 官方覆盖/新版编辑器：正值。

### 反模式（ADR-017 反模式表·作者侧三条）

- tester 退化为按名匹配（`ctx.kind === 'x'`）——用 kind 字段表达，别用谓词；
- 靠宿主数组顺序表达优先级——争抢必须显式 rank；
- 专属 Tab 整体自绘不嵌通用容器——通用能力（参数表、弃用标记）会漏跟。

## 4 · config 键主权（红线）

`content.config` 是**多写手共享区**：pack 自有键、编辑器三键
（`expressions / expr_asts / meta`）、宿主键共存。唯一安全机制 = **各写手只写
自己的键**——immer 局部变更，未知键原样保留。完整主权表见
[custom-node-editor-spec](./custom-node-editor-spec.md) §2。`config` 的形状
由 pack 的 `parametersSchema` 定义（运行时契约），编辑器 zod 刻意无感知。

## 5 · definePack——pack 级声明糖（可选）

```tsx
import { definePack } from '@republicroad/seal-editor';

const riskPack = definePack({
  namespace: 'risk',
  version: '2.0.0',
  license: 'proprietary',
  specs: [rosterSpec, matrixSpec],
  migrations: [{ from: '1.0.0', describe: '…', migrate: (config) => nextConfig }],
});

<DecisionGraph customNodes={riskPack.specs} ... />
```

- 自动给每个 spec 注入 ADR-009 meta（`origin: 'extension'` + version/license）；
  spec 已显式带 meta 的，**spec 值优先**（不静默覆盖声明）；
- `migrations` 是版本迁移链预留槽（`from` 版本锚 + 人读说明 + 纯函数
  transform）——衔接存在性层的 migrateGraph（[registry 设计档](./dedicated-node-registry-design.md) §5），
  当前为声明面预留，执行器未接入；
- 直接传 spec 数组仍然完全合法——糖不强制。

## 6 · 治理边界（宿主侧语义，pack 作者须知）

- 宿主的 `allowedNamespaces`（治理谓词）**先于**注册表解析：被过滤的 spec
  根本进不了 resolver——tester 无法复活被治理关闭的 namespace（有测试锁定）；
- pack 被过滤后其 kind 的存量节点回退兜底表格（只读不白块）；
- pack 的运行时依赖（数据源、API client）由宿主以 props/闭包注入 pack 组件——
  内核永远不知道名单从哪来。

## 7 · 验收清单（pack 交付前）

- [ ] renderTab 尊重 `disabled`（禁用态只读）；
- [ ] 写配置全部走 `updateNode` 管道，且回调返回 draft；
- [ ] config 只写自有键（对拍：装→编辑→卸 pack→键无丢失）；
- [ ] 无 renderTab 时的兜底形态可接受（不白块）；
- [ ] tester（如声明）对目标形态命中、对异形安全返回 false、抛异常不炸编辑器；
- [ ] 争抢场景已显式 rank 或确认无争抢。
