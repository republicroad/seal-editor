# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.36.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.35.0...@republicroad/seal-appshell@1.36.0) (2026-10-07)

### Features

- **seal-appshell:** allowedNamespaces 治理谓词透传——宿主传 Set 即过滤 customNodes

# [1.35.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.34.0...@republicroad/seal-appshell@1.35.0) (2026-10-07)

### Features

- **seal-appshell:** SkinnedDecisionGraph runsPersistenceKey 透传（Run 历史持久化宿主开关）

# [1.34.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.33.0...@republicroad/seal-appshell@1.34.0) (2026-10-07)

### Features

- **seal-appshell:** SkinnedDecisionGraph runsPersistenceKey 透传——宿主传键即启用 Run 历史持久化

# [1.33.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.32.0...@republicroad/seal-appshell@1.33.0) (2026-10-07)

### Features

- **seal-appshell:** crypto 待摘要内容切 TypedInput 万能值（信封全态直写，引号仪式退役）；secret 槽位保留表达式编辑器
- **seal-appshell:** 仿真完成 toast——seal:simulation-finished 事件桥 + Toaster 挂载（i18n 就绪）

# [1.32.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.31.0...@republicroad/seal-appshell@1.32.0) (2026-10-06)

### Bug Fixes

- **seal-appshell:** http persistConfig 从整对象替换改 immer 局部写（只写 expressions，pack 自有键不丢）

### Features

- **seal-appshell:** http 节点 url 切 TypedInput 万能值——信封全态直写（literal 原样绑定，裸 URL 引号仪式退役），旧裸串读态保语义映射 expression
- **seal-appshell:** number-field 原语移植——http 超时/重试真数字语义（步进 + 100–60000/0–5 钳制）

# [1.31.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.30.0...@republicroad/seal-appshell@1.31.0) (2026-10-05)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.30.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.29.0...@republicroad/seal-appshell@1.30.0) (2026-10-04)

### Features

