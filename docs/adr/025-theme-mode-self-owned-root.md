# ADR-025 · 编辑器色彩模式自持根与单通道 theme prop（proposed）

- 状态：**proposed**（verdict 宿主 2026-10-31 明暗验收暴露的装配缺口为其直接诱因；起草 seal-editor 会话）
- 关联：ADR-023（包 CSS 嵌入隔离——本 ADR 继承其岛作用域与层化立法，重画模式归属）、
  verdict 提案 upstream-2point0-theme-mode-passthrough.md（①②为**过渡态补丁**，被本 ADR 终态覆盖）

## 1 · 问题：两个月五轮往返的病史

自 1.35.1（层化事故复版）至 2.0.0 发布后验收，色彩模式机制经历五轮返工：

| 轮 | 事件 | 暴露的结构缺陷 |
| --- | --- | --- |
| 1 | 1.35.0 发布产物漏层化（prepublishOnly 裸构建覆盖包裹层） | 构建管线与 token 作用域强耦合 |
| 2 | verdict 哨兵/层插件值守期（LEGACY 双轨并存） | 同一 token 两套作用域规则并存 |
| 3 | 2.0 LEGACY 退役（provider 要求 .seal-root 祖先） | **岛根元素由宿主提供**——类名/挂载点错一处全盘失色 |
| 4 | verdict 明暗验收：暗模式节点色彩缺失 | SkinnedDecisionGraph/DecisionGraph 全链路不内嵌 JdmConfigProvider，缺省上下文静默生效 |
| 5 | verdict 明亮模式半翻转（透明表面透出宿主 #app 深底） | kernel 存在硬编码表面 + 宿主存在不翻转的透明表面，双向失配 |

**共性根因（机制层）**：编辑器的「模式」存在**三个持有者、两套表示、零个法定所有者**——

- data-mode 属性（CSS 消费面，写在宿主提供的岛根上）；
- ThemeModeContext（JS 消费面，来自 JdmConfigProvider，需要宿主挂载）；
- document 级写入（html.dark / body[data-theme]，LEGACY 遗产，D3 后受控但未消除）。

加上**岛根由宿主提供**这一结构设定，每次集成（storybook/standalone/appshell 页/verdict）都要
重新协商一遍「谁写 data-mode、谁挂 Provider、类名叫什么」——ping-pong 是结构必然而非执行失误。

## 2 · 业界收敛点（对标）

| 库/编辑器 | 机制 | 对本仓的启示 |
| --- | --- | --- |
| **React Flow v12**（本仓直接依赖） | `colorMode="light" \| "dark" \| "system"` **prop**，组件自持根元素并写自身 data-color-mode；`system` 内建 matchMedia | 同品类、同栈的官方答案——嵌入编辑器的模式就该是一个 prop |
| **Monaco** | `theme: 'vs-dark' \| string` prop，主题 CSS 自包含且限定在编辑器容器内 | 重型嵌入编辑器通用：主题=prop，样式自持 |
| **shadcn/Radix 生态** | 语义 CSS 变量 + **单一祖先 class（`.dark`）** 切换；库组件与宿主组件共享同一组变量 | 单一事实源的威力：一个属性、零 JS、库与应用自动同翻——我们的分叉恰是多持有者 |
| **MUI v6 CssVarsProvider** | 库自持 scoped root + `useColorScheme`；支持多实例、SSR、`colorScheme='system'` | 自持根 + system 语义的完整参考实现 |
| **Web Components 系（Shoelace/Lightning）** | 纯 CSS 变量继承，零 JS 模式耦合 | 下限保障：任何机制都不应劣于「纯变量继承」 |

**收敛结论**：嵌入型编辑器的业界终态 = **①组件自持根元素，②单一 theme prop（含 system），③组件内所有表面只消费自持根上的 token**。没有任何主流库要求宿主「提供一个带特定 class 的祖先 div + 自己挂主题 Provider + 自己写 data-mode」。

## 3 · 决策（proposed）

### D1 · 自持岛根（self-owned island root）

