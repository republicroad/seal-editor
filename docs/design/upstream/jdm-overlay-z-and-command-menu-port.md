# jdm 移植参考包：浮层层叠裁定（Positioner z-50）+ Portal container + ⌘K 调色板

- 日期：2026-10-24
- 状态：**就绪待 jdm 评审**（协商方式沿 ADR-013 惯例，随到随落）
- 上游仓：jdm-editor（packages/jdm-editor）；本仓对应实现基线 = seal-editor **1.37.0**
- 性质：bug 修复移植（第 1/2 节同构必现）+ 功能择需移植（第 3/4 节）

## 1 · 浮层 Positioner 统一 z-50（必移植——同构 bug 必现）

### 病根

Base UI 的 `*Primitive.Positioner` 以 **transform 定位，自建层叠上下文（z: auto）**。
写在 Popup 上的 `z-50` 只在该上下文**内部**排序，出不去——外层比较发生的是
「Positioner(0) vs 页面 chrome(z≥1)」，任何 sticky/absolute 元素都会盖住浮层。
实证：dt sticky 表头（z-40）压住字段编辑浮层（Popup 名义 z-[60] 实际 0），
`elementFromPoint` 命中表头而非浮层。

### 修法（seal 1.37.0，本仓 commit 6ca37e1 + 827ae57）

z 语义落到 **Positioner 的 className**，全家族统一缺省 z-50：

| 文件 | 改动 |
| --- | --- |
| `components/ui/popover.tsx` | `<PopoverPrimitive.Positioner className={cn('z-50', positionerClassName)}>` + 新增 `positionerClassName` prop |
| `components/ui/select.tsx` | 同款（SelectPrimitive.Positioner） |
| `components/ui/tooltip.tsx` | `<TooltipPrimitive.Positioner className='z-50'>` |
| `components/ui/dropdown-menu.tsx` | 两处 MenuPrimitive.Positioner（含 sub-content） |
| `components/ui/context-menu.tsx` | 两处 ContextMenuPrimitive.Positioner |

配套：`components/primitives/popover.tsx` 的 `overlayClassName` 从 Popup 重路由到
`positionerClassName`（层叠语义归位）；Popup 自身的 z-50 保留无害。

### 三条裁定规则（评审要点）

1. **家族内 DOM 序不变**：全部等 z-50 → 回落 DOM 序裁决（后开者在上）——
   Select 下拉盖字段面板、子菜单盖父菜单等既有行为零变化；
2. **Dialog 同层（z-50）模态语义**：后开者在上（对话框后开盖浮层 ✓；对话框内
   下拉 portal 在后盖对话框 ✓——顺带治好「对话框内下拉被 z-auto Positioner
   拖到对话框之下」的潜伏问题）；
3. **单向抬升无反向风险**：z 1~49 的页面 chrome 从「盖浮层」翻转为「被浮层盖」
   ——这正是 bug 方向；z>50（edge 工具条 999/1000、toast）不动。

全仓 z 阶梯：`999/1000 edge 工具条 > 50 浮层+dialog > 40 sticky > 35 选区 >
30 pinned > 装饰`。

## 2 · 浮层 Portal container 必传（HK-14）

`*Primitive.Portal` 缺省落到 `document.body`。seal 的 ISLAND 形态下 token
定义在 `.seal-root` 作用域——body 上的弹层拿不到 `--card`/`--border`，
**背景透明、边框消失**（⌘K 调色板实证）。修法（全家惯例）：

```tsx
const sealContainer = useSealPortalContainer(); // 最近 .seal-root 祖先，undefined 回退 body
<ComboboxPrimitive.Portal container={sealContainer}>
```

- 涉及面：seal 侧共五类浮层 + Combobox（graph-command-menu 曾是唯一漏网，827ae57 补齐）；
- **jdm 适用面诚实标注**：jdm 独立应用走 LEGACY `:root` token 时 body-portal
  也能吃到变量，此 bug 不现；但 seal 1.37.0 起该参数与 ISLAND 形态绑定，
  建议随移植对齐（无害 + 未来-proof）；
- 同族坑参考：ui/popover.tsx 内 `box-border` 注释（HK-14——portaled nodes
  live outside .seal-root preflight scope）。

## 3 · ⌘K 全局调色板移植（择需）

`components/decision-graph/graph/graph-command-menu.tsx` 单组件 + dg-store
三字段（`commandMenuOpen` / `setCommandMenuOpen` / `extraCommands`）。

本会话（1.37.0）随车三点修复已包含在移植面内，移植时直接按 1.37.0 版本拿取：

1. **虚拟锚点居中**：Base UI Positioner `anchor={{ getBoundingClientRect: () =>
   new DOMRect(window.innerWidth / 2, 10, 0, 0) }}`——DOM 锚（absolute/fixed）
   的包含块会被 transform 祖先劫持且随视图漂移（画布视图 vs 节点页签视图实测
   锚点位置不同），虚拟矩形对 DOM 语境免疫；
2. **键盘高亮导航**：children 渲染模式无内建高亮——activeIndex 自管
   （ArrowDown/Up 循环 + `data-command-active` scrollIntoView + Enter 提交
   高亮项，jsdom 无 scrollIntoView 用可选链兜底）；
3. **recent 命令上浮**：localStorage `seal.dg.command.recent`（去重 cap 3，
   仅空 query 生效；执行写回在 commit() 单点）。

## 4 · 节点搜索阈值口径翻转（可选）

`graph-components.tsx` 搜索框显示阈值：seal 已从「仅自定义 >5」翻转为
**全量节点（核心 6 类 + 自定义）**——零自定义节点搜索框默认在位（8a91839）。
配套细节：口径取**未过滤**的 innerGroups（过滤后命中跌破阈值会中途卸载搜索框）。
jdm 现状与 seal 翻转前同构（customCount 口径），是否跟进由 jdm 评审裁定。

## 移植清单（供 jdm 排期）

| # | 项 | 性质 | 建议优先级 |
| --- | --- | --- | --- |
| 1 | 五件套 Positioner z-50 | bug 修复 | 高（同构必现） |
| 2 | Portal container 惯例 | 前瞻对齐 | 中 |
| 3 | ⌘K 调色板（含 1.37.0 三修复） | 功能移植 | 中 |
| 4 | 节点搜索口径 | 体验取舍 | 低（评审裁断） |
