// ADR-023 D1：dist/style.css 包裹进 @layer seal-editor——宿主 utilities 恒胜、
// 嵌入安全成为包默认性质。
// 规则：
// ① 剥离顶层裸 @layer 声明（`@layer a, b;`）——保留会向宿主全局层序声明层名；
// ② 其余整体（含嵌套 @layer properties 块与顶层 @property）包进
//    `@layer seal-editor { … }`（CSS 嵌套 layer 合法，层内文档序保留）；
// ③ @charset/@import 若存在 MUST 保留在文件头（包裹从其后的第一条规则开始）。
// 用法：node scripts/wrap-dist-css.mjs [--check]
//   --check 只校验已包裹（CI 守卫用），不写文件。
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'seal-editor', 'dist');
const cssPath = path.join(distDir, 'style.css');

const checkOnly = process.argv.includes('--check');

let css;
try {
  css = readFileSync(cssPath, 'utf8');
} catch {
  console.error('[wrap-dist-css] dist/style.css 不存在——先跑构建');
  process.exit(1);
}

if (css.trimStart().startsWith('@layer seal-editor')) {
  if (checkOnly) {
    console.log('[wrap-dist-css] ✓ 已包裹（check 通过）');
    process.exit(0);
  }
  console.log('[wrap-dist-css] 已包裹，跳过');
  process.exit(0);
}

// ① 剥顶层裸 @layer 声明（形如 `@layer theme, base, ...;`——无花括号）
css = css.replace(/^@layer\s+[^;{}]*;\s*$/gm, '');

// ② 包裹
const wrapped = `@layer seal-editor {\n${css.trimEnd()}\n}\n`;

if (checkOnly) {
  console.error('[wrap-dist-css] ✗ 产物未包裹——重跑 build');
  process.exit(1);
}
writeFileSync(cssPath, wrapped, 'utf8');
console.log('[wrap-dist-css] ✓ style.css 已包进 @layer seal-editor');
