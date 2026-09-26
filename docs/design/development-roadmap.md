# seal-editor 后续开发计划（v1.1.0 基线，2026-09-24）

> **分工裁决（宿主 2026-09-24）**：seal-editor 仓的后续开发由 seal-editor 项目内的会话承接；
> 旧仓 republicroad/jdm-editor（reui 线）转入独立创新探索——实验成果按需回流，
> 两仓均保留上游 fork 形态作为人才梯队培养场。
>
> 本文档为 seal-editor 主线计划；文末保留 v1.0 分叉前的历史工作流记录（WS1–WS6，
> 其中 velocity/ip2region 已按裁决转移 verdict 仓）。

## 0. 起点状态（v1.1.0 基线）

- 品牌：`grl-` → `seal-` 全前缀清扫完成（93 文件 ~574 处，含驼峰标识符）；npm 旧包 deprecated 已执行
- 结构：monorepo 三包 —— `packages/seal-editor`（内核，包名 @republicroad/seal-editor，1.1.0 随下次发版）、
  `packages/appshell`（seal-appshell 1.1.0，内核依赖 workspace:^1.1.0）、`packages/zen-udf`（0.6.0 机制包，五域参考实现）
- 编辑器能力：ReUI 节点卡（IconTile + 类型 Badge）、悬浮工具栏（R2）、连接线"+"插入（R3）、
  分支路径标签 chip（R4）、停靠检查器（R5）、仿真 run strip（R7）；三形态调用规范
  （数组默认 / $call 命名 / ;; legacy）；Base UI 全栈
- 门禁：Validate 工作流全绿（Build / Test / Type check / Lint / Bundle size / Consumer smoke）
- 关键约束：CI Linux 构建 ~2.5% 大于 Windows 本地——体积预算以 CI 实测校准
  （index.js 695000/172000，style.css 116000/18700）

## 1. 短期（1.0.x → 1.1.x 维护与特性）

### 1.1 R6 dagre 体积评估结论（2026-09-25 实测）

- 实测对象 `@dagrejs/dagre@3.1.1`（ESM 构建，graphlib 已内含、无额外依赖）：`dagre.esm.js`
  **47.4kB raw / 16.5kB gzip**。
- 预算现状：index.js 660.1kB raw / 161.6kB gzip（本地），预算 679kB / 168kB——
  **余量 raw ~19kB / gzip ~6.4kB**。静态引入将同时击穿两条线（47>19、16.5>6.4），
  **静态引入否决**；上调预算否决（为非核心功能给全体用户加 ~10% gzip 预算不成立）。
- **裁决：内核 dynamic import**。自动布局是用户主动触发的动作（一键整理按钮），
  `await import('@dagrejs/dagre')` 按需加载独立 chunk；不做自动布局的宿主与终端用户
  零成本。预算门禁兼容性已确认：`bundle-size.mjs` 按 `size-budgets.json` 清单逐文件
  检查，lazy chunk 天然不入 index.js 口径——落地时给该 chunk 单独立预算
  （建议 raw ≤ 60kB / gzip ≤ 20kB，含 CI Linux ~2.5% 膨胀）保持诚实。
- 否决下沉 appshell：自动布局是内核编辑器的核心可供性，自定义壳的宿主不该失去它；
  且 appshell 无体积门禁，移动债务不加约束。
- **实施修正（2026-09-25 落地时）**：chunk 预算条目实际不需要——dagre 作为常规
  dependency 本就被 vite `external` 规则排除（依赖全部外置的既定哲学），
  `dist/index.js` 保留裸的 `import('@dagrejs/dagre')`，内核产物零 dagre 代码、
  零新 chunk（index.js 仅 +2kB：helper/工具栏/i18n），lazy chunk 由宿主导包器
  自行拆分。落地件：`helpers/auto-layout.ts`（LR 布局 + 实测尺寸回退 + 悬挂边容错）
  + store `autoLayout` action（pushUndo 可撤销 + fitView）+ 侧边工具栏按钮
  （`dg.toolbar.autoLayout` en/zh）+ 4 项单测 + AutoLayout storybook 交互用例
  （打乱布局输入，防 dagre 恒等重排误判）。

