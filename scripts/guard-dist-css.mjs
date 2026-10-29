// ADR-023 #5 构建守卫（2.0 strict）：dist/style.css MUST 已包进 @layer seal-editor，
// 且 LEGACY `:root` 接管选择器 MUST 不存在（D2 step 2 已删——回归即红）。
// 禁令形态收窄：`:not(:has(.seal-root))` 精确匹配（tailwind.css 暗色祖先宽容的
// `:not(:has(.seal-root[data-mode='dark']))` 是合法存活形态，不误伤）。
// 用法：node scripts/guard-dist-css.mjs   （validate 工作流在 Build 后调用）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'seal-editor',
  'dist',
  'style.css',
);

let css;
try {
  css = readFileSync(cssPath, 'utf8');
} catch {
  console.error('[guard-dist-css] ✗ dist/style.css 不存在（构建未产出？）');
  process.exit(1);
}

const failures = [];

if (!css.trimStart().startsWith('@layer seal-editor')) {
  failures.push('dist/style.css 未包裹进 @layer seal-editor（ADR-023 D1）——重跑 build（wrap-dist-css 应自动包裹）');
}

if (css.includes(':root:not(:has(')) {
  failures.push(
    'dist/style.css 出现 LEGACY `:root:not(:has(` 接管选择器（ADR-023 D2 step 2 已退役）——tokens.css 回归？',
  );
}

if (css.includes(':not(:has(.seal-root))')) {
  failures.push(
    'dist/style.css 出现 `[data-mode]:not(:has(.seal-root))` LEGACY 兜底选择器（2.0 已删）——tokens.css 回归？',
  );
}

if (failures.length > 0) {
  for (const f of failures) console.error(`[guard-dist-css] ✗ ${f}`);
  process.exit(1);
}
console.log('[guard-dist-css] ✓ dist 层化守卫通过');
