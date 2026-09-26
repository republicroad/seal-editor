# Theme Tokens — `--seal-color-*` Reference / 主题 Token 参考

> The complete `--seal-*` token set the kernel injects per mode, which keys the
> shadcn semantic bridge consumes ("bridged"), and which stay kernel-only
> ("non-bridged"). English is canonical; the styling decision record lives in
> [`styling-scss-vs-tailwind.md`](./styling-scss-vs-tailwind.md).

## Injection pipeline / 注入链路

`JdmConfigProvider` → `computeTheme()` (`theming/compute.ts`) — pure merge:
**calibrated mode preset** (`presets.ts`, light/dark) ← **seed derivation**
(`derive.ts`, brand families only) ← **explicit user overrides** — then the
result is injected as a `:root` style block, or as inline properties on the
`.seal-root` island container when the provider mounts inside one (scoped
injection, multiple independently-themed islands supported; `data-mode` lives
on the container).

Hosts override any token two ways: `JdmConfigProvider theme.token` (typed map)
or raw `--` passthrough (any `--*` key in overrides lands verbatim — escape
hatch).

## Bridged keys (10) — consumed by the shadcn semantic layer

`styles/tokens.css` maps these onto generic shadcn names (`--background`,
`--primary`, `--border`, …) inside `.seal-root`, with static fallbacks per
mode. **These are the only keys host shadcn-based styling should rely on.**

`--seal-color-bg-layout` `--seal-color-bg-elevated` `--seal-color-bg-container`
`--seal-color-bg-container-disabled` `--seal-color-bg-text-hover`
`--seal-color-text` `--seal-color-text-secondary` `--seal-color-primary`
`--seal-color-border` `--seal-color-error`

## Non-bridged keys (32) — kernel-internal, overridable

Everything else in the injected map. Components may consume them; hosts may
override them via `theme.token`, but there is no bridge guaranteeing them a
shadcn name. Grouped:

| Group | Keys |
| --- | --- |
| Primary family (states) | `--seal-color-primary-bg` `--seal-color-primary-bg-fade` `--seal-color-primary-bg-hover` `--seal-color-primary-border` `--seal-color-primary-border-hover` `--seal-color-primary-hover` `--seal-color-primary-active` `--seal-color-primary-text-hover` |
| Status quadruples (success / error / warning / info) | `--seal-color-success(-bg,-border)` `--seal-color-error(-bg,-border)` `--seal-color-warning(-bg,-border,-text)` `--seal-color-info(-bg,-border,-text)` |
| Text (auxiliary) | `--seal-color-text-base` `--seal-color-text-disabled` `--seal-color-text-light-solid` `--seal-color-text-placeholder` |
| Field tokens (dt/dg form controls) | `--seal-color-field-input(-hover)` `--seal-color-field-output(-hover)` |
| Borders (auxiliary) | `--seal-color-border-hover` `--seal-color-border-fade` |
| Chrome statics | `--seal-color-bg-mask` |

Notes:

- `--seal-color-primary-bg-fade` / `--seal-color-border-fade` are alpha-fade
  variants computed per mode in `presets.ts` `MODE_EXTRAS` (not seed-derivable).
- Node-kind colors are separate kernel keys (`--node-color-*` mapped onto
  `--seal-color-primary` for the blue family) — not part of the `--seal-color-*`
  namespace and not bridged.
- Editor chrome surfaces (CodeMirror tooltips, diagnostic chips, Monaco
  error-line) are defined in `styles/tokens.css` under the ISLAND scope with
  static per-mode values — see the "Editor chrome surfaces" note in
  [`styling-scss-vs-tailwind.md`](./styling-scss-vs-tailwind.md) §1.
- ADR note (L2 removal): `--seal-primary-color(-bg)` duplicates were removed;
  see the comment in `compute.ts` and the host checklist in
  `archive/research/grl-var-flatten.md`.

## Full injected map

The authoritative list is the return object of `computeTheme` in
`packages/seal-editor/src/theming/compute.ts` (42 `--seal-color-*` keys plus
`--seal-control-outline`, `--seal-font-family`, `--seal-line-height`,
`--seal-border-radius` and any raw `--` passthroughs). This doc is a reading
guide; the code is the contract.
