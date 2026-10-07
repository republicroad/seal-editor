/**
 * Budget 增长率制（批 29）：从当前 dist 实测值自动计算新预算。
 *
 * 用法：
 *   node scripts/budget-growth.mjs          # 计算 × 1.03 预算并覆写 size-budgets.json
 *   node scripts/budget-growth.mjs --check  # 只打印新预算，不写文件（预览）
 *
 * 规则：
 *   新预算 = ceil(实测值 × 1.03 / 1024) * 1024（对齐到 kB 整数边界）
 *   增长率 3% 是保守余量——功能批次通常增量 < 2%，超出说明需要显式审批。
 *
 * 前置：`pnpm build` 必须已跑（dist 存在）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dist = path.join(root, 'packages', 'seal-editor', 'dist');
const budgetsPath = path.join(root, 'scripts', 'size-budgets.json');
const GROWTH = 1.03;

const check = process.argv.includes('--check');

if (!existsSync(dist)) {
  console.error('[growth] dist missing — run `pnpm build` first.');
  process.exit(1);
}

const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
const next = {};

for (const [file, budget] of Object.entries(budgets)) {
  const filePath = path.join(dist, file);
  if (!existsSync(filePath)) continue;

  const contents = readFileSync(filePath);
  const raw = contents.length;
  const gz = gzipSync(contents).length;

  // 新 raw 预算 = max(当前预算, 实测 × GROWTH) 对齐到 kB
  const newRaw = Math.max(Math.ceil((raw * GROWTH) / 1024) * 1024, budget.raw);
  const newGzip = budget.gzip !== undefined ? Math.max(Math.ceil((gz * GROWTH) / 1024) * 1024, budget.gzip) : undefined;

  next[file] = { raw: newRaw, ...(newGzip !== undefined ? { gzip: newGzip } : {}) };

  const rawDelta = newRaw - budget.raw;
  const gzipDelta = newGzip !== undefined && budget.gzip !== undefined ? newGzip - budget.gzip : 0;
  const action = rawDelta > 0 || gzipDelta > 0 ? '↑' : '=';
  console.log(
    `${action} ${file.padEnd(12)} raw ${budget.raw}→${newRaw} (+${rawDelta})  gzip ${budget.gzip ?? '—'}→${newGzip ?? '—'} (+${gzipDelta})`,
  );
}

if (check) {
  console.log('\n[growth] preview only — use without --check to apply.');
  process.exit(0);
}

writeFileSync(budgetsPath, JSON.stringify(next, null, 2) + '\n');
console.log('\n[growth] size-budgets.json updated — commit and push.');
