import { chromium, webkit, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const url = process.env.GAME_URL || 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('test-results', { recursive: true });
const errors = [];
const state = page => page.evaluate(() => window.__iceGame.getState());
async function ready(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__iceGame);
  await page.waitForTimeout(900);
}
async function tapTile(page, id, touch = false) {
  const tile = (await state(page)).tiles.find(tile => tile.id === id);
  assert.ok(tile, `Expected available tile ${id}`);
  if (touch) await page.touchscreen.tap(tile.x, tile.y);
  else await page.mouse.click(tile.x, tile.y);
}
async function settled(page) {
  await page.waitForFunction(() => { const state = window.__iceGame.getState(); return !state.busy || state.lost; }, null, { timeout: 15000 });
}
async function checkCanvas(page, label) {
  const png = PNG.sync.read(await page.locator('#scene canvas').screenshot());
  const colors = new Set();
  let darkPixels = 0;
  for (let y = 0; y < png.height; y += 3) for (let x = 0; x < png.width; x += 3) {
    const i = (y * png.width + x) * 4;
    colors.add(`${png.data[i] >> 3},${png.data[i + 1] >> 3},${png.data[i + 2] >> 3}`);
    if (png.data[i] < 100 && png.data[i + 1] < 130 && png.data[i + 2] < 145) darkPixels++;
  }
  assert.ok(colors.size > 80, `${label}: varied rendered geometry (${colors.size})`);
  assert.ok(darkPixels > 15, `${label}: visible penguin (${darkPixels})`);
  const layout = await page.evaluate(() => {
    const rect = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, turn: rect('.turn-panel'), stats: rect('.game-stats'), dock: rect('.player-dock'), scene: rect('#scene') };
  });
  assert.equal(layout.overflow, false, `${label}: no viewport overflow`);
  assert.ok(layout.turn.right < layout.stats.left, `${label}: no overlapping status text`);
  for (const tile of (await state(page)).tiles) {
    assert.ok(tile.x >= 12 && tile.x <= png.width - 12, `${label}: ${tile.id} fits horizontally`);
    assert.ok(tile.y < layout.dock.top - 12 && tile.y > layout.scene.top + 12, `${label}: ${tile.id} fits vertically`);
  }
  console.log(`${label}: ${png.width}x${png.height}, ${colors.size} colors, ${darkPixels} penguin pixels; all tiles in view`);
  return png;
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await ready(page);
  await checkCanvas(page, 'Desktop');
  await page.screenshot({ path: 'test-results/desktop.png' });
  await tapTile(page, '-4,0');
  await tapTile(page, '4,0');
  await page.waitForTimeout(200);
  assert.equal((await state(page)).move, 1, 'Rapid taps cannot take two turns');
  assert.ok((await state(page)).physics.wobble > 0, 'Impact starts an elastic response');
  await page.locator('#settings-button').click();
  const pausedWobble = (await state(page)).physics.wobble;
  await page.waitForTimeout(350);
  assert.equal((await state(page)).physics.wobble, pausedWobble, 'Pausing freezes the impact response');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await settled(page);
  assert.equal((await state(page)).physics.wobble, 0, 'Turn advances after the response decays');
  assert.equal((await state(page)).turn, 1);
  assert.equal((await state(page)).remaining, 60);
  await tapTile(page, '4,0');
  await page.waitForTimeout(200);
  await settled(page);
  assert.equal((await state(page)).turn, 0);
  assert.equal((await state(page)).remaining, 59);
  await page.screenshot({ path: 'test-results/after-hits.png' });
  await page.locator('#restart-button').click();
  await expect(page.locator('#restart-dialog')).toBeVisible();
  await page.getByRole('button', { name: '继续这局' }).click();
  assert.equal((await state(page)).remaining, 59);
  await page.locator('#restart-button').click();
  await page.locator('#confirm-restart').click();
  assert.equal((await state(page)).remaining, 61);
  assert.equal((await state(page)).turn, 0, 'Every new round starts with player one');
  let losingPlayer;
  for (const id of ['0,0', '1,0', '0,1', '1,-1', '-1,1', '-1,0', '0,-1']) {
    const before = await state(page);
    if (before.lost) break;
    if (!before.tiles.some(tile => tile.id === id)) continue;
    losingPlayer = before.turn;
    await tapTile(page, id);
    await page.waitForTimeout(250);
    await settled(page);
  }
  assert.equal((await state(page)).lost, true, 'Penguin falls after supports are removed');
  assert.equal((await state(page)).turn, losingPlayer, 'The responsible player loses');
  await expect(page.locator('#result-dialog')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#result-loser')).toContainText(`玩家 ${losingPlayer + 1}`);
  await expect(page.locator('#result-winners')).toContainText(`玩家 ${2 - losingPlayer}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/result.png' });
  await page.locator('#play-again').click();
  assert.equal((await state(page)).lost, false);
  assert.equal((await state(page)).remaining, 61);
  assert.equal((await state(page)).turn, 0);
  await page.locator('#settings-button').click();
  await page.locator('[data-count="4"]').click();
  await page.locator('[data-radius="3"]').click();
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.locator('#settings-form button[type="submit"]').click();
  assert.equal((await state(page)).playerCount, 4);
  assert.equal((await state(page)).remaining, 37);
  await page.locator('#sound-button').click();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await page.waitForFunction(() => window.__iceGame);
  assert.equal((await state(page)).playerCount, 4);
  assert.equal((await state(page)).remaining, 37);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  console.log('Passed: turn lock, rotation, restart, physical loss attribution, replay, settings, persistence');
  await page.close();
  for (const viewport of [
    { width: 1194, height: 834, label: 'ipad-landscape' },
    { width: 834, height: 1194, label: 'ipad-portrait' },
    { width: 390, height: 844, label: 'phone' },
    { width: 844, height: 390, label: 'phone-landscape' },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await ready(page);
    const before = await checkCanvas(page, viewport.label);
    await page.screenshot({ path: `test-results/${viewport.label}.png` });
    await tapTile(page, '-4,0', true);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/${viewport.label}-wobble.png` });
    await settled(page);
    assert.equal((await state(page)).move, 1, `${viewport.label}: touch removes one block`);
    assert.equal((await state(page)).turn, 1, `${viewport.label}: touch advances turn`);
    const after = PNG.sync.read(await page.locator('#scene canvas').screenshot());
    let changedPixels = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      if (Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1]) + Math.abs(before.data[i + 2] - after.data[i + 2]) > 20) changedPixels++;
    }
    assert.ok(changedPixels > 200, `${viewport.label}: canvas changes after impact`);
    console.log(`${viewport.label}: touch passed, ${changedPixels} changed pixels`);
    if (viewport.label === 'phone') {
      await page.locator('#settings-button').click();
      await page.locator('[data-count="4"]').click();
      await page.locator('#settings-form button[type="submit"]').click();
      await page.screenshot({ path: 'test-results/phone-four-players.png' });
      await checkCanvas(page, 'Phone with four players');
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'No runtime errors');
  console.log('All Chromium checks passed');
} finally {
  await browser.close();
}
if (process.env.CHECK_WEBKIT === '1') {
  const safari = await webkit.launch({ headless: true });
  try {
    const page = await safari.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await ready(page);
    await checkCanvas(page, 'WebKit iPad');
    await tapTile(page, '-4,0', true);
    await page.waitForTimeout(250);
    await settled(page);
    assert.equal((await state(page)).turn, 1);
    await page.screenshot({ path: 'test-results/webkit-ipad.png' });
    console.log('WebKit iPad rendering and touch passed');
  } finally {
    await safari.close();
  }
}
