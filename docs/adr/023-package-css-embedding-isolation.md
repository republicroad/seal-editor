# ADR-023：包 CSS 嵌入隔离——dist 层化（@layer seal-editor）、LEGACY `:root` 接管退役、主题文档写受控化

- 日期：2026-10-22
- 状态：**accepted（2026-10-23 上游预评审修改后接受，实施落地——回执见文末）**。履历：proposed（2026-10-22 verdict 侧起草，待上游预评审）——生产事故三连实证驱动（verdict
  侧 2026-10-22 一次排障闭环三个根因，全部指向包 CSS/主题系统的"独立应用形态默认
  泄漏"）；宿主已落地三件兜底（见背景 §宿主兜底现状），本 ADR 提议上游治本、宿主
  兜底退役。
- 上位：`packages/seal-editor/src/styles/tokens.css` 头注 Stage A 双态设计（ISLAND
  `.seal-root` 推荐 + LEGACY `:root:not(:has(...))` 回退，Batch S / L-A
  lexical-scope hardening 路线图挂点）——本 ADR 是该路线的收尾章。
- 消费面实证仓：verdict（commits 407fa63 / ec522f8 / bf817c7，2026-10-22）。

## 背景

### 已有资产

1. **tokens.css 双态设计已立法**（Stage A 注释）：ISLAND 形态（宿主以 `.seal-root`
   包裹，provider 注入 `--seal-*`，bridge 零模式变体）为推荐形态；LEGACY 形态
   （`:root:not(:has(.seal-root))` 全局注入 + 模式分裂静态回退）为无壳页面兜底；
2. **appshell 主题系统**（`packages/appshell/src/context/theme.provider.tsx`）：
   `themePreference`（缺省 `Automatic` → `matchMedia` 系统偏好）+ useEffect 无条件
   `document.body.setAttribute('data-theme', …)` + `documentElement.classList.toggle('dark', …)`；
3. **dist 产物**：`packages/seal-editor/dist/style.css`（197KB，Tailwind v4.3.3
   独立构建，`@layer base/components/properties/theme/utilities` 完整层结构）；
   `packages/appshell/dist/style.css`（3.4KB，非 Tailwind）；
4. **宿主消费形态（verdict）**：SSR 深色控制台（next-themes 单写者）+ 路由级懒加载
   CSS + **TanStack Router hover 预加载（intent preload）——未挂载 `.seal-root` 的
   页面也会被提前注入 dist CSS**。

### 问题（生产实证，按发现顺序）

| # | 问题 | 机制 | 生产症状 |
| --- | --- | --- | --- |
| P1 | **`:root` 接管 × 预加载** | dist 内 `:root:not(:has(.seal-root)),[data-mode=light]:not(:has(.seal-root)){--background:#f5f5f5,…}` 整套浅色变量接管；无 `.seal-root` 的页面（模型详情页）hover 预加载注入即命中；暗色接管分支键在 `[data-mode=dark]`（仅编辑器画布自设）→ 恒走浅色分支 | 控制台深色主题整页翻浅；**html class 纹丝不动**（纯 CSS 层叠覆盖，class 监控陷阱抓不到） |
| P2 | **无作用域工具类 × 同名 layer 合并** | dist 与宿主同为 Tailwind v4、同名 cascade layers 按名字合并；后加载的 dist `.hidden{display:none}` 追加进同一 utilities 层、文档序反超宿主 `.lg\:flex`（shadcn 侧栏天生 `hidden lg:flex` 移动优先模式）→ sidebar/gap/inner 全部 0×0 | 侧栏整体消失（React 状态照常切换——「导航按钮无响应」实为侧栏没了）；同类 `hidden md:x` 模式宿主全站 10+ 处全中招 |
| P3 | **主题第二写者** | theme.provider 缺省 `Automatic`（系统偏好）+ useEffect 无条件写 `documentElement`/`body`；宿主浅色系统下编辑器挂载即翻浅色 | 宿主深色控制台被翻转（宿主侧 AppshellThemeBridge 桥有 resolvedTheme undefined 时序窗，只能收敛不能根除） |
| P4 | （同族备忘）Scalar 等第三方独立 CSS 同病 | 同为无作用域独立应用样式表 | verdict /debug 路由曾因 Scalar 全局样式缺失/泄漏反复排障（历史教训在案） |

