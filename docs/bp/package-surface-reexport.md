# BP-09：包公开面与全量透传——类型/样式/符号导出与测试基线

## 适用场景

monorepo 中「壳包（appshell）默认透传内核包（seal-editor）」的双包发布形态：
宿主希望单入口 `from '@republicroad/appshell'` 拿到 kernel+appshell 全部公开面
（类型、样式、符号），同时壳包自有 API 保持本地优先。本文沉淀 seal-editor /
seal-appshell 1.11.0 落地时的全部约定与守卫，可迁移到任何同形双包。

## 核心模型

```
宿主 ──import──▶ @republicroad/seal-appshell
                   ├── export * from '@republicroad/seal-editor'   ← 首行，指针不内联
                   ├── 显式导出（本地优先，遮蔽同名内核符号）
                   └── dist/style.css（唯一样式入口）

构建期：kernel JS external（regex 匹配包名）＋ dts 保留包名 specifier
       （pathsToAliases: false，多文件声明镜像 src 结构）
```

ESM 星导出语义是整套机制的基石：**显式 `export` 声明优先于 `export *`**——
壳包撞名时本地静默胜出，内核同名符号经壳包出口不可见（直连内核导入不受影响）。

## 铁律

### 类型导出

1. **dts 保留包名 specifier**：`pathsToAliases: false`——发布物 d.ts 只含
   `@republicroad/seal-editor` 等可解析包名，绝不出现构建机相对路径
   （0.9.0 曾泄漏 `../../../../seal-editor/src/*`）；
2. **内核 ambient 声明纳入 dts 程序**（`include: ['src', '../seal-editor/src/types/*.d.ts']`），
   否则跨包解析内核 src 时 TS7016；
3. **穿过 monaco 等不可命名依赖的组件类型显式标注**
   （`React.ForwardRefExoticComponent<...>`）——推断类型穿过 monaco 时不可命名，
   dts 产物不可移植；
4. **多文件声明（镜像 src 结构），不用 bundleTypes/api-extractor**——后者分析
   import 闭包（含内核源码），对复杂 TS 构造有崩溃史。

### 符号导出

5. **单入口 + 本地优先**：壳包 index 首行 `export * from '<kernel>'`，显式导出
   紧随其后；文件头注释写明遮蔽规则；
6. **公共契约必经 index barrel**，深路径（`/dist/xxx`、包内子路径）不算契约；
   barrel 递归链保持 `components/index → decision-graph/index` 形态；
7. **peer 下限 = 实际构建基线**：dev 依赖 `workspace:^X.Y.0` 与 peerDependencies
   `^X.Y.0` 同步抬升——透传后壳包类型面跟随宿主所装内核，松下限（^1.1.0 沿用
   七个 minor 不抬）= 符号缺失隐患。

### 样式

8. **单一样式表入口**：内核 `dist/style.css`、壳包 `style.css`（vite
   `assetFileNames` 对齐发布 exports 声明）；宿主引样式只此一处；
9. **CSS 副作用显式化**：内核 index 首行 import `tailwind.css`/`tokens.css`——
   导入任一内核符号即注入样式，这是**特性不是缺陷**（壳包经 SkinnedDecisionGraph
   引内核时本就传递）；文档写明，勿在壳包重复注入。

### 透传守卫（三条缺一不可）

10. **撞名扫描**：递归 barrel 图收集两包导出名比对，撞名非零退出
    （`scripts/check-export-collisions.mjs`，发版前跑）；
11. **dts 指针守卫挂 build**：断言 `dist/index.d.ts` 含星导出指针，dts 管线
    改配置（bundleTypes/pathsToAliases）丢指针即构建失败
    （`scripts/check-appshell-dts-pointer.mjs`）——构建路径全覆盖
    （本地/validate/publish）；
12. **单入口契约测试**：值符号经壳包出口 `toBe(内核同符号)`（同一实例）+
    本地优先断言（壳包版与内核版并存不遮蔽，如 `useTheme` vs `useThemeMode`）。

## 测试基线（双包）

- **环境**：vitest 默认 node，组件/内核根索引测试逐文件
  `// @vitest-environment jsdom`——**内核根索引自 `helpers/monaco.ts` 触碰
  `self`**，node 环境必炸；
- **全图挂载测试独立成文件**：react-resizable-panels 的组测量跨用例互扰
  （同文件连跑 Run 按钮不再出现）——`skinned-simulator-panel.test.tsx` 文件头
  即此约定；monaco-editor / zen-engine-wasm 顶部 mock；
- **fake timers 纪律**：`vi.advanceTimersByTimeAsync` 用放宽的时间预算
  （如 500ms/5000ms 而非 0/100ms）——保存轮完成回调与后续 schedule 的微任务
  交错是真实竞态；断言"没有第 N 次调用"时预算要盖过 max 定时器；
- **契约测试三件**：parse-fidelity 最大模型夹具（**每个新模型字段必加**，
  deep-equal 钉往返）；sidebar-contract 钉内核工具栏按钮数（内核侧栏变更必须
  同步它）；透传值同一实例断言（见铁律 12）；
- **CI flake 在案**：primitives `pickOption`、AutoLayout 位置断言——重跑即清
  （AutoLayout 超时已放宽 20s），先查在案清单再怀疑自己的改动；
- **壳包公共面变更后**：先重建壳包 dist 再跑下游 app 的 `tsc --noEmit`
  （playground 等仓内 app 的 tsconfig 无 paths，走 dist 类型——旧 dist 会
  假报"导出不存在"）；
- **npm-smoke**：发布物形状 15 项断言（exports map / dts 公共 API / schema
  子路径），发版前必跑。

## 参考实例

- 星导出 + 规则注释：`packages/appshell/src/index.ts` 首行
- 撞名扫描：`scripts/check-export-collisions.mjs`（递归 resolveFile 须先试
  原路径再试加扩展名——入口已带 `.ts` 时追加扩展名的解析 bug 会让扫描静默
  返回空集）
- dts 指针守卫：`scripts/check-appshell-dts-pointer.mjs`，挂
  `packages/appshell/package.json` build 末尾
- 契约测试：`packages/appshell/src/__tests__/kernel-reexport.test.ts`
- 外置配置：`packages/appshell/vite.config.ts`（external regex +
  `pathsToAliases: false`）
- peer 对齐：`packages/appshell/package.json`（dev `workspace:^1.8.0` /
  peer `^1.8.0`，1.11.0 抬升）

## 反模式

| 反模式 | 后果 |
| --- | --- |
| peer 万年不抬（^1.1.0 沿用多个 minor） | 透传类型面跟随宿主旧内核 → 符号缺失/类型 skew |
| dts 管线换 bundleTypes 或改 pathsToAliases | 指针丢失/类型内联进壳包 → 宿主类型面静默缩水 |
| 公共契约走深路径导出 | barrel 重构即破坏宿主，且撞名扫描覆盖不到 |
| 内核根索引进 node 环境测试 | `self is not defined`（monaco loader 顶层判断） |
| 全图挂载测试与其他图挂载同文件 | 组测量互扰，Run 按钮消失（假红） |
| fake timers 断言用 0ms 推进 | 微任务交错竞态，偶发假红 |
| 改壳包公共面后直接跑下游 app tsc | 旧 dist 类型假报"导出不存在" |
