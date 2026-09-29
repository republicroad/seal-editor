# A3 · UDF REPL 面板 + demo-server 单函数执行端点——实施规划

- 日期：2026-09-29
- 状态：**已实施（2026-09-29，seal-appshell 1.16.0 + demo-server）**——实施注记见 §5（原型 = jdm-editor 批 2 `3c7938d0`，live 验证过）
- 关联：[function-ecosystem-authoring-governance.md](./function-ecosystem-authoring-governance.md) §1-A3 ·
  [function-catalog](../../packages/appshell/src/components/function-catalog/function-catalog.tsx)（试运行入口已预留 `onTry`）

## 0. 定位

不经图直接调用单个函数试参数——函数级"curl"：选函数 → 填参数（schema 驱动表单）→
执行 → 看输出/耗时。两件套：

1. **demo-server 端点**（`POST /v1/functions/:name/execute`）——位置参数经校验与
   默认值绑定后直调 registry，无图、无持久化；
2. **编辑器 REPL 面板**（appshell `FunctionRepl` 组件）——schema 驱动参数表单 +
   执行 + 结果/耗时展示；FunctionCatalog 卡片「试运行」按钮预选跳转（`onTry`
   槽位已在 A1 移植时预留）。

## 1. 端点设计（demo-server；实现参考 jdm `apps/demo-server/src/app.ts:281` 既有实现，移植即可）

```
POST /v1/functions/:name/execute
body: { args?: unknown[] }          // 位置参数（v1）；具名 kwargs 预留
200: { result, micros, kwargs }     // kwargs = funcBindParams 绑定后的实参（调试可见）
400: { error: 'invalid args', details: issues }   // validatePositionalArgs 未过
500: { error: string }              // registry.call 抛出（错误 containment 同图执行）
```

设计决策（沿原型）：

- **无状态**：无会话/无持久化/无速率闸——demo-server 定位（自托管演示，非 SaaS
  后端）；per-tenant 并发闸等治理端口不在此面（宿主生产部署自行挂）；
- **执行上下文**：`tenantId: DEMO_TENANT` + `requestId: 'repl-' + uuid` + registry
  自身的 per-tool 超时兜底——REPL 与图内执行同一超时语义，不另设；
- **参数校验与绑定分离**：`validatePositionalArgs`（缺参/多参报 400）→
  `funcBindParams`（默认值绑定）→ `registry.call`——两层在 zen-udf registry
  已有，端点只编排；
- **耗时口径**：`performance.now()` 差值（µs），**首调含 TSFN/wasm 冷启动**——
  UDF Lab 实测 current_date 首调 50138µs vs 暖态 µs 级：面板必须标注冷启动，
  预热口留 zen-udf 二期（不做在端点）；
- CORS/健康探针：复用 demo-server 既有中间件，无新增。

## 2. 面板设计（appshell `FunctionRepl`，无状态）

- **Props**：`{ schema; execute: (tool, args) => Promise<ReplResult>; onBack? }`——
  执行函数由宿主注入（面板不绑 demo-server URL；组件无状态原则同 FunctionCatalog）；
- **表单**：选中工具的 `parameters.properties` 逐参渲染（string→input / number→
  数字输入 / boolean→switch / object|array→JSON textarea + 格式校验）；
  `required` 徽标；默认值预填（schema default）；
- **展示**：result（JSON 树或格式化）、`micros` 耗时（**冷启动标注**：>10ms 且
  首次执行该函数时提示"含冷启动"）、回显绑定后的 kwargs；
- **入口编排**：FunctionCatalog `onTry(tool)` → 宿主切 REPL 并预选（jdm 原型
  同款）；目录卡片「试运行」按钮已随 A1 预留；
- **放置**：udf-lab 右栏加 REPL 页签（Trust Chain / Run Monitor 旁）；宿主页面
  自由复用组件。

## 3. 实施切分

| 步 | 内容 | 量级 |
| --- | --- | --- |
| 1 | demo-server 端点移植（jdm 实现照搬 + bun test 用例：合法/缺参/未知函数/错误 containment） | ~0.5 天 |
| 2 | appshell `FunctionRepl` 组件 + 单测（表单渲染/执行/冷启动标注） | ~0.5 天 |
| 3 | udf-lab 接线（REPL 页签 + catalog `onTry` 预选）+ 目录卡片「试运行」激活 | ~0.25 天 |

前置：无（zen-udf 0.10.0 已就位）。总量 ~1.25 天。


## 3.5 实施注记（2026-09-29 落地时的两处偏差修正）

- **校验/绑定改取目录视图**：roster 等经完整 parametersSchema 注册的工具没有
  扁平 parameters，registry 的 validatePositionalArgs/funcBindParams 对其空转
  （jdm 原型未暴露——其演示工具 legacy_hash 是扁平注册）。端点改从
  udfFunctionSchemaNamespaces()（与面板同源的目录视图）取参数名序/required/
  default 做校验与 kwargs 绑定，两种注册形态都覆盖；未知函数显式 404；
- **ExecContext 包装必须**：roster 等域函数按 ExecContext.tenantId 取数据面，
  callCtx 的 tenantId 不够——call 需包 runWithExecContext（与其他路由同款），
  否则名单查询恒 miss（首跑实测暴露）。

## 4. 开放问题

1. **具名参数形态**：v1 仅位置参数（原型口径）；具名 kwargs 直传随三形态调用
   规范的目录插入具名化一并评估；
2. **预热口**：冷启动标注 vs zen-udf 预热 API（`prewarm(names)`）——实测反馈后
   定，倾向标注即可（REPL 场景首调一次后即暖）；
3. **schema 类型映射边界**：`any`/联合类型参数落 JSON textarea 的校验深度——
   首版仅做 JSON 可解析校验。
