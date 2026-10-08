# verdict 接入交接文档（seal-editor / zen-udf → verdict）

- 日期: 2026-09-24
- 修订: 2026-10-08（版本基线刷新至收官版；§3 补 ADR-011/015/016 契约要点）
- 性质: **交接文档** —— seal-editor / zen-udf 侧工作已收官，本文档列出 verdict 侧
  需要承接的实现项、契约与核对清单
- 读者: verdict 平台团队（model-execute 服务、UDF packs、数据面实现）

## 0. 两侧包的当前版本基线

| 包 | 版本 | npm | 说明 |
| --- | --- | --- | --- |
| `@republicroad/seal-editor` | **1.33.0** | ✅ 已发布 | 决策图编辑器内核（Base UI 全栈、规范形调用、节点卡/工具栏/停靠检查器、ADR-017 插件体系、code-block 渲染族） |
| `@republicroad/seal-appshell` | 1.37.0 | ✅ 已发布 | 换肤编辑器壳（SkinnedDecisionGraph / 主题 Provider / 版本历史含 unified patch 行级 diff / 持久化适配器 / auto-persist） |
| `@republicroad/zen-udf` | **1.2.0** | ✅ 已发布 | 执行内核：DecisionRuntime + 五域参考实现（ab/geo/validate/template/dt）+ 端口面 + 具名调用双读 + 实例依赖 DAG 调度 + 参数值信封 |

> **zen-udf 0.x → 1.x 是规范换代**：1.0.0 冻结调用契约（规范形 `{$call, kwargs}`），
> 1.1.0 引入参数值信封，1.2.0 具名双读——接入 MUST 以 ≥1.2.0 起步，禁止 0.x。

注意：`@republicroad/jdm-editor`（旧包名）已 deprecated，指向 seal-editor。

## 1. verdict 侧需要实现的四件端口

每个端口在 zen-udf 内有参考实现 + conformance 契约测试，verdict 实现必须**复用同一套
conformance 跑绿**后才可接入（契约即测试，见 BP-03）：

| 端口 | 接口位置 | verdict 实现 | conformance |
| --- | --- | --- | --- |
| `RateStore` | `zen-udf/contrib/rate-window.ts`（incr/window/peek） | Redis（ioredis） | `rate-store-conformance.ts` 直接复用 |
| `ConcurrencyLimiter` | `zen-udf/limiter.ts`（per-tenant 信号量） | Redis 分布式信号量（FIFO 公平性对齐内存参考实现） | limiter 语义测试 |
| `EgressGuard` | `zen-udf/contrib/http.ts`（per-tenant 出口白名单，防 SSRF） | 按租户域名 allowlist 服务 | egress 拦截测试 |
| `SecretResolver` | `zen-udf/contrib/http.ts`（`${secret:名称}` 按租户解析，凭证不进图内容） | 对接 verdict 密钥服务 | secret 不落 trace 断言 |

装配方式：

```ts
configureHttpUdf({ egressGuard, secretResolver });   // http + notify 域共享同一配置面
runtime = new DecisionRuntime({ registry, limiter, breaker, metricsSink });
```

另需 **Prometheus metricsSink**：消费 `kind: 'udf' | 'circuit' | 'limiter'` 三类事件。

## 2. model-execute 服务组装规范

```ts
import { DecisionRuntime, createUdfRegistry, runWithExecContext } from '@republicroad/zen-udf';

const runtime = new DecisionRuntime({
  registry: createUdfRegistry({ packs: [fraudPack, kycPack] }),
  cacheCapacity: 500,               // L1 容量按模型数调优
  resultValidation: 'warn',         // 灰度后按租户切 enforce
  limiter,                          // Redis 化并发闸
  metricsSink: prometheusSink,
});

app.post('/v1/models/:key/execute', async (c) => {
  const { tenantId, userId, requestId } = resolveAuth(c);
  const { rev } = resolveModelRev(c);            // modelId:v{rev} 模式
  const input = await c.req.json();

  return runWithExecContext({ tenantId, userId, requestId }, async () => {
    const result = await runtime.evaluateAsync(`${tenantId}:${key}`, input, { trace: true }, `v${rev}`);
    // 缓存键 ${tenantId}:${key}@v${rev}；模型发布 = 新 rev 建档 + 旧键删除
  });
});
```

