import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const baseURL = process.env.GAME_URL ?? 'http://localhost:5173/games/parking-escape/';
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await page.getByRole('button', { name: '游戏设置' }).click();
    await page.getByRole('button', { name: '第 24 关 出库大师' }).click();
    await page.getByRole('button', { name: '按此关卡开始新局' }).click();
    await expect(page.locator('#level-number')).toHaveText('第 24 关');
    await page.reload();
    await expect(page.locator('#level-number')).toHaveText('第 24 关');
    await expect(page.locator('#minimum')).toHaveText('25');
    for (let step = 0; step < 25; step++) {
      await page.getByRole('button', { name: '提示', exact: true }).click();
      await page.getByRole('button', { name: '执行提示这一步' }).click();
      await expect(page.locator('#move-count')).toHaveText(String(step + 1).padStart(2, '0'));
    }
    await expect(page.getByRole('dialog', { name: '顺利出库！' })).toBeVisible();
    await expect(page.locator('#result-stars')).toHaveAttribute('aria-label', '3 星');
    await page.reload();
    await expect(page.getByRole('dialog', { name: '顺利出库！' })).toBeVisible();
    await page.getByRole('button', { name: '全部关卡', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '选择关卡' })).toBeVisible();
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.getByRole('button', { name: '新的一局' }).click();
    await expect(page.locator('#move-count')).toHaveText('00');
    await expect(page.locator('#level-number')).toHaveText('第 24 关');
    assert.deepEqual(errors, []);
    console.log('PASS hardest challenge, applied settings, reduced motion, saved completion, final-level navigation and direct replay');
  } finally { await context.close(); }

  for (const storage of ['corrupt', 'unavailable']) {
    const context = await browser.newContext({ baseURL });
    try {
      await context.addInitScript(mode => {
        if (mode === 'corrupt') localStorage.setItem('parking-escape-save-v1', '{invalid');
        else {
          Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
          Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
        }
      }, storage);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await expect(page.locator('#move-count')).toHaveText('00');
      await page.getByRole('button', { name: '提示', exact: true }).click();
      await page.getByRole('button', { name: '执行提示这一步' }).click();
      await expect(page.locator('#move-count')).toHaveText('01');
      assert.deepEqual(errors, []);
      console.log(`PASS ${storage} storage still permits playing`);
    } finally { await context.close(); }
  }

  const fallbackContext = await browser.newContext({ baseURL });
  try {
    await fallbackContext.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...options) {
        return type.startsWith('webgl') ? null : getContext.call(this, type, ...options);
      };
    });
    const page = await fallbackContext.newPage();
    await page.goto('./');
    await expect(page.getByRole('alert')).toContainText('停车场暂时无法显示');
    await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
    console.log('PASS unavailable WebGL displays recovery state');
  } finally { await fallbackContext.close(); }
} finally { await browser.close(); }