`DecisionGraph` 自行渲染 `<div class="seal-root" data-mode={resolved}>` 作为最外层元素
（SafeBoundary 内、`.seal-dg` 之外）。JdmConfigProvider 的容器解析从 `closest('.seal-root')`
改为**同一 ref**（不再查询 DOM）。

- 宿主不再需要提供岛根 div/类名——「类名错一处全盘失色」这类 bug 结构性消失；
- 高级作用域（多岛/嵌套岛）保留逃逸口：`container?: HTMLElement` prop 显式外挂；
- 迁移期兼容：宿主已挂的 `.seal-root` 祖先继续生效（内层自持根优先，外层作纯 CSS 作用域冗余无害）。

### D2 · 单通道 theme prop（含 system）

`DecisionGraph` / `SkinnedDecisionGraph` 增 `theme?: 'light' | 'dark' | 'system'`（缺省 **'system'**）：

- `'system'`：内核 matchMedia 解析并监听（跟随宿主系统/宿主在根上写的 `color-scheme`）；
- 显式值：组件自持根写 `data-mode`，token 表随之；
- **唯一模式通道**：context 不再决定 data-mode（context 降级为「读态」，供 JS 消费）；
  document 写入维持 D3 受控（syncDocumentTheme=false 语义不变）；
- verdict 提案 ①（theme 透传口）= 本决策的 prop 面；提案 ②（内嵌 Provider）= 配合实现，
  Provider 仍挂（Toaster/ConfirmHost/i18n 依赖它），但**不再承担模式写入职责**。

### D3 · 表面 token 单源硬约束（防复发机制）

- lint 规则（eslint no-restricted-syntax 或专项脚本入 preflight）：kernel 源禁止
  `bg-white` / `bg-black` / 任意 `#hex` 非变量底色（白名单：代码块预览等语义底色）；
- storybook 双模式视觉测试入交互套件（chromatic 或 play 断言：`[data-mode]` 两态下
  各 `[grid-area]` 表面 computed background 必须来自 seal token）；
- verdict 宿主的 `#app` 深空底问题即被此规则在源头拦截（透明表面无底可透）。

### D4 · appshell 层定位收缩

ThemeContextProvider 保留（偏好持久化/换肤/三态开关），但内部改为**把解析结果经 D2 的
theme prop 传给 kernel**，不再经 JdmConfigProvider 双写 data-mode；skins 继续经 seeds/token 通道。

## 4 · 后果

**正向**：宿主集成面从「四项协调（类名+Provider+data-mode+document 写）」收敛为「一个 prop（可选）」；
模式通道单一化后 ping-pong 结构性不可能；跟随系统成缺省；多实例/嵌套岛天然支持（每实例自持根）。

**代价/风险**：

- 渲染结构变更（kernel 多一层自持根）——`[grid-area]` 布局、portal container、
  `closest('.seal-root')` 类消费面需逐一迁移（一次成本，估 1–2 天含回归）；
- 已挂外层 `.seal-root` 的宿主（verdict/storybook）出现**双层嵌套岛**——CSS 上无害
  （token 同值幂等），但 data-mode 双写需以「内层 authoritative」收口；
- `'system'` 缺省对「宿主已有显式主题系统」的场景是行为变化——迁移注记：宿主应显式传值。

## 5 · 迁移批次（草案）

| 批 | 内容 | 版本 |
| --- | --- | --- |
| M1 | D2 prop 面（theme/theme 透传，即 verdict 提案 ①+②落地）+ 契约测试 | 2.1.0 |
| M2 | D1 自持根迁移（kernel dg.tsx + portal container ref 化 + 双写收口） | 2.2.0 |
| M3 | D3 lint/视觉测试硬约束 + 全仓硬编码底色清零 | 2.2.0 |
| M4 | appshell D4 收缩 + 迁移注记（宿主 data-mode 直写标 deprecated） | 2.2.0 |

## 6 · 评审请求（verdict 宿主）

- D1 自持根与宿主贴边布局（`h-full w-full`）的兼容确认；
- `'system'` 缺省 vs 显式缺省的取舍；
- M2 双层嵌套岛的 CSS 幂等论证复核。