| 项 | 说明 | 备注 |
| --- | --- | --- |
| 1.0.1 hotfix 通道 | consumer 反馈走 patch；CI publish 正常（NPM_TOKEN 已配） | 常备 |
| R7 增强 | ✅ 2026-09-25 已落地：run strip 错误码徽章——`SimulationError` 契约新增 `code` 字段，无 code 时退化为紧凑 title + 原生 tooltip（title/message）；两个 storybook 用例（code 徽章 / title 回退） | 完成 |
| storybook Pages 修复 | ✅ 2026-09-24 已修复上线（Pages 启用 + rspress 路径 + 站点落地页，436d5ce/5b19bc1） | 完成 |
| R6 体积评估 | ✅ 2026-09-25 评估完成并落地（结论见 §1.1；dynamic import + 工具栏一键整理已交付，test:storybook 73/73） | 完成 |

## 2. 中期（1.2.0 特性窗口）

- **R4 增强**：✅ 2026-09-25 已落地——`SwitchStatement` 新增 `name` 字段（case 名），switch 节点
  case 行内联输入（compact/list 两变体齐备），输入即镜像到出边 `edge.name`
  （`applyStatementNameToEdges` 纯函数 + store setEdges），分支路径标签芯片即时更新；
  单测 3 项 + SwitchStatementNameLinkage storybook 交互用例（真实浏览器断言芯片文本）
- **R6 dagre 自动布局落地**（按 §1 评估结论）
- **seal-demo 打通**：✅ S1–S3 已完成（2026-09-25）——`apps/seal-demo` 以**精确版本
  从 npm registry 安装**两包（`.npmrc` link-workspace-packages=false 隔离 workspace
  链接，解析锚点验证过 `.pnpm/@republicroad+seal-editor@1.4.0`），双 tab 验证
  kernel（DecisionGraph + 公开 GraphSimulator 组装模拟器）与 appshell
  （SkinnedDecisionGraph + createExecuteSimulate 直连 demo-server）；R4/R6/R7 全部
  在消费形态下可见可用；执行链实测：simulator Run → demo-server /v1/execute →
  zen-udf → 4 节点 run strip 回灌。**消费验证首日即抓到集成漂移**：容器类已品牌化
  为 `.seal-root` 而全部消费文档仍写 `.grl-root`——demo 修复 + 10 篇文档 +
  storybook 装饰器一并纠正。S4（HTTP+裸 IP 部署形态的 ADR-007 回归）待部署窗口。
- **theme token 收尾**：`--seal-color-*` 非 bridged 键（bg-container/field tokens/chrome statics）文档化

## 3. verdict 侧联动（跨仓，由 verdict 会话承接）

> 交接清单已固化：[handoff-verdict-integration.md](./handoff-verdict-integration.md)——
> 四端口 conformance、UDF Pack 契约、model-execute 组装规范、失效广播契约、核对清单。

- velocity（RateStore 接口对齐 + conformance 套件复用）
- ip2region xdb 接入（v4/v6 数据管道，上游 Action 自动更新；链接已实测于路线图 N5）
- seal-demo ↔ model-execute 端到端风控 demo
- 稳定后按裁决开源回流

## 4. 长期（远期裁决已定，届时展开设计）

- P2 durable 任务：act 类异步副作用的 journal 待执行队列投影（地基：act 语义 + decisionId 幂等已备）
  ——✅ 设计稿已展开（2026-09-25）：[p2-durable-act-queue.md](./p2-durable-act-queue.md)（intent/effect
  两阶段 + 端口 + 故障矩阵 + 决策点 D21–D25 待宿主裁决；裁决后按切片 P2.1–P2.5 实施）
- P3 双模式：LLM 审批流（同内核，自定义节点目录与画布按模式隔离；
  前置约束 = 引擎无中途暂停，两路径决策点见 jdm-editor 路线图）

## 5. 品牌化清债（v1.0 后技术债，按需启动）

| 项 | 规模 | 说明 |
| --- | --- | --- |
| `grl-` CSS 前缀残留 | 旧仓遗留；seal-editor 仓已零残留 | 已在本仓完成 |
| 深度品牌化（i18n 文案、README、docs 站） | 小 | 随版本滚动 |
| CM phase-2b（旧仓） | 旧仓窗口 | 不进本仓 |

## 6. 旧仓定位（备忘）

- `republicroad/jdm-editor`（reui 线）：独立创新探索 + 人才梯队培养场；
  上游修复按需 cherry-pick（fetch upstream → cherry-pick <sha>，管道不受改名影响）
- `republicroad/editor`：fork 形态保留，创新实验线；已升级至 0.11.0/0.6.0
- seal-demo（宿主自建）：npm 消费验证应用

