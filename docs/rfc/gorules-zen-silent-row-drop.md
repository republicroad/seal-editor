# 上游 issue 草稿：gorules/zen 表达式引用失败的静默降级（静默丢行/静默缺键）——fail-visible 提案

> 状态：**草稿就绪**——§2 英文正文可直接粘贴提交至 https://github.com/gorules/zen
> 实证锚点：[zen-dollar-binding-matrix](../design/zen-dollar-binding-matrix.md)（六轮原生引擎实测）·
> [夹具 expression-node-dollar-ref.json](../graph/expression-node-dollar-ref.json) ·
> 机械验证 `node scripts/probes/zen-reference-verify.mjs --full`
> 先例：dg-infer 推理循环空转缺口档（同型流程，上游已接纳修复）
> 引擎口径：@gorules/zen-engine 原生 2.1.0 与 2.1.4 行为一致（2026-10-12 探针复验）

---

# §1 宿主内部指引（中文）

- **问题一句话**：表达式引用失败在三个节点面一律**静默降级**（行消失/键缺失/返回 null），
  从不报错也不留痕——失败被降维成数据缺失，在离源头最远的地方才现形。
- **提案立场**：**fail-visible，非 fail-fast**——不要求改默认语义（存量图兼容红线），
  要求让失败可观测（trace 诊断 / 结果 warnings / 最低限度官方文档化）。
- **编辑器侧已做的部分拦截**（说明为何仍需上游）：静态词法提示只能拦"名字恰好已知"的
  场景（`$.<输入字段>` 误用）；拼错的名字（既非行键也非输入字段）静态面无法与
  "后续行将定义的键"区分，报了就是误报——只有引擎在求值那一刻知道引用真的失败。
- **提交建议**：三个复现合一个 issue（同一根因：引用求值失败被吞）；若上游偏好拆分，
  按"表达式节点丢行"为主、其余两条并入。

# §2 英文 issue 正文（paste-ready）

## Title

Expression reference failures degrade silently (dropped rows / missing output keys / null) — please make them visible (trace diagnostics, result warnings, or docs)

## Summary

Across three evaluation surfaces, a failed reference never surfaces as an error — the failure silently degrades into absent data:

**1. Expression node: the whole row is silently dropped.**

```json
{"expressions": [
  {"id": "1", "key": "c", "value": "3"},
  {"id": "2", "key": "g", "value": "$.c"},
  {"id": "3", "key": "e", "value": "$.a"}
], "passThrough": true}
```

Input `{"a": 1, "b": 2}` → output `{"a":1,"b":2,"c":3,"g":3}`. Row `e` is **gone** —
`$.a` resolves against the row-output scope where `a` does not exist, and the engine
drops the entire row without any error, warning, or trace entry. A typo'd reference
(`$.tota1`) behaves identically: the field is just missing from the decision output,
downstream.

**2. Decision table: failing output cells silently omit the key.**
An output cell evaluating an unresolvable identifier (e.g. `hit` instead of `'hit'`)
leaves the output field absent — no error, no hint, even with `hitPolicy: first`.

**3. Standalone evaluation: null.**
`evaluateExpressionSync('$.x', ctx)` returns `null` for any unresolvable `$` path,
indistinguishable from a legitimately-null value.

## Why this matters

Decision outputs drive business actions directly. A silently missing field is as
dangerous as a wrongly computed one, but invisible: authors get no feedback at the
authoring site, and the symptom surfaces far downstream as "this field is empty",
with nothing pointing back to the offending row. Host editors cannot fully
compensate — static analysis can flag references to *known* input fields, but cannot
distinguish a typo from a forward row key without false positives. Only the engine
knows, at evaluation time, that a reference truly failed.

## Proposal (fail-visible, not fail-fast)

We are **not** asking to change the default lenient semantics — existing graphs must
keep running. Any of these would resolve the issue:

1. **Trace diagnostics (preferred)**: when an expression-node row fails to evaluate,
   include it in the node's trace data with a reason
   (`{"key": "e", "dropped": true, "reason": "unresolvable reference $.a"}`).
   Editors and simulators can then surface it inline.
2. **Result warnings**: an optional (opt-in) `warnings` array on the decision
   result, collecting non-fatal evaluation anomalies (dropped rows, failing output
   cells, unresolved `$` paths returning null).
3. **Minimum**: document these silent-degradation behaviors in the official
   expression/decision-table docs — today they are entirely undocumented.

## Verified against

`@gorules/zen-engine` native 2.1.0 and 2.1.4 (Node binding): identical behavior,
verified by an automated fixture + corpus replay probe in our fork's CI.
Minimal repro graphs available on request.
