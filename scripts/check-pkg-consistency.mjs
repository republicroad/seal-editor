// 双包一致性守卫：appshell 对 kernel 的 dependencies/peerDependencies 区间主版本
// 必须与 kernel 当前主版本一致——appshell 2.0.0 曾漏 bump dependencies（^1.36.0
// 嵌套解析出 1.45 双实例，SkinnedDecisionGraph 实际跑旧版），本守卫使其回归即红。
// 用法：node scripts/check-pkg-consistency.mjs （preflight 与 Validate 工作流调用）
import fs from 'node:fs';

const kernel = JSON.parse(fs.readFileSync('packages/seal-editor/package.json', 'utf8'));
const shell = JSON.parse(fs.readFileSync('packages/appshell/package.json', 'utf8'));
const kernelMajor = kernel.version.split('.')[0];

const failures = [];
const spots = [
  ['dependencies', shell.dependencies?.['@republicroad/seal-editor']],
  ['peerDependencies', shell.peerDependencies?.['@republicroad/seal-editor']],
];
for (const [where, range] of spots) {
  if (range === undefined) {
    failures.push(`appshell ${where} 缺 @republicroad/seal-editor 声明`);
    continue;
  }
  const m = String(range).match(/(\d+)\./);
  const major = m && m[1];
  if (major !== kernelMajor) {
    failures.push(
      `appshell ${where} @republicroad/seal-editor "${range}" 主版本 ${major} ≠ kernel ${kernelMajor}（双实例风险）`,
    );
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`[check-pkg-consistency] ✗ ${f}`);
  process.exit(1);
}
console.log('[check-pkg-consistency] ✓ appshell ↔ kernel 主版本一致（dep/peer 双声明）');