---

# 附：v1.0 分叉前历史工作流记录（WS1–WS6，已归档）

> 以下为 jdm-editor 时期的工作流记录，保留作历史追溯。
> 当前主线见上文 §1–§3。

## WS1 · 规则图 ReUI 优化（当前焦点）

目标：把 ReUI flow 块的节点卡设计语言落到决策图编辑器。参照物：playground 内的
flow-1/flow-3/flow-2 试点件与 [reui-flow-pilot.md](../archive/plans/reui-flow-pilot.md)。

| # | 切片 | 模式来源 | 状态 |
| --- | --- | --- | --- |
| R1 | 节点卡头部：IconTile（节点色着色）+ 类型 Badge（首次启用闲置的 `type` prop） | flow 块节点卡 | ✅ 0bb311ab |
| R2 | 节点悬浮工具栏：hover/选中显现 设置/复制/复制节点/删除（复用确认对话框） | flow-1 NodeToolbar | ✅ bb2b2753 |
| R3 | 连接线"+"：悬停选节点类型，中点插入并重连 source→新→target（nodeSchema 校验） | flow-1 connector + | ✅ 37deba8c |
| R4 | 分支路径标签：边上显示条件/命名路径（flow-2 named branch paths） | flow-2 | 待开发 |
| R5 | 停靠式检查器：选中带 renderSettings 的节点，画布右上停靠设置面板（useOnSelectionChange + Panel） | flow-2 | ✅ 976f0b6c |
| R6 | 自动布局：dagre 一键整理（flow-2 用 @dagrejs/dagre） | flow-2 | 待开发（依赖评估 dagre 引入 kernel 的体积预算） |
| R7 | 仿真状态条：节点卡底部 run strip（耗时/命中/错误码，对应 simulator trace） | flow-2 last-run strip | 待开发 |

门禁（每片通用）：kernel tsc + 447 测试 + build + size 预算；涉及画布交互的切片加
storybook 交互用例。

上游阻塞：`/r/base/` 注册路径整条 404（2026-09-17 实测，预览页存在但 registry 项未
发布）——flow 块重装待上游发布（并入 N4 跟踪）；当前以本地试点件 + 模式移植规避。

## WS2 · zen-udf 场景节点（P1 → P2 → P3）

详见 [zen-udf-development-plan.md](../archive/plans/zen-udf-development-plan.md) 场景节点路线图节。

- **P1（进行中，4/6）**：
  - ✅ 已落地（zen-udf contrib）：`ab.bucket`（FNV-1a 分桶）、`geo.distance`/`geo.fence`
    （Haversine + 射线法围栏）、`validate` 四件（id_card/mobile/uscc/bank_card，合成向量
    测试）、**`template`**（mustache 子集栈式解析 + DoS 三上限，84b65e78）
  - ⬜ **velocity：转移到 saas 平台实现**（宿主裁决 2026-09-17）——对照本仓
    `contrib/rate-window.ts` 的 RateStore 接口细节在 saas/verdict 侧落地，
    **稳定后再开源**回流；本仓不实现
  - P1 全部落地后发 `zen-udf@0.6.0`（本仓五域：ab/geo/validate/template/dt）
- P2：durable 任务（act 类异步副作用；journal 待执行队列投影）。
- P3：LLM 审批流双模式（同内核，节点目录与画布隔离；前置约束 = 引擎无中途暂停，
  两路径决策点已记录）。

## WS3 · 发版积压（✅ 已完成 2026-09-17，22ceb8b8）

已发布并验证：`zen-udf@0.5.0`（notify 域/ToolCallContext/defineToolFor/packChecks/
三形态调用/host-functions-guide）、`jdm-editor@0.11.0`（节点卡 ReUI 头 + R2/R3 +
#reui 本地化）、`jdm-appshell@0.11.0`（notify 目录 + 命名模式开关 + 三形态类型面）。
后续切片随小版本滚动发版。

## WS4 · editor 仓升级（跨仓）

editor reui 分支从 tag 配对/源码直通切到 npm 双包（≥0.11.0）。核对三类破坏面：
asChild → render、data-[state=*] → presence 选择器、delayDuration → delay；
新增：自定义节点面板的命名模式交互。依赖 WS3。

## WS5 · v1.0 硬分叉（N3）

