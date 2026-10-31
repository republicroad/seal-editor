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

---

## 7 · 评审记录

### verdict 宿主评审（2026-10-31，全文）

**总体立场：支持 proposed → accepted。** D1-D4 与宿主提案
（upstream-2point0-theme-mode-passthrough.md）①②同向且更彻底——自持根把「模式写入
权」从宿主协调项升级为组件所有权，结构性消除五轮病史的复发土壤。§1 病史表与 verdict
侧实机取证完全互洽（双写竞争 / Jdm 覆写 data-mode / 硬编码底三层叠加，本会话逐层
取证实录在案）。

#### §6 三个评审请求逐条回应

**R1 · D1 自持根 × 宿主贴边布局——兼容确认 ✓（附三个条件）**

verdict 贴边形态：挂载 div `seal-root h-full w-full overflow-hidden`（批次 30c，画布贴
屏缘无圆角），高度链 = workspace main(h-svh flex-col) → div.min-h-0.flex-1 → 岛根。

1. **自持根缺省零布局样式**（仅 class="seal-root" + data-mode），高度/宽度完全由宿主
   容器链保证；若自持根不透传样式，建议 D1 规格提供 `className`/`style` 透传——
   verdict 的 `overflow-hidden`（画布溢出裁剪）需要落在自持根或其直接父级；
2. **全屏兼容确认**：verdict 全屏目标 = verdict 自己的 main 元素（Fullscreen API），
   自持根在全屏元素子树内 h-full 链不断——无特殊处理需求（已实证：1.x 岛根同位置
   全屏正常）；
3. 迁移动作（verdict M2 时）：删外层 .seal-root div，h-full/overflow-hidden 迁至
   自持根透传或保留外层为纯高度容器。

**R2 · 'system' 缺省 vs 显式缺省——库缺省 'system' ✓，verdict 永远显式传值**

- 库缺省 'system' 正确（React Flow/MUI 同款，对齐 §2 收敛结论）；
- verdict 有自己的主题系统（next-themes 权威 + 用户切换 UI + 持久化），**编辑器跟随
  宿主而非 OS**——verdict 永远显式传 `theme={resolvedTheme}`，'system' 档不会在
  verdict 出现；
- ADR 代价/风险的迁移注记（宿主应显式传值）足够；
- 两个实现注记：①'system' 的 matchMedia 监听在宿主传显式值时应不启动；②SSR/首帧
  matchMedia 不可用时的 token 缺省（'light'）需实现注记——verdict 纯 SPA 无影响，
  Next 宿主有 hydration 面需注记。

**R3 · M2 双层嵌套岛 CSS 幂等——复核通过（附一个时序细节）**

- token 同值幂等成立：迁移期外层（宿主 data-mode）与内层（自持根 resolved）同源
  （同一 resolvedTheme 经 AppshellThemeBridge 桥同步），双层 token 恒等；
- `:not(:has(.seal-root[data-mode=dark]))` 浅色回退守卫：双层同值无歧义 ✓；
- **时序细节**：React commit 写外层属性与内层自持根写属性同 commit 内完成，无中间
  帧；JdmConfigProvider 的 dataset 写（缺省 light）与宿主 dataMode 的竞争——M2 后
  宿主停止写外层 data-mode（M4 deprecated），唯一写者 = 内层自持根，竞争结构性消失
  （即 D1 的价值本身）。

#### 补充评审点（§6 之外，verdict 实测）

1. **M1 并存语义需写明**：M1 theme prop 落地后，宿主现存的外包 JdmConfigProvider
   与 theme prop **并存**——迁移注记应明确「theme prop 优先，外层 Provider 降级为
   context 兜底」，避免 data-mode 双写复活（verdict 会随 M1 撤外包）；
2. **syncDocumentTheme={false} 语义锁定**：verdict 硬依赖「appshell 不写
   html.dark，next-themes 唯一写者」——D4 appshell 收缩后该 prop 语义必须保持，
   建议 M4 注记明确（这是 verdict 的硬依赖，2.0 双写竞争的直接教训）；
3. **2.0.1 两项已消费确认**：bg-white 根治 + 双实例修复，verdict 已升级 2.0.1、撤
   overrides 与防御补丁（42295c4）——§1 病史表第 5 轮的两项闭环；
4. **D3 白名单口径建议**：代码块语义底色白名单建议按「token 变量引用」豁免而非
   逐值枚举（宿主覆盖规则未来同款扫描时口径统一）。

#### verdict 消费时点

- M1（2.1.0）：verdict 撤外包 Provider → 传 theme prop（小改，随发版即做）
- M2/M3/M4（2.2.0）：verdict 删外层 .seal-root div、撤 graph 层透明覆盖
  （styles.css）——迁移注记出后跟
- 上游提案 value_list 下拉（parameterOptions B 档异步回调）与本 ADR 的 M1 同
  props 面，可同批
