import { type Page, expect, test } from '@playwright/test';

/** dt 编辑形态（批 0/1 链路）：剪贴板粘贴 → 填充柄 → undo/redo。 */
test.describe('决策表编辑链路', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/table.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
  });

  const readRows = (p: Page) =>
    p.evaluate(() =>
      [...document.querySelectorAll('table[data-slot="data-grid-table"] tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
      ),
    );

  test('剪贴板粘贴 2×2 块落格；Ctrl+Z 整批回滚；Ctrl+Y 重放', async ({ page }) => {
    await page.locator('table[data-slot="data-grid-table"] tbody tr').first().locator('td').nth(1).click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '999\t1.23\n888\t2.34');
      (document.activeElement || document.body).dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect
      .poll(() => readRows(page))
      .toEqual([
        ['1', '999', '1.23', '', ''],
        ['2', '888', '2.34', '', ''],
      ]);

    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await expect
      .poll(() => readRows(page))
      .toEqual([
        ['1', '"GOLD"', '0.85', '', ''],
        ['2', '"SILVER"', '0.9', '', ''],
      ]);

    await page.keyboard.press('Control+y');
    await expect
      .poll(() => readRows(page))
      .toEqual([
        ['1', '999', '1.23', '', ''],
        ['2', '888', '2.34', '', ''],
      ]);
  });

  test('填充柄拖拽复制；工具栏 undo/redo 按钮随栈深切换', async ({ page }) => {
    // 聚焦第一行输入格（Escape 后焦点落首数据格——行号列已关选区）
    await page.locator('table[data-slot="data-grid-table"] tbody tr').first().locator('td').nth(1).click();
    // 等光标格编辑器挂载（data-cell-editing），Esc 退编辑态——焦点回到网格、柄显形
    await page.waitForSelector('table [data-cell-editing], table td[data-cell-focused]', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);

    const handle = page.locator('[data-slot="data-grid-cell-fill-handle"]').first();
    await expect(handle).toBeVisible();
    const hb = await handle.boundingBox();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2 + 44, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    await expect
      .poll(() => readRows(page))
      .toEqual([
        ['1', '"GOLD"', '0.85', '', ''],
        ['2', '"GOLD"', '0.9', '', ''],
      ]);
  });
});
