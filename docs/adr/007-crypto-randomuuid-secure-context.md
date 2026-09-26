# ADR-007：crypto.randomUUID 与非安全上下文——库内入口守卫式 polyfill，宿主侧仅作可选加固

## 状态
accepted（2026-09）

## 背景

`crypto.randomUUID()` 是 Secure Context-only API（MDN）：仅在 HTTPS 或 localhost
下暴露于浏览器。`crypto.getRandomValues` 则**不受**此限制，非安全上下文照常可用。

seal-editor 在决策图/决策表组件的 ID 生成上有 **44 处未加守卫的
`crypto.randomUUID()` 直调**（剪贴板复制、Excel 导入对话框、边拆分出节点、
request examples 持久化、dt-command-bar、excel helper 等）。暴露面边界已验证：
依赖树 @xyflow/react 无 randomUUID 调用；`exports` 的深导入子路径
`./dist/schema` 亦无调用——全部调用点都经根入口加载。

事故（2026-09，verdict 宿主）：verdict 以 `http://<ECS-IP>:8080`（HTTP + 裸 IP，
ICP 备案前形态）上线后，编辑器内任何首次生成 ID 的交互（加节点、复制、导入）
即抛 `crypto.randomUUID is not a function`，错误边界白屏。`*.localhost` 本地
开发与 HTTPS 部署均不触发。

**产品判断**：本库目标客群为国内企业，企业内网部署大量是纯 HTTP（裸 IP / 内网
域名）——非安全上下文是**主流运行环境**而非边缘场景。库不能以「宿主自行打
polyfill」为前提交付。

appshell 已有一处守卫先例（`custom-node-plans.ts` 的 `uid()`，回退
`expr-${Date.now()}-${Math.random()}`），与 seal-editor 的 44 处直调并存——
防御口径不一致，且该回退算法存在碰撞风险，不宜作为推广模式。

## 备选方案

| 方案 | 优势 | 劣势 |
| --- | --- | --- |
| A. 宿主侧 `<head>` 内联 polyfill（库与宿主立契约） | 一处覆盖宿主自身 + 库全部调用点 | 契约靠文档传达**必然被漏**：白屏发生在编辑器首次交互、远离因果，宿主开发者难以联想到 head 内联脚本；每个宿主都要重复处理 |
| B. 库内入口守卫式 polyfill（`src/polyfills.ts`，入口最先 import） | 宿主零接入；一处改动覆盖库内 44 处 + 宿主自身调用；两包均未声明 `"sideEffects": false`，副作用模块不会被 consumer tree-shake 掉；幂等守卫与宿主侧 polyfill/多库共存无冲突；服务端与安全上下文自动 no-op | 库变异全局环境（以「缺失才定义」守卫缓解）；宿主在**模块顶层**先于库求值调用 randomUUID 的场景不被覆盖（现实代码几乎不存在，且属宿主自身调用面） |
| C. 内部 `genId()` helper，44 处全部改写 + ESLint 禁直调 | 显式、不碰全局、长期工程最干净 | 44 处机械改动 diff 噪声大；防回归依赖 lint 基建；覆盖面反小于 B（不含宿主自身调用） |
| D. 逐调用点照 appshell `uid()` 样式守卫 | 局部最小改动 | 44 处重复样板；`Date.now()+Math.random()` 回退碰撞风险高于 v4；同样防不住新增直调 |

## 决策

1. seal-editor **包入口接入守卫式 polyfill**：`src/polyfills.ts`（或同名模块）
   在入口最先 import——仅当 `globalThis.crypto?.randomUUID` 缺失时定义，实现
   采用 MDN 片段（`[018]` 模板 + `getRandomValues` 异或，UUID v4 语义完整）。
   服务端（Node/Bun 原生支持）与安全上下文下为 no-op。
2. **否决宿主侧契约**（方案 A）：契约靠文档传达必然被漏，且目标客群 HTTP
   部署为主流——「每位宿主自行打补丁」在产品上不成立。
3. 否决 C/D：成本高、覆盖窄。若未来出现「库不得改全局」的审查硬约束，再升级
   为 C（helper + lint），与 B 不冲突，届时另起 ADR。
4. **宿主侧 head 内联降级为可选加固**：仅当宿主自身浏览器代码会调用
   `randomUUID` 且可能早于库加载时才需要；接入文档以建议而非要求表述。
5. appshell `uid()` 既有守卫**保留**（防御纵深无害），其 Math.random 回退
   不作为推荐模式对外推广。
6. verdict 宿主的 head 内联 polyfill 已在库内 polyfill 上线（1.4.0）后
   **移除**（2026-09-26）：浏览器侧唯一调用方是库，双层注入徒增一份 MDN 片段
   维护负担。恢复条件：宿主自身浏览器代码需调用 randomUUID 且可能早于库加载。

## 后果

- **实施清单（本 ADR 仅立决策，代码改动由 seal-editor 侧另行实施）**：
  1. 新增 `src/polyfills.ts`（守卫式 MDN 片段）
  2. 包入口 `src/index.ts` 顶部 import（先于一切组件模块）
  3. 构建产物验证：`dist/index.js` 首部含守卫代码
  4. 回归：44 处调用点所在交互在 HTTP 模式下手测（加节点/复制/Excel 导入）

  ✅ **已实施（2026-09-25）**：1–3 落地（`src/polyfills.ts` + 入口首 import + dist 头部
  IIFE 守卫实测位于组件 region 之前；单测覆盖缺失态 v4 语义/幂等/no-op 三态，452 测试全绿）。
  第 4 项的单测等价物已覆盖 polyfill 语义；真实 HTTP+裸 IP 环境回归由 verdict 宿主在其
  事故环境复核（本地 localhost 属安全上下文，无法复现）。
- 行为矩阵收敛：HTTPS / localhost / HTTP + IP / HTTP + 内网域名 全部可用。
- 已知边界：无 Web Crypto 的极老浏览器仍不可用——该类环境已被 ESM-only
  （ADR-001）排除在支持矩阵外；`./dist/schema` 深导入不经过 polyfill，但该
  子路径无 randomUUID 调用（已验证），暴露面完整覆盖。
- 库内 44 处直调保持原样；若未来收紧（lint 禁直调、统一 helper），另起 ADR
  取代本条并在索引标注 superseded。