多租户纪律：**注册是 deploy-time**（UdfPack 全租户同一份）；租户差异一律走
ExecContext + 端口；禁止 per-tenant 注册、禁止图内容携带凭证/租户身份。

## 3. UDF Pack 契约（verdict 首批：fraudPack / kycPack）

```ts
const fraudPack: UdfPack = {
  namespace: 'fraud',
  tools: [defineToolFor<FraudArgs>({ name: 'velocity', /* schema + fn */ })],
};
// 注册：createUdfRegistry({ packs: [fraudPack, kycPack] })
```

三件套缺一不可（见 seal-editor 仓 `docs/host-functions-guide.md` §1–§5）：
1. `parametersSchema`（编辑器表单/入参校验）+ `returnsSchema`（resultValidation）
2. 结构化错误码（不抛异常；内置码 `INVALID_PARAM/UDF_TIMEOUT/INVALID_RESULT/CIRCUIT_OPEN`…）
3. conformance 测试（合成向量；严禁真实证件号）

发布前跑 `packChecks(pack)` 质量层；act 语义工具必须声明 `idempotent`（Z1）。

### 3.1 调用与参数契约（ADR-011 / 015 / 016，2026-10 立法——接入必读）

- **调用规范形 `{$call, kwargs}`**（ADR-015）：位置数组已**停写**，读取双读长期；
  verdict 侧任何手写图、迁移、replay 工具 MUST 产出规范形（具名、顺序无关、
  schema 可校验，中插参数静默错位类失败根除）。写路径切换前置核对：全部图消费
  引擎 ≥ zen-udf 0.14（1.2.0 自然满足）；**漂移带 MUST 消费
  `detectKwargsEnvelopeAmbiguity`**（平面调用向名为 kwargs 的参数传 Record 的
  唯一行为变化点，检出即提示迁移规范形）；
- **TypedValue 参数值信封**（ADR-016）：参数值 = 模式 + 内容二元组
  （字面量/表达式/引用显式化，字面量歧义根治）——pack 作者声明参数、编辑器
  保存、引擎绑定三处同一信封语义；
- **语义三元 `query | observe | act` 不可折叠**（ADR-011）：每个 defineTool
  声明必填；`idempotent` 仅 act 语义必须（Z1）；
- **实例依赖调度**（zen-udf 0.15，已实现）：函数节点实例默认并行，`dependsOn`
  或 `$.key` 自动建图才串行；悬空引用/环/重复输出 = 结构化错误
  （`DANGLING_REF`/`CYCLE_DETECTED`/`DUPLICATE_OUTPUT`）；
- **`config.__meta__.packVersion` 版本锚**：自定义节点 seed 时记录创建时的
  pack 版本——版本迁移链（migrateGraph）与漂移审计的锚点，verdict 侧自建
  seed 逻辑时 MUST 写入。

## 3.5 专用编辑器插件体系契约（ADR-017，2026-10-08 已实施）

pack 除执行侧（上节）外，可在**编辑侧**声明专属编辑面板——内核零改动、零发版：

- **声明面**：`createJdmNode`/`definePack` 的 spec 带 `renderTab`（编辑面板）+
  可选 `tester`（接管谓词）+ `rank`（优先级）；装进宿主 `customNodes` 数组即自动
  接管。作者入口：[pack-authoring-guide](./pack-authoring-guide.md)；
  活示例：Storybook **Decision Graph/PackAuthoring** 故事（~60 行迷你 pack）；
