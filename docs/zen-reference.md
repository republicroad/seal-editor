# Zen Expression & Node Reference

Status: **primary customer reference · continuously tracked** (established 2026-10-10)
Versions: runtime `@gorules/zen-engine-wasm` 0.23.1 · verified against native `@gorules/zen-engine` 2.1.x · document format JDM (`application/vnd.gorules.decision`)
See also: [zen-udf](./zen-udf) (custom-function runtime) · [`$` binding matrix (evidence file)](./design/zen-dollar-binding-matrix) · [expression-node fixture](./graph/expression-node-dollar-ref.json) · [ADR-015](./adr/015-custom-function-node-spec) / [ADR-016](./adr/016-custom-function-typed-value-envelope) / [ADR-017](./adr/017-dedicated-editor-plugin-system)

> This document governs the **zen expression language** and **zen-engine node semantics** —
> the first stop when integrating the decision engine.
> Maintenance rules: ① pin every claim to an evidence anchor (fixture graph / regression corpus / test file); ② every engine upgrade goes through §7 and appends a §6 entry; ③ this file carries customer-facing conclusions — measurement detail and edge analysis live in the evidence file.

---

## 1. Expression Language

### 1.1 Lexicon & Types

| Kind | Form | Example |
| --- | --- | --- |
| Numbers | decimal, scientific notation | `42` · `1.5e3` · `2E-2` |
| Strings | single quotes | `'hello'` |
| Template strings | backticks + `${expr}` | `` `sum: ${sum([1,2,3])}` `` |
| Boolean / null | | `true` · `false` · `null` |
| Arrays | brackets | `[1, 2, 3]` |
| Objects | braces | `{a: 1, b: 'x'}` |
| Identifiers | bare name, dot path, dynamic key | `a` · `user.name` · `obj[key]` |

Type set: `null` / `boolean` / `number` / `string` / `date` / `object` / `array`.
Introspection `type(x)`, `isNumeric(x)`; conversions `number()` / `string()` / `bool()` / `date()`.

Assignment expressions: `key = expr` produces an object in standalone evaluation (`"a = 5"` → `{"a": 5}`); nested paths and multiple assignments supported.

### 1.2 Operator Table

| Family | Form | Corpus-verified example |
| --- | --- | --- |
| Arithmetic | `+ - * / %` | `a + b` |
| Comparison | `== != > < >= <=` | `score > 70` |
| Interval | `[lo..hi]` (open/closed variants) | `[20..40]` (decision-table range test) |
| Logic | `and or not` | `true and false` |
| Ternary | `cond ? a : b` (chainable) | `score > 90 ? 'A' : score > 80 ? 'B' : 'C'` |
| Nullish | `??` (first non-null) | `null ?? 123 ?? 321` → `123` |
| Template | `` `...${expr}...` `` | `` `reference: ${a}` `` |
| Assignment | `path = expr` | `name = 'John'` |
| Member access | `.`, `[i]`, slices | `list[0]` · string slices |
| Closures | `#` positional; `as` alias | `map([1,2,3], # * 2)` → `[2,4,6]`; `map(products as p, p.price)` |

Scientific notation is a **first-class number literal**: parsing, arithmetic, comparison, conversion, array operations and template interpolation all covered (11 corpus sections).

### 1.3 Built-in Functions (standard)

Corpus: jdm repo `packages/zen-udf/src/expression-regression/standard.csv` (657 lines · 67 sections, all engine-executable assertions).

| Family | Functions |
| --- | --- |
| Array transforms | `map` `filter` `flatMap` `some` `all` `none` `count` `len` `merge` `mergeDeep` |
| Statistics | `sum` `avg` `min` `max` `median` `mode` `rand` |
| Strings | `upper` `lower` `trim` `startsWith` `endsWith` `contains` `split` `matches` `fuzzyMatch` `extract` |
| Math | `round` `trunc` `floor` `ceil` `abs` |
| Types & objects | `type` `isNumeric` `number` `string` `bool` `keys` `values` `duration` |

### 1.4 Date & Time Functions

Corpus: `date.csv` in the same directory (303 lines · 17 sections). Dates are a **first-class type with a fluent method chain**.

| Family | API |
| --- | --- |
| Construction | `d('2023-10-15')` (all ISO 8601 forms: date / time / offset) · `duration(n, unit)` |
| Getters | `.year()` `.month()` `.day()` `.hour()` `.minute()` `.second()` `.weekday()` `.dayOfYear()` `.quarter()` `.timestamp()` `.string()` |
| Manipulation | `.add(n, unit)` `.sub(n, unit)` `.set(unit, v)` `.startOf(unit)` `.endOf(unit)` `.tz(zone)` |
| Checks | `.isValid()` `.isSame()` `.isBefore()` `.isAfter()` `.isSameOrBefore()` `.isSameOrAfter()` `.isToday()` `.isYesterday()` `.isTomorrow()` `.isLeapYear()` |
| Diff & format | `.diff(d2, 'day'|'hour'|'month'|…)` `.format(fmt)` `.offsetName()` |

