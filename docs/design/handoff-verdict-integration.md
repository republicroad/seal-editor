# verdict 接入交接文档（seal-editor / zen-udf → verdict）

- 日期: 2026-09-24
- 性质: **交接文档** —— seal-editor / zen-udf 侧工作已收官，本文档列出 verdict 侧
  需要承接的实现项、契约与核对清单
- 读者: verdict 平台团队（model-execute 服务、UDF packs、数据面实现）

## 0. 两侧包的当前版本基线

| 包 | 版本 | npm | 说明 |
| --- | --- | --- | --- |
| `@republicroad/seal-editor` | **1.1.0** | ✅ 已发布 | 决策图编辑器内核（Base UI 全栈、三形态调用、节点卡/工具栏/停靠检查器） |
| `@republicroad/seal-appshell` | 1.0.0 | ✅ 已发布 | 换肤编辑器壳（SkinnedDecisionGraph / 主题 Provider / 版本历史 / 持久化适配器） |
| `@republicroad/zen-udf` | **0.6.0** | ✅ 已发布 | 执行内核：DecisionRuntime + 五域参考实现（ab/geo/validate/template/dt）+ 端口面 |

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

## 4. L0 内容存储（PostgreSQL，rev 化）

- 模型内容按 `${tenantId}:${key}` + `rev` 存档；发布 = 新 rev 建档 + 旧键失效
- zen-udf 侧通过 loader 函数形态接入（引擎 2.0.2 语义，见 ADR-003 缓存所有权）
- **失效广播是宿主职责**：模型发布成功后向所有副本投递失效事件（Redis pub/sub 或等效），
  副本调 `decisionCache.delete(tenantId, key, rev)`（幂等、并发安全，已由哨兵测试钉住）

## 5. verdict 侧建议实现顺序

1. **四端口 Redis/服务实现**（RateStore / ConcurrencyLimiter / EgressGuard / SecretResolver），每件过 conformance
2. **seal-demo 验证应用**：基于 editor 仓 fork，装 `@republicroad/seal-editor@^1.1.0` + `@republicroad/seal-appshell@^1.0.0`，
   跑通「画图 → 保存 L0 → model-execute 执行」闭环
3. **velocity**（对照 rate-window 的 RateStore 泛化）+ fraud/kyc 首批 UDF packs
4. **PostgreSQL L0** + 失效广播
5. Prometheus metricsSink 接入，观察 `udf/circuit/limiter` 三类指标

## 6. 交接核对清单

- [ ] 四端口实现过 conformance（RateStore / ConcurrencyLimiter / EgressGuard / SecretResolver）
- [ ] fraudPack / kycPack 过 `packChecks` 质量层
- [ ] PostgreSQL L0 rev 化存储就绪
- [ ] model-execute 最小闭环：execute → trace → audit journal → Prometheus 指标可见
- [ ] 失效广播链路演练（双副本场景）
- [ ] 多租户纪律走查（无 per-tenant 注册、无图内容凭证、ExecContext 强制 tenantId）
