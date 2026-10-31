/*
 * Style-debt budget guard (roadmap §P4 / shadcn-theming-roadmap.zh-CN.md).
 *
 * Counts three families of styling debt inside @republicroad/seal-editor sources:
 *   1. `!important` declarations           — cascade-warfare artifacts
 *   2. raw hex colors OUTSIDE the token whitelist — palette leaks
 *   3. hardcoded bg surface classes (bg-white/bg-black) — mode-blind surfaces (ADR-025 M3)
 *
 * Both must never GROW. Exceeding the recorded budget fails the run;
 * burning debt down is encouraged — lower the constants when you do.
 *
 * Registry context: docs/shadcn-theming-roadmap.zh-CN.md Appendix A,
 * searchable source markers via `rg 'SEAL-STYLE-HACK' src`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../packages/seal-editor/src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Baselines recorded 2026-08 after Batch D phase-1 of the theming roadmap
 * (CM skin migrated to EditorView.theme; !important count nearly halved).
 * Hex budget zero: new palette literals must enter theme.tsx/tokens.css. */
const BUDGET = {
  // HK-15: prefers-reduced-motion 覆写内联 dashdraw 动画（animation: none !important
  // 是该场景唯一胜利形态——内联 style 只能由 !important 击穿）。有意识入账。
  important: 9,
  hex: 0,
  // ADR-025 M3：内核表面禁硬编码底色类（bg-white/bg-black 不随 data-mode 翻转，
  // verdict 明亮模式半翻转即此族问题）；预算 0=发现即红。白名单见 BG_WHITELIST_BASENAMES。
  hardcodedBg: 0,
};

/* Token/palette truth-sources and sandbox demos are exempt from hex counting.
 * zen.ts / diagnostic.tsx / function-debugger-log.tsx / ce-preview.tsx carry the
 * CodeMirror & Monaco syntax palettes — they join the derivation channel in P0. */
const HEX_WHITELIST =
  /theme\.tsx$|tokens\.css$|extensions[\\/]zen\.ts$|extensions[\\/]diagnostic\.tsx$|function-debugger-log\.tsx$|ce-preview\.tsx$|stories\.tsx$|theming[\\/]presets\.ts$|theming[\\/]compute\.ts$|theming[\\/]derive\.ts$|theming[\\/].*test\.tsx?$/;

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(css|tsx|ts)$/.test(entry)) yield full;
  }
}

let important = 0;
let hex = 0;
let hardcodedBg = 0;
const hexHits = [];
const bgHits = [];
// ADR-025 M3 白名单：非主题面的结构性白/黑（各处逐 site 核过）——
// 代码块预览强制白底芯片 / 契约浮层同款 / Modal·AlertDialog 的 50% 黑遮罩（两模式皆宜）/
// dt 禁用行 2% 黑染（禁用态降噪，暗下近隐形无害）。
// 按 basename 豁免（集合判定，无正则转义歧义）。
const BG_WHITELIST_BASENAMES = new Set([
  'ce-preview.tsx',
  'expression-item.tsx',
  'dialog.tsx',
  'alert-dialog.tsx',
  'table.tsx',
]);

for (const file of walk(SRC)) {
  let text = readFileSync(file, 'utf8');
  // Inline var(..., #fallback) defaults are consumed next to their definition
  // point and keep single-source truth in tokens.css / theme.tsx — not leaks.
  text = text.replace(/var\([^()]*\)/g, 'VAR()');
  // Comments may narrate past debt (SEAL-STYLE-HACK banners) — never counted.
  text = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
  important += (text.match(/!important/g) ?? []).length;

  if (!HEX_WHITELIST.test(file)) {
    let m;
    while ((m = HEX_RE.exec(text))) {
      // skip %23-encoded svg data URIs remnants that decode into a literal '#'
      if (m[0].toLowerCase() === '#fff' || m[0].toLowerCase() === '#ffffff') {
        /* still counted — white literals outside tokens are debt too (HK-09) */
      }
      hex += 1;
      hexHits.push(`${file.replace(SRC, '')}: ${m[0]}`);
    }
  }

  // ADR-025 M3：硬编码底色类计数（bg-white/bg-black 不随 data-mode 翻转）
  const bgBase = file.split(/[\\/]/).pop() ?? '';
  if (!BG_WHITELIST_BASENAMES.has(bgBase)) {
    const bgHits1 = text.match(/bg-(white|black)/g) ?? [];
    hardcodedBg += bgHits1.length;
    if (bgHits1.length > 0) bgHits.push(file);
  }
}

const overImportant = important > BUDGET.important;
const overHex = hex > BUDGET.hex;
const overBg = hardcodedBg > BUDGET.hardcodedBg;

console.log(
  `style-debt: !important ${important}/${BUDGET.important} · raw-hex(non-whitelist) ${hex}/${BUDGET.hex}` +
    ` · hardcoded-bg ${hardcodedBg}/${BUDGET.hardcodedBg}`,
);

if (overImportant || overHex || overBg) {
  if (overBg) console.log(bgHits.map((h) => h.split('|')[1] + ' (' + h.split('|')[0] + ')').join('\n'));
  if (overHex) console.log(hexHits.join('\n'));
  console.error(
    `\nBUDGET EXCEEDED${overImportant ? ' [!important]' : ''}${overHex ? ' [hex]' : ''}${overBg ? ' [hardcoded-bg]' : ''}.` +
      '\nNew debt requires an explicit SEAL-STYLE-HACK marker + registry row; fix or raise the budget consciously.',
  );
  process.exit(1);
}
