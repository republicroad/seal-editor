import { defineConfig } from '@rspress/core';
import path from 'node:path';

export default defineConfig({
  // doc content root (markdown lives in docs/)
  root: 'docs',
  base: '/seal-editor/docs/',
  title: 'Seal Editor Docs',
  description: 'Documentation for @republicroad/seal-editor',
  lang: 'en',
  outDir: 'doc-out',
  globalStyles: path.resolve(__dirname, 'docs/global.css'),
  // relative links escaping the doc root (../packages/..., ../CONTRIBUTING)
  // are intentional repo references — don't fail the build on them
  // (Rspress 2 shape: markdown.link.*)
  markdown: {
    link: {
      checkDeadLinks: false,
    },
  },
  themeConfig: {
    enableContentUpdate: false,
  },
});
