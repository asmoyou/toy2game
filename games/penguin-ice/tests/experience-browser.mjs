import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';

const url = process.env.GAME_URL || 'http://localhost:5174/';
const state = page => page.evaluate(() => window.__iceGame.getState());
await mkdir('test-results', { recursive: true });

async function tap(page, id) {
  const tile = (await state(page)).tiles.find(tile => tile.id === id);
  assert.ok(tile, `Expected available ice ${id}`);
  await page.touchscreen.tap(tile.x, tile.y);
  await page.waitForTimeout(180);
}

async function settle(page) {
  await page.waitForFunction(() => { const s = window.__iceGame.getState(); return !s.busy || s.lost; }, null, { timeout: 15000 });
}

async function inspectCanvas(page, name) {
  const png = PNG.sync.read(await page.locator('#scene canvas').screenshot());
  const colors = new Set();
  for (let i = 0; i < png.data.length; i += 28) colors.add(`${png.data[i] >> 3},${png.data[i + 1] >> 3},${png.data[i + 2] >> 3}`);
  assert.ok(colors.size > 80, `${name}: nonblank 3D scene`);
  const bounds = await page.locator('#scene').boundingBox();
  for (const tile of (await state(page)).tiles) {
    assert.ok(tile.x > 5 && tile.x < bounds.width - 5, `${name}: ${tile.id} fits horizontally`);
    assert.ok(tile.y > bounds.y + 5 && tile.y < bounds.y + bounds.height - 5, `${name}: ${tile.id} fits vertically`);
  }
  await page.screenshot({ path: `test-results/${name}.png` });
}

