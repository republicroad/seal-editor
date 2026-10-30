#!/usr/bin/env node
/**
 * 发布/推前预检（1.42.0 四连红的流程性根治）：一键跑全门。
 *
 * 背景：`lint:compiler` 是 eslint（react-compiler 插件）而非 tsc——真 typecheck
 * 只在 CI Validate 跑，本地门漏它导致 1.42.0 连吃 typecheck/侧栏计数/story 文案/
 * debt 预算四红。本脚本把 Validate 的判分项全部本地化：
 *
 *   1. kernel typecheck      tsc --noEmit（判别联合/cast/缺 prop 的真正守门员）
 *   2. appshell typecheck    同上（appshell 消费 kernel 类型）
 *   3. vitest（kernel）      全量单测
 *   4. vitest（appshell）    全量单测（跨包断言：侧栏组合/适配器契约）
 *   5. style-debt 预算       !important/raw-hex 上限（超限走 SEAL-STYLE-HACK 入账）
 *   6. doc links             文档锚点检查
 *
 * 用法：node scripts/release-preflight.mjs [--fast]
 *   --fast 跳过 3/4（vitest 已在 lint-staged/本地常态跑）——推前最后防线的最小集。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const fast = process.argv.includes('--fast');
const root = process.cwd();
if (!existsSync(join(root, 'lerna.json'))) {
  console.error('[preflight] 请在仓库根运行');
  process.exit(1);
}

const steps = [
  ['kernel typecheck', 'pnpm', ['--filter', '@republicroad/seal-editor', 'run', 'typecheck']],
  ['appshell typecheck', 'pnpm', ['--filter', '@republicroad/seal-appshell', 'run', 'typecheck']],
  ...(fast
    ? []
    : [
        ['kernel vitest', 'pnpm', ['--filter', '@republicroad/seal-editor', 'run', 'test']],
        ['appshell vitest', 'pnpm', ['--filter', '@republicroad/seal-appshell', 'run', 'test']],
      ]),
  ['style-debt budget', 'pnpm', ['run', 'lint:debt']],
  ['doc links', 'node', ['scripts/check-doc-links.mjs']],
  ['pkg consistency', 'node', ['scripts/check-pkg-consistency.mjs']],
];

let failed = 0;
for (const [label, cmd, args] of steps) {
  process.stdout.write(`[preflight] ${label} … `);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status === 0) {
    console.log('OK');
  } else {
    console.log('FAIL');
    failed += 1;
  }
}

console.log(failed === 0 ? '[preflight] 全绿，可推/可发。' : `[preflight] ${failed} 项失败——修复后再推。`);
process.exit(failed === 0 ? 0 : 1);
