import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { DIFFICULTIES } from '../src/rules.ts';

const levels = JSON.parse(await readFile(new URL('../src/levels.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const baseURL = process.env.GAME_URL ?? 'http://localhost:5173/games/parking-escape/';
try {
  for (const level of [levels[29], levels[59], levels[89], levels.at(-1)]) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, hasTouch: true, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.getByRole('button', { name: '游戏设置' }).click();
      await page.getByRole('button', { name: DIFFICULTIES[level.difficulty], exact: true }).click();
      await page.getByRole('button', { name: `第 ${level.id} 关 ${level.name}`, exact: true }).click();
      await page.getByRole('button', { name: '按此关卡开始新局' }).click();
      await expect(page.locator('#level-number')).toHaveText(`第 ${level.id} 关`);
      await page.reload();
      await expect(page.locator('#level-number')).toHaveText(`第 ${level.id} 关`);
      await expect(page.locator('#minimum')).toHaveText(String(level.minimum));
      for (let step = 0; step < level.minimum; step++) {
        await page.getByRole('button', { name: '提示', exact: true }).click();
        await page.getByRole('button', { name: '执行提示这一步' }).click();
        await expect(page.locator('#move-count')).toHaveText(String(step + 1).padStart(2, '0'));
      }
      await expect(page.getByRole('dialog', { name: '顺利出库！' })).toBeVisible();
      await expect(page.locator('#result-stars')).toHaveAttribute('aria-label', '3 星');
      await page.reload();
      await expect(page.getByRole('dialog', { name: '顺利出库！' })).toBeVisible();
      if (level.id < levels.length) {
        const nextLevel = levels[level.id];
        await page.getByRole('button', { name: '下一关', exact: true }).click();
        await expect(page.locator('#level-number')).toHaveText(`第 ${nextLevel.id} 关`);
        await expect(page.locator('#difficulty')).toHaveText(DIFFICULTIES[level.difficulty + 1]);
        await expect(page.locator('#chapter-name')).toHaveText(DIFFICULTIES[level.difficulty + 1]);
        assert.deepEqual(await page.locator('#chapter-levels [data-level]').evaluateAll(buttons => buttons.map(button => Number(button.dataset.level))), Array.from({ length: 6 }, (_, i) => nextLevel.id + i));
        await expect(page.locator('#move-count')).toHaveText('00');
        await page.reload();
        await expect(page.locator('#level-number')).toHaveText(`第 ${nextLevel.id} 关`);
        await page.getByRole('button', { name: '游戏设置' }).click();
        await expect(page.locator(`[data-draft="${nextLevel.id}"]`)).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: DIFFICULTIES[level.difficulty], exact: true }).click();
        await expect(page.locator(`[data-draft="${level.id}"]`)).toHaveClass('completed');
        assert.deepEqual(errors, []);
        console.log(`PASS level ${level.id} continues to ${nextLevel.id} in the next difficulty, retains completion and survives reload`);
        continue;
      }
      await page.getByRole('button', { name: '全部关卡', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '选择关卡' })).toBeVisible();
      await page.getByRole('button', { name: '关闭设置' }).click();
      await page.getByRole('button', { name: '新的一局' }).click();
      await expect(page.locator('#move-count')).toHaveText('00');
      await expect(page.locator('#level-number')).toHaveText(`第 ${level.id} 关`);
      assert.deepEqual(errors, []);
      console.log('PASS hardest challenge, applied settings, reduced motion, saved completion, final-level navigation and direct replay');
    } finally { await context.close(); }
  }

  for (const storage of ['legacy', 'corrupt', 'unavailable']) {
    const context = await browser.newContext({ baseURL });
    try {
      await context.addInitScript(({ mode, firstLevel }) => {
        if (mode === 'legacy') {
          localStorage.setItem('parking-escape-save-v1', JSON.stringify({ version: 1, level: firstLevel.id, game: { positions: firstLevel.positions, past: [], future: [] }, seconds: 37, best: { '1': firstLevel.minimum, '24': 25 } }));
          localStorage.setItem('parking-escape-preferences-v1', JSON.stringify({ sound: false }));
        } else if (mode === 'corrupt') localStorage.setItem('parking-escape-save-v2', '{invalid');
        else {
          Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
          Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
        }
      }, { mode: storage, firstLevel: levels[0] });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await expect(page.locator('#level-number')).toHaveText('第 01 关');
      await expect(page.locator('#move-count')).toHaveText('00');
      await expect(page.locator('#completed')).toHaveText('0 / 120');
      await expect(page.locator('#best')).toHaveText('未通关');
      await expect(page.locator('#timer')).toHaveText('00:00');
      if (storage === 'legacy') await expect(page.getByRole('button', { name: '开启音效' })).toBeVisible();
      await page.getByRole('button', { name: '提示', exact: true }).click();
      await page.getByRole('button', { name: '执行提示这一步' }).click();
      await expect(page.locator('#move-count')).toHaveText('01');
      if (storage === 'legacy') {
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('parking-escape-save-v2')).version), 2);
        await page.reload();
        await expect(page.locator('#move-count')).toHaveText('01');
        await expect(page.locator('#completed')).toHaveText('0 / 120');
      }
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
