# 发布/推前验证流程（1.42.0 四连红的流程性根治）

## 背景

1.42.0 发版连吃 Validate 四红（typecheck 缺 prop/cast、appshell 侧栏计数、storybook play 文案、style-debt 预算）。根因：本地门缺真 typecheck——`pnpm run lint:compiler` 是 **eslint**（react-compiler 插件）而非 tsc，名字有误导性；`tsc --noEmit` 此前只在 CI Validate 跑。

## 本地门（每次批次收尾必跑）

```sh
pnpm --filter @republicroad/seal-editor run typecheck      # 真 tsc --noEmit
pnpm --filter @republicroad/seal-appshell run typecheck    # appshell 消费 kernel 类型
pnpm --filter @republicroad/seal-editor run test           # vitest 全量
pnpm run lint:debt                                         # style-debt 预算
pnpm exec prettier --write <changed-files>                 # CI prettier 比 lint-staged 严
```

## 推前防线

- **husky pre-push**（已装）：双包 typecheck 自动跑。
- **一键全门**：`node scripts/release-preflight.mjs`（`--fast` 跳过 vitest）——发版前必跑，等价于 CI Validate 的本地判分项。

## 推后

`gh run list` 盯 **Validate / Publish / Pages** 三流；Publish 仅由 `chore(release)` 触发头 + tag 驱动（fix(release) 前缀不触发）。

## 债务入账

style-debt 超限（`scripts/style-debt.mjs` BUDGET）走 `SEAL-STYLE-HACK[HK-NN]` 标记 + 预算有意识上调，禁止绕过。
