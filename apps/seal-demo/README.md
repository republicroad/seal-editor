# @republicroad/seal-demo

npm 消费验证应用（roadmap §2 "seal-demo 打通"）：**从 registry 安装发布包**，
验证三包在真实消费方形态下可用——monorepo 内其他应用（playground / demo-server）
走 workspace 源码直通，掩盖不了发布面问题，本应用刻意隔离。

## 消费形态

- `@republicroad/seal-editor` / `@republicroad/seal-appshell` 按**精确版本**安装
  （如 `1.4.0`），升级 = 手动 bump 版本号重装。
- [`.npmrc`](./.npmrc) 设置 `link-workspace-packages=false`，防止 pnpm 把满足
  版本范围的 workspace 包软链进来。
- 验证锚点：`node_modules` 里解析到的必须是 registry 产物
  （`node_modules/.pnpm/@republicroad+seal-editor@x.y.z/...`），而非
  `packages/seal-editor/src`。

## 功能页

| Tab    | 内容                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel | `DecisionGraph` + 公开导出的 `GraphSimulator` 组装模拟器面板；R4 分支路径名（switch case 行内联输入，芯片实时更新）、R6 侧栏一键整理、R7 错误码徽章（"Inject EVAL_ERROR badge" 按钮）   |
| Shell  | `SkinnedDecisionGraph` + `ThemeContextProvider`，`simulateHandler` 用 appshell 自带的 [`createExecuteSimulate`](../../packages/appshell/src/shell/execute-simulate.ts) 直连 demo-server |

## 运行

```bash
pnpm install                      # 根目录一次
pnpm --filter @republicroad/seal-demo dev   # :5180
pnpm demo-server                  # 另开终端：执行引擎 :8787（S3 执行链）
```

demo-server 未启动时，模拟器 Run 会得到 `SERVER_DOWN` 错误提示；Kernel 页的
R7 徽章演示按钮不依赖服务端。

## 待办（S4）

HTTP + 裸 IP 部署形态验证（ADR-007 真实环境回归）：把 dist 部署到
`http://<ECS-IP>:<port>` 走一遍 R6/R4/加节点交互，确认 randomUUID polyfill
使全部 ID 生成路径可用（verdict 事故场景的等价复现场）。