### 宿主兜底现状（为什么不可长期化）

verdict 已落地三件兜底：①隐藏 `.seal-root` 哨兵（杀 P1 接管选择器）；②构建期
插件把第三方路由 CSS 包进最低优先级 `@layer seal-editor`（杀 P1+P2）；③
`AppshellThemeBridge`（缓解 P3）。缺陷：哨兵不防 P2；层插件是宿主单方构建期补丁
——**每个宿主都要重交一遍学费**；P3 只能桥接。独立应用的 CSS 形态应当天然嵌入安全，
兜底应可退役。

## 备选方案

- **方案 A（本 ADR，推荐）**：构建期 `@layer` 包裹 + LEGACY 接管退役 + 主题文档写
  受控化。CSS 原生机制，改动集中在构建产物与一个 prop。
- **方案 B**：全选择器 `.seal-root` 前缀作用域（Tailwind prefix/important 策略）。
  最强隔离，但改写面大（第三方子组件样式难穷尽）、独立应用可读性受损、产物膨胀。
- **方案 C**：CSS `@scope`。规范与浏览器支持不成熟，放弃。
- **方案 D**：维持现状（宿主各自兜底）。每宿主重交学费，放弃。

## 决策（方案 A 分解）

- **D1 · dist 层化**：`packages/seal-editor` 构建产物 `dist/style.css` 整体包裹
  `@layer seal-editor { … }`（vite build 后处理一步；源内既有 `@layer theme/base/…`
  成为嵌套子层，内部次序保留）。层顺序语义：宿主可 `@layer seal-editor;` **预声明**
  钉最低优先级（layer 顺序 = 首次声明顺序）；未预声明 = 文档序 = 与现状等价 →
  独立应用零影响。
- **D2 · LEGACY 接管退役**（✅ **已实施，2026-10-29 批① 4dd4bd7e**：两段删除 +
  provider :root 兜底退役改开发告警 + 入口告警移除 + guard strict 禁令启用；
  `data-seal-standalone` 显式形态按 2026-10-25 实证裁定**不立项**——`.seal-root` 通吃）：
  删除 tokens.css 的 `:root:not(:has(.seal-root))` /
  `[data-mode=X]:not(:has(.seal-root))` 两段（ISLAND 作用域 `.seal-root` /
  `.seal-root[data-mode]` 不变）。若存在依赖"无壳全局注入"的独立应用，提供显式
  opt-in：根元素挂 `data-seal-standalone`，接管规则改写为显式形式（如
  `[data-seal-standalone]:not(:has(.seal-root))`）——泄漏从"缺省发生"变为"显式要求"。
- **D3 · 主题文档写受控化**：`ThemeContextProvider` 新增
  `options.syncDocumentTheme?: boolean`——缺省 `true`（独立应用行为不变）；宿主传
  `false` 时 provider 不触碰 `documentElement`/`body`，仅经 context/isDarkTheme
  驱动内部主题（`.seal-root[data-mode]` 作用域）。宿主主题由宿主唯一写者
  （next-themes 等）负责，`AppshellThemeBridge` 可退役。
- **D4 · 无副作用纪律**：dist/style.css 保持纯样式（无顺序依赖）；主题相关 JS 不得
  在模块顶层触碰 `document`（现状已合规，立为检查项）。
- **D5 · 版本策略**：D2 是行为变化 → seal-editor **2.0.0**（或 1.x + 迁移注记，
  评审裁断）；D3 缺省 true 兼容，可随 1.x。
- **D6 · 宿主兜底退役**：D1+D2 落地发布后，verdict 侧哨兵与层插件退役（保留一个
  版本周期观察）。

## 实施清单

1. `packages/seal-editor`：vite build 增加产物包裹（`@layer seal-editor{…}`；注意
   剥离顶层裸 `@layer xxx;` 语句避免扰动全局层序）；
2. `packages/seal-editor/src/styles/tokens.css`：删 LEGACY 两段（或迁
   `data-seal-standalone` 显式形态）；头注双态说明同步更新为单态 ISLAND + opt-in；
