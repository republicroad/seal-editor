#!/usr/bin/env node
/*
 * 内核/appshell 导出面撞名扫描（appshell index.ts 星导出守卫）。
 *
 * appshell 以 `export * from '@republicroad/seal-editor'` 默认透传内核；ESM 语义下
 * 显式导出优先于星导出——一旦两包出现同名导出，appshell 本地静默胜出，内核同名
 * 符号经 appshell 出口不可见。本脚本递归收集两包 barrel 图的全部导出名并比对，
 * 撞名即非零退出（CI/发版前手动跑：node scripts/check-export-collisions.mjs）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const resolveFile = (relFromRepoRoot) => {
  const candidates = [
    relFromRepoRoot, // 已带扩展名
    `${relFromRepoRoot}.ts`,
    `${relFromRepoRoot}.tsx`,
    path.join(relFromRepoRoot, 'index.ts'),
    path.join(relFromRepoRoot, 'index.tsx'),
  ];
  for (const cand of candidates) {
    const abs = path.join(repoRoot, cand);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
};

const collect = (entryRel, seen = new Set(), names = new Map()) => {
  const abs = resolveFile(entryRel);
  if (!abs || seen.has(abs)) return names;
  seen.add(abs);
  const src = fs.readFileSync(abs, 'utf8');

  // export { A, B as C, type D } [from '...']
  for (const m of src.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part) continue;
      if (part.startsWith('type ')) part = part.slice(5).trim();
      const asMatch = part.match(/\s+as\s+(\w+)$/);
      const name = asMatch ? asMatch[1] : part;
      if (/^\w+$/.test(name)) names.set(name, path.relative(repoRoot, abs));
    }
  }
  // export const/function/class/enum X / export type X / export interface X / export default X
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|enum)\s+(\w+)/g))
    names.set(m[1], path.relative(repoRoot, abs));
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:type|interface)\s+(\w+)/g))
    names.set(m[1], path.relative(repoRoot, abs));

  // 递归 barrel：export * from './x' 与 export { ... } from './x'
  for (const m of src.matchAll(/export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const spec = m[1];
    collect(path.join(path.dirname(entryRel), spec), seen, names);
  }
  return names;
};

const kernel = collect(path.join('packages', 'seal-editor', 'src', 'index.ts'));
const appshell = collect(path.join('packages', 'appshell', 'src', 'index.ts'));

console.log(`[export-collisions] kernel 导出名 ${kernel.size}，appshell 导出名 ${appshell.size}`);
const collisions = [...kernel.keys()].filter((n) => appshell.has(n));
if (collisions.length > 0) {
  console.error('[export-collisions] 撞名（appshell 显式导出将遮蔽内核同名导出）：');
  for (const n of collisions) {
    console.error(`  - ${n}\n      kernel:   ${kernel.get(n)}\n      appshell: ${appshell.get(n)}`);
  }
  process.exit(1);
}
console.log('[export-collisions] 零撞名 ✓');