- **匹配语义**：kind 精确组按 rank 降序 → 组内 tester 仲裁（第一个「无 tester
  或 tester 通过」者胜）→ 精确组全拒回落跨 kind tester 组；同 rank 按声明序；
  tester 抛异常按不匹配（单 pack 故障隔离）；
- **状态桥纪律**：pack 面板写配置必须走 `useDecisionGraphActions().updateNode`
  immer 管道（撤销/自动保存/onChange 链一致），回调返回 draft；
- **config 键主权**：`content.config` 多写手共享，pack 只写自有键（红线，
  [custom-node-editor-spec](./custom-node-editor-spec.md) §2）；
- **治理先行**：宿主 `allowedNamespaces` 过滤先于接管解析——verdict 按 namespace
  关停 pack 时，其编辑面板随 spec 一起从解析器输入中消失（tester 无法复活），
  存量节点回退兜底表格（只读不白块）；
- **verdict 首批建议**：fraud/kyc pack 各带一个 renderTab（velocity 的窗口
  配置面板是最自然的第一个专属编辑器）；争抢未出现前不设 rank；
- **存在性层（待触发）**：catalog 载荷驱动的 namespace 注册表 + 版本迁移器
  （[dedicated-node-registry-design](./dedicated-node-registry-design.md) #4/#5）——
  **触发条件 = verdict 侧第三方 pack 贡献或函数 schema 首次 breaking change**，
  届时由该档启动实施。

## 4. L0 内容存储（PostgreSQL，rev 化）

- 模型内容按 `${tenantId}:${key}` + `rev` 存档；发布 = 新 rev 建档 + 旧键失效
- zen-udf 侧通过 loader 函数形态接入（引擎 2.0.2 语义，见 ADR-003 缓存所有权）
- **失效广播是宿主职责**：模型发布成功后向所有副本投递失效事件（Redis pub/sub 或等效），
  副本调 `decisionCache.delete(tenantId, key, rev)`（幂等、并发安全，已由哨兵测试钉住）

## 5. verdict 侧建议实现顺序

1. **四端口 Redis/服务实现**（RateStore / ConcurrencyLimiter / EgressGuard / SecretResolver），每件过 conformance
2. **seal-demo 验证应用**：基于 editor 仓 fork，装 `@republicroad/seal-editor@^1.33.0` + `@republicroad/seal-appshell@^1.37.0` + `@republicroad/zen-udf@^1.2.0`，
   跑通「画图 → 保存 L0 → model-execute 执行」闭环
3. **velocity**（对照 rate-window 的 RateStore 泛化；规划已展开见 [velocity-udf-plan.md](./velocity-udf-plan.md)）+ fraud/kyc 首批 UDF packs（含编辑侧 renderTab，§3.5）
4. **PostgreSQL L0** + 失效广播
5. Prometheus metricsSink 接入，观察 `udf/circuit/limiter` 三类指标

## 6. 交接核对清单

- [ ] 四端口实现过 conformance（RateStore / ConcurrencyLimiter / EgressGuard / SecretResolver）
- [ ] fraudPack / kycPack 过 `packChecks` 质量层
- [ ] fraudPack / kycPack 编辑侧 renderTab（§3.5，velocity 窗口配置面板优先）
- [ ] 调用规范形核对：手写/迁移工具产出 `{$call, kwargs}`；漂移带接 `detectKwargsEnvelopeAmbiguity`（§3.1）
- [ ] 参数值信封三模式对齐（ADR-016）；自定义节点 seed 写入 `__meta__.packVersion`
- [ ] PostgreSQL L0 rev 化存储就绪
- [ ] model-execute 最小闭环：execute → trace → audit journal → Prometheus 指标可见
- [ ] 失效广播链路演练（双副本场景）
- [ ] 多租户纪律走查（无 per-tenant 注册、无图内容凭证、ExecContext 强制 tenantId）