3. `packages/appshell/src/context/theme.provider.tsx`：新增
   `syncDocumentTheme` prop（缺省 true），文档写收进该开关；
4. apps/storybook 自查：所有独立入口根节点已有 `.seal-root`（playground/site 等）；
5. **构建守卫（CI 断言）**：dist 产物内禁止出现 `:root:not(:has(` 模式——防回归；
6. 嵌入形态冒烟检查表（随包发布）：无 `.seal-root` 页面注入 dist 后——宿主 html
   class 不变、宿主 utilities 恒胜（`.hidden` 不反超 `.lg:flex`）、无 document 写。

## 开放问题

- 层名单层（`seal-editor`）还是分包两层（`seal-editor` / `seal-appshell`）？
  单层简单；分包粒度细但宿主要预声明两个名字。
- D3 缺省值：`true`（兼容优先，宿主必须显式关）还是 `false`（安全优先，独立应用
  显式开）？倾向 true（独立应用不升级代码不受影响），评审裁断。
- 2.0.0 还是 1.x + codemod？

## 后果

**正面**：嵌入安全成为包的默认性质而非宿主义务；hover 预加载无害化；主题回归单写者；
宿主兜底三件套可退役；P4 族（Scalar 等）获得可复制的隔离模式（同一 layer 手法）。

**负面/约束**：`@layer` 要求现代浏览器（Tailwind v4 已要求，无新增门槛）；D2 为
breaking——无壳独立应用需挂 `.seal-root` 或 `data-seal-standalone`；层化后宿主
utilities 恒胜——编辑器内部若存在依赖"后加载反超宿主"的隐式行为需自查（层内次序
保留，理论无影响，冒烟表覆盖）；`--seal-*` 变量继承机制不受层优先级影响（ISLAND
作用域声明在 `.seal-root` 祖先上，靠继承生效），已核。

## 上游预评审注记（2026-10-23，seal 会话——上游侧预评审）

### 账实核对（四项全实证）

1. ✓ P1：`tokens.css:76` LEGACY `:root:not(:has(.seal-root))` 源码在案，
   `dist/style.css` 同模式 ×1（构建产物带出实证）；
2. ✓ P2：`dist/style.css` 含无作用域 `.hidden{...}` ×1；与宿主同名 cascade
   layer 按 CSS 规范合并、文档序定胜——机制成立（`.hidden` vs `.lg\:flex`
   的移动优先模式案例典型）；
3. ✓ P3：theme.provider `Automatic` 缺省回退（:44）+ `documentElement`
   classList 写（:70）——第二写者实证；
4. ✓ 宿主兜底三件（verdict 407fa63/ec522f8/bf817c7）在案——「每宿主重交学费」
   的不可长期化判断成立。

### 三处补充（吸收后可转 accepted/实施）

1. **实施清单 #4 路径勘误 + 回归面升级**：`apps/storybook` 不存在——storybook
   在 `packages/seal-editor`（test:storybook）。自查范围 MUST 含 `.storybook/
   preview` 装饰器：若 stories 未挂 `.seal-root`，LEGACY 退役当天 storybook
   全体丢 token——**这是 D2 的最大回归面**，退役前先在 preview 挂 `.seal-root`
   并入冒烟表；
2. **D2 分两步（第三方迁移窗口）**：无壳独立应用含第三方集成者，breaking 直落
   minor 不妥——①1.x：LEGACY 保留但挂 `console.warn` 弃用告警（一次）+ 文档
   标注迁移路径；②2.0：退役。开放问题 3 的「1.x + codemod」按此两步落地；
3. **开放问题裁定建议**：①层名单层 `seal-editor` 起步（appshell dist 3.4KB
   非 Tailwind，分包粒度收益不抵宿主双预声明成本；后续可并入）；②D3 缺省
   `true`（独立应用不升级代码不受影响——与 ADR 倾向一致，赞同）。

### 结论

**修改后接受（方向正确、四项事实全实证；吸收三处补充后可转 accepted）**。
实施顺序建议：先 #4 回归面自查（storybook/独立入口挂 `.seal-root`）→ D1 层化
+ 构建守卫（#5）→ D3 → D2 分两步随 2.0。本注记即为复核基线。
