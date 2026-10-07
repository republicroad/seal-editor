import { defineConfig } from '@playwright/test';

/**
 * 冒烟 E2E（批 14）：编辑器关键链路回归。
 * webServer 双前置：demo-server（bun，:8787）+ playground（vite，:5199）；
 * 测试经 storage=http 模式消费 API 预置图（确定性数据面）。
 */
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'bun run dev',
      cwd: '../demo-server',
      url: 'http://localhost:8787/healthz',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npx vite --port 5199 --strictPort',
      cwd: '../playground',
      url: 'http://localhost:5199/udf.html',
      reuseExistingServer: true,
      timeout: 45_000,
    },
  ],
});
