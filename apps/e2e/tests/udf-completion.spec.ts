import { expect, test } from '@playwright/test';

/**
 * 批 7 闭环：UDF 补全端到端——编辑器先建、schema 晚注入（useCustomNodes
 * 异步），TypedInput 表达式模式打字仍须列出 UDF 函数（惰性取用修复的
 * 真实页面验证）。
 */
test.describe('UDF 补全（表达式模式）', () => {
  test('实例参数表达式打字列出 UDF 函数', async ({ page }) => {
    await page.goto('/udf.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // demo-server schema 拉取 + setUdfCompletions 注入

    await page.locator('text=Edit Expression').first().click();
    await page.waitForTimeout(1000);

    // 参数切表达式模式（最后一个 Value 触发钮）
    await page.locator('button:has-text("Value")').last().click();
    await page.waitForTimeout(400);
    await page.locator('[role="option"]:has-text("Expression")').last().click();
    await page.waitForTimeout(500);

    // CM6 打字 → 补全弹窗应列出 UDF（schema 晚注入不缺席——惰性取用）
    const cm = page.locator('.cm-content').last();
    await cm.click();
    await page.keyboard.type('bu', { delay: 60 });
    const tooltip = page.locator('.cm-tooltip-autocomplete');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(tooltip).toContainText('bucket');

    // 选项点选 → 插入
    await page.locator('.cm-tooltip-autocomplete [role="option"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('.cm-content').last()).toContainText('bucket');
  });
});