前置 checklist（2026-09-17 清点）：
- [x] WS1 切片 R1–R5 完成（R4/R6/R7 带入分叉后）
- [x] WS2 P1 全部落地并发版（五域随 zen-udf 0.6.0 发布；velocity 转 saas，见 04dd1ba3）
- [x] WS3 + WS4 完成（三包 npm 就绪；editor 仓 8651cb7 已升级：tsc 零错、86/86 测试）
- [ ] verdict-weave 仓迁移 + 品牌化 + 断上游——唯一剩余项；此前 editor 引用 reui 分支不可迁移
  的约束已随 editor 切 npm 版本（8651cb7）自然解除
- [x] 品牌名：**seal-editor**（宿主提议 2026-09-17，待最终确认）——verdict 裁决 + seal 用印定案，
  语义自洽；产品族可延展（seal-editor 编辑器 / seal-engine 执行服务）；机制包 zen-udf 保持通用名不品牌化
- [x] 迁移方式（宿主裁决 2026-09-17）：**新建 republicroad/seal-editor 仓、只推 main**——
  现有仓其他分支仍有人使用，rename 会把全部分支与使用者一并卷入新品牌；执行序列：
  ① 新建空仓（非 fork）→ ② push main（全量 main 历史）→ ③ v1.0 tag 作为新仓首个 release →
  ④ CI secrets 重配（npm token / REUI_LICENSE_KEY）→ ⑤ npm 换名 @republicroad/seal-editor
  （旧包 deprecated 指引）→ ⑥ editor 仓依赖与文档链接更新。旧仓原状保留：继续服务其他
  分支使用者 + 两个月工作见证存档，可加一条 README 归档指引（保留分支不受影响）

分叉后即启动：P2 durable 设计展开、flow 块 base 重装（若上游已发布）。

## 部署形态（宿主裁决 2026-09-17）

verdict 上 ECS：**Docker Engine + compose**（Linux 服务器版免费，Docker Desktop 授权条款不涉及；
Alibaba Cloud 兼容成熟度与排障资料密度是决定因素）。服务拆分：model-execute / postgres / redis，
`restart: unless-stopped`；镜像由 CI buildx 构建、ECS 只拉取运行。数据文件（xdb/节假日表）
一律 **volume 挂载**进容器——更新数据不重建镜像。Podman 6.1.2 compose 兼容（官方客户端 + socket
路径）已评估可用，作为 rootless/K8s（ACK）阶段的备选，镜像层 OCI 通用无锁定。

## WS6 · 清债与跟踪

| 项 | 触发/窗口 |
| --- | --- |
| CM phase-2b（删 PARITY 块 + 旧高亮器，烧 ~6 处 !important，下调 style-debt 常量） | v1.0 发布后第一个清债窗口（池化默认态浸泡一周期） |
| N4：ReUI `/r/base/` 发布跟踪（flow 块重装 + 撤翻译层） | 上游发布即触发；当前以本地试点件规避 |
| **N5：ip2region xdb 接入 → 转移到 verdict 实现**（宿主裁决 2026-09-17：实现需要持续更新 IP 库文件，不适合作为 zen-udf 的依赖——机制/数据分界同 D1/velocity 裁决）。实测链接：`raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v4.xdb` 与 `_v6.xdb`（上游 Action 自动更新；旧 `ip2region.xdb` 路径已 404）。verdict 侧实现要点：xdb 文件管道 + 全量缓存（~15MB 换微秒查询）+ 查询 API；海外可叠 geoip-lite。zen-udf 侧 ip-location 域保持现状或仅暴露注入式查询口 | verdict 侧窗口 |
| xyflow handle 样式（5 处 !important） | xyflow 升级窗口 |
| HK-09 Excel wizard | 组件重构窗口 |

## 排序建议

```
✅ WS1(R2,R3,R5) → ✅ WS3 发版 → ✅ WS2 P1 五域(ab/geo/validate/template/dt)
→ ⬜ zen-udf 0.6.0 发版（五域全量）→ ⬜ WS4 editor 升级
→ ⬜ v1.0 checklist 清点 → N3 分叉
→ 分叉后: P2 durable 设计 → WS1(R4,R6,R7) → P3 双模式设计（N5 ip2region 与 velocity 同在 verdict 侧）
```

依据：发版越早，下游（editor/verdict）集成越早开始消化破坏面；R5（docked
inspector）是 WS1 里工作量最大的一片，放在发版后避免发版内容漂移；P2/P3 均
依赖 P1 稳定，保持远期。