Example: `d('2023-10-15').diff(d('2023-10-10'), 'day')` → `5`.
DST semantics: local times falling inside a gap **move forward by the gap**; ISO instants with offsets keep their instant.

### 1.5 `$` Scoping & Root Binding

Full measurement log: [evidence file](./design/zen-dollar-binding-matrix); customer-facing conclusions below (2026-10-10, six native-engine rounds).

| Evaluation context | Bare `$` | `$root` | `$nodes.<name>.<field>` | Bare identifier | On failed reference |
| --- | --- | --- | --- | --- | --- |
| Expression-node row | Row-output accumulation: `$.<rowKey>` references prior rows | Node input root | Prior node outputs | Input fields | **Row silently dropped** |
| Table input cell · unary (field column) | Column value (unary left operand) | — | — | — (implicit operand) | No match |
| Table cell · full expression | Unbound | Node input root | Prior node outputs | Input fields | No match / missing key |
| Standalone `evaluateExpression` | Unbound | Context root | — | Context top-level keys | Returns null |

Three iron rules:

1. **Cross-references inside nodes use `$.<rowKey>` (expression nodes) or `$nodes.<name>.<field>` (cross-node); input data always uses bare names or `$root`.**
2. **Row keys never shadow bare names** in expression nodes: input `{v:1}`, prior row `v=99`, later row `x=v` → `x=1` (bare names always resolve against the input; the output's `v` is overwritten by the row).
3. A `$.<non-row-key>` reference **silently drops the row without error** — integrators must assert expected keys on the output side.

### 1.6 Standalone vs In-Graph Evaluation

- `evaluateExpression` / `evaluateExpressionSync` (engine-direct): an ordinary variable environment — context top-level keys resolve bare; bare `$` is unbound (returns null); `$root` binds to the context root.
- Full decision-graph execution: each node gets its own evaluation scope (§1.5 applies per column); `$root` = that node's input root.
- Host wrapper layers (jdm heritage) once wrapped context as `{result: data}` + `$.result.x` — incompatible with the engine contract; **fixed (zen-udf 1.4.0, 2026-10-11)**: context is flattened to bare keys (object results ARE the context, top-level keys resolve directly), non-object results bind as a single `result` key (`result == 42` / `len(result) == 2` forms), and `$`-root / `$.path` navigation is pinned to silent null by sentinel tests. Migration discipline and implementation receipt: [ADR-014](./adr/014-zen-udf-fixture-contract) addendum.

---

## 2. Node Types

Per node: purpose / content schema / `$` binding / evaluation semantics / error behavior.
Example graphs paste directly into a `contentType: "application/vnd.gorules.decision"` document.

### 2.1 inputNode — input declaration

- **Schema**: `{ "schema": "<JSON Schema string>" }` (empty string = no validation)
- **Semantics**: graph entry; no transformation. The schema drives editor field inference and validation.

### 2.2 outputNode — output declaration

- **Schema**: no content (only `id/type/position/name`)
- **Semantics**: marks the graph output; the execution result is the data arriving at the output node.

### 2.3 expressionNode — expression node

- **Schema**:

```json
{
  "expressions": [ { "id": "required", "key": "outputKey", "value": "expression" } ],
  "passThrough": true,
  "inputField": null,
  "outputPath": null,
  "executionMode": "single"
}
```

- **Semantics**: rows evaluate **in order** (prior rows' outputs are visible to later rows via `$`); `passThrough` merges input fields into the output; row outputs overwrite same-name input keys.
- **`$` binding**: §1.5 row one — `$` = row-output domain, `$root` = input root, bare = input fields, `$nodes` cross-node.
- **Example** (`$.c` references prior row = 3; `$.a` silently dropped): [fixture](./graph/expression-node-dollar-ref.json).
  Input `{a:1, b:2}` → output `{a:1, b:2, c:3, d:4, g:3}` (row `e=$.a` dropped).

### 2.4 decisionTableNode — decision table

- **Schema** (jdm flat format; the GoRules documents `columns` variant is **not supported**):

```json
{
  "hitPolicy": "first",
  "inputs":  [ { "id": "i1", "field": "cart.weight", "name": "Weight" } ],
  "outputs": [ { "id": "o1", "field": "fee", "name": "Fee", "default": "0" } ],
  "rules": [
    { "_id": "r1", "_description": "optional", "i1": "> 40", "o1": "40" }
  ],
  "passThrough": false,
  "inputField": null,
  "outputPath": null,
  "executionMode": "single"
}
```

- **Two column forms**:
  - **field column + unary cells** (standard): `field` is an input field path (nested `u.a` works), cells are unary expressions (`> 40`, `"US"`, `[20..40]`); in unary, `$` = the column value.
  - **field-less column + full-expression cells**: cells are complete expressions; bare names / `$root` / `$nodes` follow §1.5 (**`$` does not mean the input root** — `$.a` never matches).
- **hitPolicy**: `first` (return on first match, single object) / `collect` (gather all matching rules, **outputs an array**); switch uses the same value set. Any other value (e.g. `standard`) is a parse error (`unknown variant`).
- **Errors**: no match → `default` applies; a failing output cell → that key silently missing.

### 2.5 functionNode — function node (JS)

- **Schema**: `{ "source": "import zen from 'zen';\nexport const handler = async (input) => { ... }" }`
- **Semantics**: a JavaScript code node; `input` is the node input; the **`$` binding system does not apply**. Best for imperative aggregation and external-call orchestration (host functions plug in via the zen-udf host-function mechanism — see [zen-udf](./zen-udf)).

### 2.6 switchNode — switch node

- **Schema**:

```json
{
  "hitPolicy": "first",
  "statements": [
    { "id": "s1", "condition": "$.score > 70", "name": "pass" },
    { "id": "s0", "isDefault": true, "name": "fallback" }
  ]
}
```

- **Semantics**: picks a branch by `condition` (full expression; `$` semantics as in table full-expression cells); `isDefault` is the fallback; `name` mirrors onto the outgoing edge as the branch label.

### 2.7 customNode — custom node (extension point)

- **Semantics**: the node-kind extension point; hosts plug in via the two-layer registry (existence layer appshell / takeover layer kernel, [ADR-017](./adr/017-dedicated-editor-plugin-system)).
- **zen-udf custom function node**: call expressions use the canonical form `{$call: "fn", kwargs: {...}}` (legacy positional arrays and `;;` strings remain permanently dual-read, [ADR-015](./adr/015-custom-function-node-spec) / TypedValue envelope [ADR-016](./adr/016-custom-function-typed-value-envelope)); instance dependencies schedule as a DAG (`$.key` auto-builds the graph); kwargs are **not wired to `$`** (jdm repo `packages/zen-udf/docs/dollar-scope-decision.md` ruling).
- **Example graph**: repo `apps/demo-server/graphs/custom-node-example.json` (roster `$call` canonical / ping / expression combo).

---

## 3. Document Format

- `contentType: "application/vnd.gorules.decision"`; top level `{nodes, edges}`, edge `{id, sourceId, targetId, type: "edge"}`.
- Expression rows **require `id` per row** (parsing fails otherwise).
- Legacy-graph obligations: positional call arrays, `;;` strings and older schemas remain permanently dual-read; new writes always emit the canonical form ([ADR-022](./adr/022-zen-udf-write-path-switch-plan)).

## 4. Error & Silent-Behavior Catalog

| Behavior | Trigger | Integrator guidance |
| --- | --- | --- |
| **Silent row drop** | Expression row references `$.<non-row-key>` | Assert expected keys on output; editor checker should hint "use a bare name" |
| No-match missing key | Table misses with no `default`; failing output cell | Provide explicit `default`; validate key existence for critical fields |
| null return | Standalone evaluation with bare `$` | Use a bare name or `$root` |
| `DANGLING_REF` / `INVALID_DEPENDENCY` / `CYCLE_DETECTED` | Custom-node instance dependencies: missing reference / unknown dependency key / dependency cycle | Handle per the ADR-015 addendum scheduling error codes |

## 5. Fixture Index

| Fixture | Pins |
| --- | --- |
| [`docs/graph/expression-node-dollar-ref.json`](./graph/expression-node-dollar-ref.json) | `$` = row domain / bare = input / `$.<inputField>` silent drop |
| repo `apps/demo-server/graphs/custom-node-example.json` | customNode `$call` canonical / instance dependencies |
| jdm repo `packages/zen-udf/src/expression-regression/{standard,date,unary}.csv` | full expression-language regression (1068 assertion lines) |
| jdm repo `packages/zen-udf/graph/custom_fullnode.json` | `$root` / `$nodes` cross-node reference examples |

## 6. Tracking Log

| Date | Engine version | Change | Evidence anchor |
| --- | --- | --- | --- |
| 2026-10-10 | wasm 0.23.1 / native 2.1.0 (2.1.4 line same behavior) | Established: full-context `$` binding matrix (six measured rounds); expression-language skeleton + function inventory (corpus-derived); 7 node schemas verified | matrix evidence file · expression-node-dollar-ref fixture · CSV 1068 lines |
| 2026-10-11 | zen-udf 1.4.0 | OQ3 final fix implemented: host evaluator context flattened to bare keys (§1.6 closed), jdm commits 23372bdb / release deb4e1b1, full suite 1124 green | [ADR-014 implementation receipt](./adr/014-zen-udf-fixture-contract) |

## 7. Engine-Upgrade Checklist

1. Script verification from disk (**never inline `node -e`** — bash eats `$` and backticks); run every fixture in `docs/graph/`;
2. Corpus spot-checks: replay ≥10 assertion lines each from `standard.csv` / `date.csv` / `unary.csv`;
3. Diff this document: verify §1.2 operators, §1.5 `$` matrix, §2 node schemas, §4 error catalog section by section;
4. Append a §6 tracking entry (date / new version / change / anchors); sync the matrix evidence file on any behavior change.
