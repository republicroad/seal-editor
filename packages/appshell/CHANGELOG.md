# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
