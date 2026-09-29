#!/usr/bin/env node
/*
 * appshell dts 星导出指针守卫（内核全量透传的回归检查）。
 *
 * packages/appshell/src/index.ts 首行 `export * from '@republicroad/seal-editor'`
 * 是宿主单入口契约：内核公开面经 appshell 默认可见。dts 管线若改配置（bundleTypes、
 * pathsToAliases 等）把指针内联或丢失，宿主类型面即静默缩水——本脚本在 build 末尾
 * 断言指针存在于 dist/index.d.ts（fail-fast 于一切构建路径：本地/validate/publish）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appshellDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'appshell');
const dtsPath = path.join(appshellDir, 'dist', 'index.d.ts');

if (!fs.existsSync(dtsPath)) {
  console.error('[dts-pointer] dist/index.d.ts 不存在——先跑 vite build');
  process.exit(1);
}

const POINTER = "export * from '@republicroad/seal-editor';";
const dts = fs.readFileSync(dtsPath, 'utf8');
if (!dts.includes(POINTER)) {
  console.error(`[dts-pointer] 内核透传指针丢失！dist/index.d.ts 缺少 \`${POINTER}\``);
  console.error('[dts-pointer] 检查 appshell vite/dts 配置（pathsToAliases 必须为 false，kernel 保持 external）');
  process.exit(1);
}
console.log('[dts-pointer] 内核透传指针在位 ✓');
