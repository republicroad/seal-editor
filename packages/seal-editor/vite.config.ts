import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import dts from 'unplugin-dts/vite';
import { type Plugin, defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

import packageJson from './package.json' with { type: 'json' };

/**
 * ADR-023 D1：dist/style.css 包裹进 @layer seal-editor——宿主 utilities 恒胜，
 * 嵌入安全成包默认性质。挂在 closeBundle（写在磁盘之后）：**任何** vite build
 * 路径（含 pnpm publish 触发的 prepublishOnly 裸构建）都自动包裹——1.35.0 的
 * 教训：wrap 只链在 pnpm run build，prepublishOnly 重建出未层化 dist 上架。
 * 与 scripts/wrap-dist-css.mjs 同转换（CLI 版含 --check/--strict 守卫语义）。
 */
const wrapDistCssPlugin = (): Plugin => ({
  name: 'adr-023-wrap-dist-css',
  apply: 'build',
  closeBundle() {
    const cssPath = path.resolve(import.meta.dirname, 'dist', 'style.css');
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf8');
    } catch {
      return; // 无 css 产物（理论不可达——lib 构建恒产 style.css）
    }
    if (css.trimStart().startsWith('@layer seal-editor')) {
      return; // 已包裹（幂等）
    }
    // 剥顶层裸 @layer 声明（`@layer a, b;`——保留会向宿主全局层序声明层名）
    const stripped = css.replace(/^@layer\s+[^;{}]*;\s*$/gm, '');
    writeFileSync(cssPath, `@layer seal-editor {\n${stripped.trimEnd()}\n}\n`, 'utf8');
  },
});

export default defineConfig({
  plugins: [
    wrapDistCssPlugin(),
    react(),
    wasm(),
    dts({ include: ['src/**/*.ts', 'src/**/*.tsx'], bundleTypes: true }),
    tailwindcss(),
    // Bundle composition report for docs/bundle-analysis.md; written outside
    // dist/ so it never reaches the tarball. Opt in via BUILD_ANALYZE=1.
    ...(process.env.BUILD_ANALYZE
      ? [
          visualizer({
            filename: path.resolve(import.meta.dirname, '../../docs/bundle-stats.json'),
            template: 'raw-data',
            gzipSize: true,
            brotliSize: false,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['@lezer/common', '@lezer/lr', '@lezer/highlight'],
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(import.meta.dirname, 'src', 'index.ts'),
        schema: path.resolve(import.meta.dirname, 'src', 'helpers', 'schema.ts'),
      },
      name: 'Seal Editor',
      formats: ['es'],
      cssFileName: 'style',
    },
    rolldownOptions: {
      // Dependencies AND peerDependencies stay external: hosts provide them.
      // (peerDependencies alone proved insufficient — moving monaco-editor
      // out of dependencies silently inlined the whole monaco bundle.)
      // use-sync-external-store arrives transitively via @base-ui/react
      // (Base UI keeps the shim for React 17); inlined, its require('react')
      // breaks in the browser — same S011 crash pattern as zustand/traditional.
      external: [
        'react/jsx-runtime',
        'react',
        'react-dom',
        /^use-sync-external-store(\/.*)?$/,
        // Base UI is imported via subpaths (@base-ui/react/switch etc.); a
        // bare-name entry only matches the root, which silently inlined the
        // whole library (+315kB) in the 0.10.0 release.
        /^@base-ui\/react(\/.*)?$/,
        // Same bare-name trap for ajv: the lazy validator imports the SUBPATH
        // ajv/dist/2020 — the bare dependency string left a 165kB ajv chunk
        // inlined into dist (2026-10-01); subpaths need the regex form.
        /^ajv(\/.*)?$/,
        ...Object.keys(packageJson.dependencies),
        ...Object.keys(packageJson.peerDependencies ?? {}),
      ],
      output: {
        globals: {
          'react-dom': 'ReactDOM',
          'react': 'React',
        },
      },
    },
  },
});
