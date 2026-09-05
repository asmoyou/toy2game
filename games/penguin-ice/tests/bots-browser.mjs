import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';

const url = process.env.GAME_URL || 'http://localhost:5174/';
const state = page => page.evaluate(() => window.__iceGame.getState());
await mkdir('test-results', { recursive: true });

for (const engine of [chromium, ...(process.env.CHECK_WEBKIT === '1' ? [webkit] : [])]) {
  const browser = await engine.launch({ ...(engine === chromium ? { channel: 'chrome' } : {}), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__iceGame);
    await page.locator('#roster-button').tap();
    await page.getByRole('button', { name: '玩家 2 设为机器人' }).tap();
    await page.screenshot({ path: `test-results/${engine.name()}-bot-settings.png`, animations: 'disabled' });
    await page.locator('#settings-form button[type="submit"]').tap();
    assert.deepEqual((await state(page)).bots, [false, true]);
    assert.equal((await state(page)).turn, 0, 'Settings also start with player one');
    await page.waitForTimeout(1600);
    assert.equal((await state(page)).move, 0, 'A bot must not steal the opening turn');
    const tile = (await state(page)).tiles.find(tile => tile.id === '-4,0');
    await page.touchscreen.tap(tile.x, tile.y);
    await page.waitForFunction(() => { const s = window.__iceGame.getState(); return s.turn === 1 && s.phase === 'playing'; });
    const botTurnTile = (await state(page)).tiles.find(tile => tile.id === '4,0');
    await page.touchscreen.tap(botTurnTile.x, botTurnTile.y);
    assert.equal((await state(page)).move, 1, 'Human input must not play the bot turn');
    await page.locator('#settings-button').tap();
    await page.waitForTimeout(1800);
    assert.equal((await state(page)).move, 1, 'Opening settings cancels the bot timer');
    await page.getByRole('button', { name: '关闭设置' }).tap();
    await page.screenshot({ path: `test-results/${engine.name()}-bot-thinking.png` });
    await page.waitForFunction(() => { const s = window.__iceGame.getState(); return s.move === 2 && s.turn === 0 && s.phase === 'playing'; }, null, { timeout: 15000 });
    assert.equal((await state(page)).remaining, 59);
    assert.equal((await state(page)).humanInput, true);
    await page.waitForTimeout(1600);
    assert.equal((await state(page)).move, 2, 'The bot acts exactly once');

    const humanTile = (await state(page)).tiles.find(tile => tile.rim);
    await page.touchscreen.tap(humanTile.x, humanTile.y);
    await page.waitForFunction(() => { const s = window.__iceGame.getState(); return s.move === 4 && s.turn === 0 && s.phase === 'playing'; }, null, { timeout: 18000 });
    await page.locator('#restart-button').tap();
    await page.locator('#confirm-restart').tap();
    await page.waitForTimeout(1800);
    assert.equal((await state(page)).move, 0, 'Restart must not retain a previous bot timer');
    assert.equal((await state(page)).turn, 0);

    await page.locator('#settings-button').tap();
    await page.locator('[data-count="4"]').tap();
    for (const player of [2, 3, 4]) await page.getByRole('button', { name: `玩家 ${player} 设为机器人` }).tap();
    await page.locator('#settings-form button[type="submit"]').tap();
    await page.reload();
    await page.waitForFunction(() => window.__iceGame);
    assert.deepEqual((await state(page)).bots, [false, true, true, true], 'Robot seats persist');
    const first = (await state(page)).tiles.find(tile => tile.id === '-4,0');
    await page.touchscreen.tap(first.x, first.y);
    await page.waitForFunction(() => { const s = window.__iceGame.getState(); return s.move === 4 && s.turn === 0 && s.phase === 'playing'; }, null, { timeout: 25000 });
    assert.equal((await state(page)).lost, false);
    assert.equal((await state(page)).remaining, 57);
    await page.screenshot({ path: `test-results/${engine.name()}-three-bots.png` });

    for (const viewport of [{ width: 834, height: 1194 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(350);
      const canvas = PNG.sync.read(await page.locator('#scene canvas').screenshot());
      const colors = new Set();
      for (let i = 0; i < canvas.data.length; i += 28) colors.add(`${canvas.data[i] >> 3},${canvas.data[i + 1] >> 3},${canvas.data[i + 2] >> 3}`);
      assert.ok(colors.size > 80, 'The 3D ice field remains visible after rotation');
      await page.screenshot({ path: `test-results/${engine.name()}-bots-${viewport.width}.png` });
      const overflow = await page.evaluate(() => {
        const players = [...document.querySelectorAll('.player-info strong')];
        return { page: document.documentElement.scrollWidth > innerWidth, labels: players.some(element => element.scrollWidth > element.clientWidth + 1) };
      });
      assert.equal(overflow.page, false);
      assert.equal(overflow.labels, false, 'Robot names must fit their player slots');
      await page.locator('#settings-button').tap();
      await page.screenshot({ path: `test-results/${engine.name()}-bot-settings-${viewport.width}.png`, animations: 'disabled' });
      await page.getByRole('button', { name: '关闭设置' }).tap();
    }
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: bot input lock, automatic turns, dialog pause, timer cancellation, persistence, three bots and responsive layouts passed`);
  } finally { await browser.close(); }
}
