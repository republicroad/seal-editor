// ADR-023 #5 构建守卫（canary 版）：dist/style.css MUST 已包进 @layer seal-editor。
// `:root:not(:has(` 的退役禁令随 2.0 LEGACY 退役一并启用（当前 1.x 迁移窗口内
// LEGACY 块仍在层内合法存在）。
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

if (failures.length > 0) {
  for (const f of failures) console.error(`[guard-dist-css] ✗ ${f}`);
  process.exit(1);
}
console.log('[guard-dist-css] ✓ dist 层化守卫通过');