- **appshell:** 专用节点写路径规范形收编——四 tab 写器切具名 kwargs + 解析器双读（ADR-015/016 收尾） ([d608620](https://github.com/republicroad/seal-editor/commit/d608620d609dfa4909c44551cfd2520d53716058))

# [1.29.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.28.0...@republicroad/seal-appshell@1.29.0) (2026-10-04)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.28.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.27.0...@republicroad/seal-appshell@1.28.0) (2026-10-04)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.27.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.26.0...@republicroad/seal-appshell@1.27.0) (2026-10-04)

### Bug Fixes

- **seal-editor:** 面板抽屉三路关闭——内建头 X / Esc / 侧栏激活态强化 ([b1b9a05](https://github.com/republicroad/seal-editor/commit/b1b9a05a88cf592ca7fce984e3dde36ba457c0e2))

### Features

- **appshell:** customFunctions 自动接线 + SchemaContainerTab 收编退役 ([2278b68](https://github.com/republicroad/seal-editor/commit/2278b684404a3eb313d1e900e41de829061dbe95))

# [1.26.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.25.0...@republicroad/seal-appshell@1.26.0) (2026-10-02)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.25.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.24.0...@republicroad/seal-appshell@1.25.0) (2026-10-02)

### Bug Fixes

- **appshell:** peer floor 上调 ^1.10.0→^1.17.0——1.24.0 的 FixturesPanel/onContractEvent 依赖 kernel 1.17.0 新面 ([e5b860d](https://github.com/republicroad/seal-editor/commit/e5b860d2a77924174812154a2dedf8a9f6c0ad20))

### Features

- **custom-node:** ADR-015 [#3](https://github.com/republicroad/seal-editor/issues/3)——写路径切规范形 {$call, kwargs} + expr_asts 停写 + 漂移带全量按名（zen-udf ^0.14.0） ([7fd7a83](https://github.com/republicroad/seal-editor/commit/7fd7a83ae16ac8b70696c1c218b89754e39504bc)), closes [#1](https://github.com/republicroad/seal-editor/issues/1)

# [1.24.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.23.0...@republicroad/seal-appshell@1.24.0) (2026-10-02)

### Features

- **appshell:** 注册 Fixtures 面板——Run all 图级执行面（与 simulator 对称） ([4199224](https://github.com/republicroad/seal-editor/commit/4199224982d580bedf9772dc946a303e7b2104de))

# [1.23.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.22.0...@republicroad/seal-appshell@1.23.0) (2026-10-01)

### Features

- **appshell:** ADR-013 批次三——simulateHandler→fixturesRunner 适配器 + 契约漂移接变更日志 ([9759ace](https://github.com/republicroad/seal-editor/commit/9759aced459be5c08ca8c2c2051c6f2427bf15a6))

# [1.22.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.21.0...@republicroad/seal-appshell@1.22.0) (2026-10-01)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.21.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.20.0...@republicroad/seal-appshell@1.21.0) (2026-09-30)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.20.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.19.0...@republicroad/seal-appshell@1.20.0) (2026-09-30)

### Features

- **playground:** batch-1 UDF Lab experience — reui tree + timeline + code-block first links ([5bc4d21](https://github.com/republicroad/seal-editor/commit/5bc4d214b2114bbaa87de478eb50730361d02942))

# [1.19.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.18.0...@republicroad/seal-appshell@1.19.0) (2026-09-30)

### Bug Fixes

- **appshell:** commit the missing vendored link icon — the A3b-staging sweep dropped it ([79db556](https://github.com/republicroad/seal-editor/commit/79db556d754ea09820b7e297fc5a0b94df25925f))

### Features

- **appshell:** reui Motion Icons on catalog + validation jump buttons ([00ff89e](https://github.com/republicroad/seal-editor/commit/00ff89e7a79456f3c8607c619d0ea1cc8efb4f7f))

# [1.18.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.17.0...@republicroad/seal-appshell@1.18.0) (2026-09-30)

### Features

- **appshell:** governance window — ValidationPanel + ChangeLogPanel (batch 4) ([be51921](https://github.com/republicroad/seal-editor/commit/be5192151e2cc1ec737b62c6742d7aa9cc01fb14))

# [1.17.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.16.0...@republicroad/seal-appshell@1.17.0) (2026-09-30)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.16.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.15.0...@republicroad/seal-appshell@1.16.0) (2026-09-29)

### Features

- **appshell:** FunctionRepl — A3b stateless single-function REPL panel ([4ce04e3](https://github.com/republicroad/seal-editor/commit/4ce04e3d1010c6fd7b3386961a12bfb8fedbc9cc))

# [1.15.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.14.0...@republicroad/seal-appshell@1.15.0) (2026-09-29)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.14.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.13.0...@republicroad/seal-appshell@1.14.0) (2026-09-29)

### Features

- **kernel,appshell:** ADR-009 [#2](https://github.com/republicroad/seal-editor/issues/2)/[#3](https://github.com/republicroad/seal-editor/issues/3) meta chain — spec.meta + panel origin badges (A1 remainder) ([27b7308](https://github.com/republicroad/seal-editor/commit/27b7308c68db170eac05d0f84dcecc62ddbe3bf5))

# [1.13.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.12.0...@republicroad/seal-appshell@1.13.0) (2026-09-29)

### Features

- **appshell:** ADR-009 [#2](https://github.com/republicroad/seal-editor/issues/2)/[#3](https://github.com/republicroad/seal-editor/issues/3) follow-up — meta passthrough + catalog origin badges ([6be6bce](https://github.com/republicroad/seal-editor/commit/6be6bce498d31e2eae15b51cfe5af0eab28a1135))

# [1.12.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.11.0...@republicroad/seal-appshell@1.12.0) (2026-09-29)

### Features

- **appshell:** dedicated-function registry + catalogFilter — useCustomNodes restructured (track B M5/M1) ([465f93c](https://github.com/republicroad/seal-editor/commit/465f93c3d81902011e6a6e7077d747f22bb0dfce))
- **appshell:** FunctionCatalog — A1 function catalog productized (track B) ([55fdd62](https://github.com/republicroad/seal-editor/commit/55fdd62bbc7bc424e0a3e2596e871ac887c68b58))
- **appshell:** migrateGraph — version-anchored migration chains + drift report (track B M5b) ([c7a9073](https://github.com/republicroad/seal-editor/commit/c7a9073609b518ae59d5b4902eac6d7e4fc254e2))

# [1.11.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.10.0...@republicroad/seal-appshell@1.11.0) (2026-09-29)

### Features

- **appshell:** kernel full re-export — single-entry surface for hosts ([59e4782](https://github.com/republicroad/seal-editor/commit/59e4782ad4306a0be2d9ebc568675fe6265e99d4))

# [1.10.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.9.0...@republicroad/seal-appshell@1.10.0) (2026-09-29)

### Features

- **appshell:** ADR-008 L3 completion — simulationFooter pass-through on SkinnedDecisionGraph ([bb8696f](https://github.com/republicroad/seal-editor/commit/bb8696fbb459e90ba0f5256ee007643fc3484bdd))

# [1.9.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.8.0...@republicroad/seal-appshell@1.9.0) (2026-09-29)

### Features

- **appshell:** pattern-D auto-persist — AutoPersistController + useAutoPersist + sync badge ([6c32399](https://github.com/republicroad/seal-editor/commit/6c32399b680c1493cf5d6c80af23f66240be5dd9))

# [1.8.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.7.0...@republicroad/seal-appshell@1.8.0) (2026-09-29)

### Features

- **appshell,kernel:** ADR-008 L6 — panel search indexes container-internal tool names ([1f08b77](https://github.com/republicroad/seal-editor/commit/1f08b77f2ca309adee54ce73c277e1fb8e0e32a4))

# [1.7.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.6.0...@republicroad/seal-appshell@1.7.0) (2026-09-29)

### Features

- **appshell,kernel:** ADR-008 L1+L3 — host header slots & simulation footer slot ([d159ae1](https://github.com/republicroad/seal-editor/commit/d159ae1fe55d57556862753b86e68fe68158d522))
- **appshell:** schema 目录支持文件协议信封——{version, generatedAt, namespaces} ([303e95b](https://github.com/republicroad/seal-editor/commit/303e95b29b4b3a58bcc7650d47024ce3b311d93e))

# [1.6.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.5.0...@republicroad/seal-appshell@1.6.0) (2026-09-28)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.5.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.4.0...@republicroad/seal-appshell@1.5.0) (2026-09-27)

**Note:** Version bump only for package @republicroad/seal-appshell

## [1.4.2](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.4.1...@republicroad/seal-appshell@1.4.2) (2026-09-26)

**Note:** Version bump only for package @republicroad/seal-appshell

## [1.4.1](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.4.0...@republicroad/seal-appshell@1.4.1) (2026-09-26)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.4.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.3.0...@republicroad/seal-appshell@1.4.0) (2026-09-25)

**Note:** Version bump only for package @republicroad/seal-appshell

# [1.3.0](https://github.com/republicroad/seal-editor/compare/@republicroad/seal-appshell@1.2.0...@republicroad/seal-appshell@1.3.0) (2026-09-25)

**Note:** Version bump only for package @republicroad/seal-appshell

# 1.2.0 (2026-09-25)

### Bug Fixes

- **appshell:** kernel dep uses workspace:^ protocol (pnpm 10 requires explicit workspace linking) ([7429343](https://github.com/republicroad/seal-editor/commit/7429343bfd030ba24c8d8542817a3ee2b3281f83))
- **appshell:** peerDependencies reference @republicroad/seal-editor (was stale jdm-editor ^0.10.0) ([0b8a000](https://github.com/republicroad/seal-editor/commit/0b8a00023d347486ac7cc74da2a0158f0ea0a2cc))
- finish jdm-editor -> seal-editor rename across docs, CI, scripts and lockfile ([436d5ce](https://github.com/republicroad/seal-editor/commit/436d5ce06f617ec699b4c7a62286a7abb0762e60))
- remove stale @republicroad/jdm-editor dep from appshell (kernel renamed to seal-editor) ([83859be](https://github.com/republicroad/seal-editor/commit/83859becdd44ace2c0663fb705b2b1c48298f096))

# 1.1.0 (2026-09-24)

### Bug Fixes

- **appshell:** add #reui/* tsconfig path for source-direct kernel typecheck ([114afe9](https://github.com/republicroad/seal-editor/commit/114afe9b83c9956c182a39d919206493257f5733))
- **appshell:** add missing @storybook/react-vite devDependency ([49343dc](https://github.com/republicroad/seal-editor/commit/49343dc07857a340749c8b7b0721cac5c3ee9c1d))
- **appshell:** export createIndexedDbAdapter from shell barrel (missed in ac2116d) ([78dcca2](https://github.com/republicroad/seal-editor/commit/78dcca23c58359a6e72951acb6c96a189f3bfd55))
- **appshell:** include kernel ambient d.ts in the dts program (Phase 0 red-fix) ([bebaa86](https://github.com/republicroad/seal-editor/commit/bebaa86712e9a24d2b4a0bc36c84e4d841038738))
- **appshell:** restore DecisionGraphType import in integration story ([a71a957](https://github.com/republicroad/seal-editor/commit/a71a957908843da6f04ebe7043e5935f568cab62))
- **appshell:** round-trip GraphRecord.session in both persistence adapters ([57106d3](https://github.com/republicroad/seal-editor/commit/57106d364388f57edafbf04d65981a403415a67e))
- **appshell:** ShellHeader accepts ref objects for graphRef ([0ae6e74](https://github.com/republicroad/seal-editor/commit/0ae6e74fddf18f0cb6c3ba39c7e6b278239332ba))
- **appshell:** SkinnedDecisionGraph 补显式类型标注（TS2742 非可移植类型）+ dts 试点双失败模式入档 ([2256ddb](https://github.com/republicroad/seal-editor/commit/2256ddbc0c69213de5aecbda12184909d4274db8))
- **appshell:** vitest alias follows the seal-editor rename ([aba1d97](https://github.com/republicroad/seal-editor/commit/aba1d9783ed0cbec4dcc901a021d768b2f04108f))
- **appshell:** vitest alias value follows the directory rename ([b1c52e3](https://github.com/republicroad/seal-editor/commit/b1c52e36bd2d36c5d397c3b3d28b11ffb3fdb430))
- **build:** restore i18n catalogs shaken out of dist under rolldown ([588e610](https://github.com/republicroad/seal-editor/commit/588e6101f3c100c92e551a8bc85fcef5364b9c40))
- consumer-smoke tarball derives from package name; appshell #reui/* tsconfig path; playground imports swept ([92a3ae5](https://github.com/republicroad/seal-editor/commit/92a3ae5bdbb1dc56ed29b13080840642aafb75eb))
- **deps:** commit appshell vitest ^4.1.11 specifier ([fc637e5](https://github.com/republicroad/seal-editor/commit/fc637e5cde7d97f2bdebea111b63d8a7363dee93))
- **publish:** npm release-surface repairs — dts pathsToAliases off + I18n exports (0.8.1/0.9.1) ([d7ad7a0](https://github.com/republicroad/seal-editor/commit/d7ad7a0cd25ce5c7301f29fa237f4542d67d3fa7))

### Features

- **appshell,kernel:** S005 P1 skin toolbar slots (spec v1 confirmed) ([8b65d8a](https://github.com/republicroad/seal-editor/commit/8b65d8acb14bcb990f7c16cc3923b932932ff56b))
- **appshell:** add @republicroad/jdm-appshell package (scheme D consumer shell) ([c78a1ca](https://github.com/republicroad/seal-editor/commit/c78a1ca184f3a6aae034488fd6a096fbef08916b))
- **appshell:** auto version flag — meta.auto / listVersions / adapter passthrough (fifth batch auto-save) ([12d7b5c](https://github.com/republicroad/seal-editor/commit/12d7b5c84a48f89d3473750d65a8d34630a16589))
- **appshell:** IndexedDB local version adapter + auto badge on panel ([ac2116d](https://github.com/republicroad/seal-editor/commit/ac2116d7b777497715584b25d446600410d7cbdd))
- **appshell:** kernel+appshell integration story (Track C) ([9b637e2](https://github.com/republicroad/seal-editor/commit/9b637e2043ec0d575a0abc3c21c48e6d26ae2bd3))
- **appshell:** named versions (versionName archive + rename + panel filter) ([66cb38a](https://github.com/republicroad/seal-editor/commit/66cb38a59177e6ddf472092b4f0cc1febca2e798))
- **appshell:** restoreVersion — library-standard restore-is-forward entry ([8036305](https://github.com/republicroad/seal-editor/commit/80363054e041a91f116bc1c146e703c978c2e289))
- **appshell:** S005 P2 — skin right panel slots (Sheet container) ([e3345db](https://github.com/republicroad/seal-editor/commit/e3345db1aeebbd0572d8eeace8192e30c9123531))
- **appshell:** S005 P3 — skin header slots (ShellHeader) ([d1f46f8](https://github.com/republicroad/seal-editor/commit/d1f46f8b4650b7f808768700c51ac909c3bed73d))
- **appshell:** schema 容器节点编辑面板 — key 可编辑 + 函数下拉（udf-lab 缺陷修复） ([e7f0c56](https://github.com/republicroad/seal-editor/commit/e7f0c568498c6ccdab67df6d2819ecc7fd463641))
- **appshell:** simulator panel default icon → ReUI animated play-circle ([97549e5](https://github.com/republicroad/seal-editor/commit/97549e5fa81dbd5b301e455b461c694678c7d25d))
- **appshell:** simulator wiring (simulateHandler + createExecuteSimulate) ([dbb9129](https://github.com/republicroad/seal-editor/commit/dbb912955dbbe63010d47d973fec7768107cf6e8))
- **appshell:** version compare entry + playground integration closure ([838ac9e](https://github.com/republicroad/seal-editor/commit/838ac9e008573d689f8763f845fd046b10eae339))
- **appshell:** version history panel + session in persistence contract (fifth batch, host-side wiring in editor repo) ([545fcdc](https://github.com/republicroad/seal-editor/commit/545fcdca486747eec89756f3797dae11b8d592f1))
- **appshell:** version pinning (S007) — pinned meta + updateVersionMeta + panel pin controls ([66fbf87](https://github.com/republicroad/seal-editor/commit/66fbf873908e81b88a39cf354b074fd5ff48187a))
- **appshell:** VersionHistoryPanel i18n via kernel message catalog ([9d56a16](https://github.com/republicroad/seal-editor/commit/9d56a16d7e2a200b28e7ead59cdc1c6dfb47581c))
- **appshell:** VersionHistoryPanel i18n via kernel vh.* catalog + playground theme entry ([da22f52](https://github.com/republicroad/seal-editor/commit/da22f52f52efc6e8b71285a712f941c7e48e0716))
- **appshell:** versionName passthrough (named versions groundwork) ([9a9b151](https://github.com/republicroad/seal-editor/commit/9a9b1518fb0526e3b43a56f8a5fe8cd249a2434c))
- **brand:** grl- -> seal- prefix sweep across kernel and appshell ([2636adf](https://github.com/republicroad/seal-editor/commit/2636adff177370e15c5fe7b6a348a84058366797))
- **docs-site:** merge Rspress docs + Storybook into single Pages deployment ([0dde8c5](https://github.com/republicroad/seal-editor/commit/0dde8c5ac915bd4770bf477a434e50d932c271fe))
- **kernel:** computeGraphDiff engine + panel diff summaries (graph-diff P1) ([b8a1bc2](https://github.com/republicroad/seal-editor/commit/b8a1bc26f0e608420759216215f21ce912d27742))
- **repo:** enable pnpm catalog for shared dependency version management ([c6d70be](https://github.com/republicroad/seal-editor/commit/c6d70bed4d7f00f06911f43f877d2b9a83ba36c6))
- **zen-udf:** array invocation form promoted to default; ;; kept for legacy graphs ([e97f88e](https://github.com/republicroad/seal-editor/commit/e97f88e12dfe00b11f26fbacd0b67cb404845c25))
- **zen-udf:** named-call serialization form — three-form spec with $call reserved key ([65d1903](https://github.com/republicroad/seal-editor/commit/65d1903c340e1aa2223318c279a4201016657aab))
- **zen-udf:** notify domain — notify.webhook for IM bot notifications ([f38cc99](https://github.com/republicroad/seal-editor/commit/f38cc991233f698ff2bcc6536469f9c1028ffb9a))

### Performance Improvements

- **build:** declare sideEffects for deterministic host tree-shaking ([e0b198a](https://github.com/republicroad/seal-editor/commit/e0b198ac6faded747a484760b49c3a9b4e3c1448))