for (const engine of [chromium, ...(process.env.CHECK_WEBKIT === '1' ? [webkit] : [])]) {
  const browser = await engine.launch({ ...(engine === chromium ? { channel: 'chrome' } : {}), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__iceGame);
    await page.waitForTimeout(500);
    assert.equal((await state(page)).mood, 'happy');
    const initial = (await state(page)).camera;
    const center = (await state(page)).tiles.find(tile => tile.id === '-1,1');
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 230, center.y + 15, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    assert.equal((await state(page)).move, 0, 'Dragging must not knock any ice');
    assert.ok(Math.abs((await state(page)).camera.azimuth - initial.azimuth) > 0.5);
    await inspectCanvas(page, `${engine.name()}-rotated-view`);

    const loop = (await state(page)).tiles.find(tile => tile.id === '1,0');
    await page.mouse.move(loop.x, loop.y);
    await page.mouse.down();
    await page.mouse.move(loop.x + 80, loop.y, { steps: 5 });
    await page.mouse.move(loop.x, loop.y, { steps: 5 });
    await page.mouse.up();
    assert.equal((await state(page)).move, 0, 'Returning a drag to its start is not a tap');

    if (engine === chromium) {
      const session = await page.context().newCDPSession(page);
      const point = (x, y, id) => ({ x, y, id, radiusX: 5, radiusY: 5 });
      const before = (await state(page)).camera.azimuth;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(530, 430, 1)] });
      for (let i = 1; i <= 10; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(530 + i * 18, 430, 1)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(700);
      assert.ok(Math.abs((await state(page)).camera.azimuth - before) > 0.4);
      assert.equal((await state(page)).move, 0, 'A real touch drag must rotate only');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(550, 430, 1), point(670, 430, 2)] });
      for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(550 - i * 8, 430, 1), point(670 + i * 8, 430, 2)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point(502, 430, 1)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.ok((await state(page)).camera.zoom > 1);
      assert.equal((await state(page)).move, 0, 'Pinching and releasing fingers separately must not knock ice');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(590, 430, 1)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal((await state(page)).move, 0);
      await session.detach();
    }

    await page.locator('[data-view="reset"]').click();
    assert.ok(Math.abs((await state(page)).camera.azimuth - initial.azimuth) < 0.001);
    await page.locator('[data-view="top"]').click();
    assert.ok((await state(page)).camera.polar < 0.1);
    await inspectCanvas(page, `${engine.name()}-overhead-view`);
    await page.locator('[data-view="left"]').click();
    assert.ok(Math.abs((await state(page)).camera.azimuth - initial.azimuth) > 0.7);
    await tap(page, '0,-2');
    assert.equal((await state(page)).move, 1, 'Ice behind the penguin is tappable from a rotated view');
    await page.waitForFunction(() => window.__iceGame.getState().mood === 'surprised');
    await page.waitForFunction(() => window.__iceGame.getState().expression.open > 0.2);
    await settle(page);
    await page.waitForFunction(() => window.__iceGame.getState().mood === 'happy');
    assert.equal((await state(page)).turn, 1);
    assert.ok((await state(page)).water.splashes >= 1);

    await page.locator('#restart-button').click();
    await page.locator('#confirm-restart').click();
    assert.equal((await state(page)).turn, 0);
    await page.locator('#restart-button').click();
    assert.equal((await state(page)).turn, 0, 'Even repeated restarts keep player one first');
    await page.locator('[data-view="reset"]').click();
    if (engine === chromium) {
      const safe = await page.evaluate(() => window.__iceGame.getState().tiles.map(tile => tile.id).filter(id => {
        const [q, r] = id.split(',').map(Number);
        return ((q - r) % 3 + 3) % 3 === 1;
      }));
      for (const id of safe.slice(0, 18)) { await tap(page, id); await settle(page); }
      await page.waitForFunction(() => window.__iceGame.getState().mood === 'alert');
      assert.ok((await state(page)).expression.brow > 0.2);
      await page.screenshot({ path: 'test-results/penguin-alert.png' });
      await page.locator('#restart-button').click();
      await page.locator('#confirm-restart').click();
    }

    for (const viewport of [{ width: 834, height: 1194 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);
      await page.locator('[data-view="top"]').click();
      await inspectCanvas(page, `${engine.name()}-overhead-${viewport.width}`);
      await page.locator('[data-view="reset"]').click();
      await inspectCanvas(page, `${engine.name()}-ice-hole-${viewport.width}`);
    }

    let loser = 0;
    for (const id of ['0,0', '1,0', '0,1', '1,-1', '-1,1', '-1,0', '0,-1']) {
      const before = await state(page);
      if (before.lost) break;
      if (!before.tiles.some(tile => tile.id === id)) continue;
      loser = before.turn;
      await tap(page, id);
      await settle(page);
    }
    assert.equal((await state(page)).lost, true);
    await expect(page.locator('#result-dialog')).toBeVisible();
    await expect(page.locator('#result-loser')).toContainText(`玩家 ${loser + 1}`);
    await expect(page.locator('#result-title')).toContainText('赢啦');
    await page.waitForTimeout(500);
    const confettiPixels = await page.locator('#result-confetti').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
      return visible;
    });
    assert.ok(confettiPixels > 30, 'Victory celebration must actually draw confetti');
    await page.screenshot({ path: `test-results/${engine.name()}-victory-mobile.png` });
    const result = await page.locator('#result-dialog').boundingBox();
    assert.ok(result.x >= 0 && result.x + result.width <= 390 && result.y >= 0 && result.y + result.height <= 844);
    await page.getByRole('button', { name: '查看冰场' }).click();
    await page.waitForFunction(() => window.__iceGame.getState().mood === 'swimming', null, { timeout: 8000 });
    assert.equal((await state(page)).water.penguinSplashed, true);
    await page.screenshot({ path: `test-results/${engine.name()}-penguin-swimming.png` });
    await page.locator('#restart-button').click();
    assert.equal((await state(page)).turn, 0);
    assert.equal((await state(page)).mood, 'happy');
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: orbit, no accidental taps, zoom, camera presets, player-one starts, expressions, ice hole, swimming and victory animation passed`);
  } finally { await browser.close(); }
}
