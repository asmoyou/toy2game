import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const url = process.env.GAME_URL ?? 'http://localhost:5173/games/frog-feast/';
const output = new URL('../artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const names = ['1 号绿蛙', '2 号蓝蛙', '3 号黄蛙', '4 号红蛙'];
const state = page => page.evaluate(() => window.__frog.state());
const diag = page => page.evaluate(() => window.__frog.diagnostics());
function sameCamera(actual, expected) { actual.position.forEach((value, i) => assert.ok(Math.abs(value - expected.position[i]) < 1e-8)); assert.ok(Math.abs(actual.zoom - expected.zoom) < 1e-8); }
const button = (page, name) => page.getByRole('button', { name, exact: true });
const shot = (page, name) => page.screenshot({ path: new URL(`${name}.png`, output).pathname });
async function load(page) { await page.goto('./'); await page.waitForFunction(() => window.__frog); await page.evaluate(() => document.fonts.ready); }
async function settings(page, count, bots) {
  await button(page, '游戏设置').click(); await button(page, `${count} 人`).click();
  for (let i = 0; i < count; i++) await button(page, `${names[i]}设为${bots.includes(i) ? '机器人' : '真人'}`).click();
  await button(page, '按此设置开始新局').click();
  assert.equal((await state(page)).phase, 'ready');
}
async function pixels(page) {
  const png = PNG.sync.read(await page.locator('#frog-scene canvas').screenshot());
  let blue = 0; const palette = new Set();
  for (let y = 0; y < png.height; y += 4) for (let x = 0; x < png.width; x += 4) {
    const p = (y * png.width + x) * 4, [r, g, b] = png.data.subarray(p, p + 3);
    if (b > r + 40 && g > r + 15) blue++;
    palette.add(`${r >> 3},${g >> 3},${b >> 3}`);
  }
  assert.ok(blue > 300 && palette.size > 100, 'the blue bowl, frogs, and beans must render as actual pixels');
}
async function frozen(page) {
  const before = await state(page); await page.waitForTimeout(350);
  assert.deepEqual(await state(page), before, 'paused rules, countdown and bots must not advance');
}
async function noOverflow(page) {
  const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, controls: [...document.querySelectorAll('.header-tools button, .view-tools button, .eat-button:not(:disabled), dialog[open] .seat-roles button, dialog[open] [data-count]')].filter(element => element.getClientRects().length).map(element => ({ label: element.getAttribute('aria-label') ?? element.textContent, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })) }));
  assert.equal(layout.overflow, false);
  assert.deepEqual(layout.controls.filter(control => control.width < 43.9 || control.height < 43.9), [], 'touch controls need at least 44 px');
}

const cases = [['desktop', 1440, 1000, false], ['ipad-landscape', 1180, 820, true], ['ipad-portrait', 820, 1180, true], ['ipad-compact', 1024, 768, true], ['phone-portrait', 390, 844, true], ['phone-landscape', 844, 390, true]].filter(entry => !process.env.CHECK_CASES || process.env.CHECK_CASES.split(',').includes(entry[0]));
const engines = [['chrome', await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' })]];
if (process.env.CHECK_WEBKIT === '1') engines.push(['webkit', await webkit.launch()]);
try {
  for (const [engine, browser] of engines) for (const [name, width, height, touch] of engine === 'webkit' ? cases.filter(entry => ['ipad-landscape', 'ipad-portrait'].includes(entry[0])) : cases) {
    const context = await browser.newContext({ baseURL: url, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(new URL(url).origin)) errors.push(`${response.status()} ${response.url()}`); });
    try {
      await load(page); await pixels(page); await noOverflow(page); await shot(page, `${engine}-${name}`);
      assert.equal((await state(page)).remaining, 60); assert.deepEqual((await state(page)).settings.bots, [false, true, true, true]);
      const initial = await diag(page);
      assert.ok(initial.drawCalls < 350, 'static toy parts should be merged for tablet performance');
      assert.equal(initial.frogs.length, 4);
      assert.deepEqual(initial.frogs.filter(frog => frog.x < 0 || frog.x > width || frog.y < 0 || frog.y > height), []);
      const green = initial.frogs[0];
      await page.mouse.move(green.x, green.y); await page.mouse.down();
      await page.mouse.move(green.x - 55, green.y - 20, { steps: 5 }); await page.mouse.up();
      assert.equal((await state(page)).phase, 'ready', 'camera drag must not bite or start');
      await button(page, '恢复默认视角').click();
      await page.waitForTimeout(250);
      const resetCamera = (await diag(page)).camera;
      resetCamera.position.forEach((value, i) => assert.ok(Math.abs(value - initial.camera.position[i]) < 1e-6, 'view reset clears drag inertia'));
      assert.equal(resetCamera.zoom, initial.camera.zoom);
      const target = (await diag(page)).frogs[0];
      if (touch) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
      assert.equal((await state(page)).phase, 'countdown', 'one tap on the actual frog starts preparation');
      await button(page, '暂停游戏').click(); await frozen(page);
      await button(page, '继续游戏').last().click();
      await page.waitForFunction(() => window.__frog.state().phase === 'playing');
      const before = await page.locator('#frog-scene canvas').screenshot();
      await page.keyboard.down('a');
      await page.waitForFunction(() => window.__frog.state().scores[0] > 0, null, { timeout: 12000 });
      await page.keyboard.up('a');
      assert.notEqual(Buffer.compare(before, await page.locator('#frog-scene canvas').screenshot()), 0);
      await button(page, '游戏设置').click(); await frozen(page);
      await button(page, '3 号黄蛙设为真人').click(); await button(page, '2 人').click(); await button(page, '4 人').click();
      await expect(button(page, '3 号黄蛙设为真人')).toHaveAttribute('aria-pressed', 'true');
      await noOverflow(page); await shot(page, `${engine}-${name}-settings`);
      const stopped = await state(page);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await button(page, '关闭设置').click(); assert.equal((await state(page)).paused, true); await frozen(page);
      assert.deepEqual((await state(page)).settings, stopped.settings, 'canceled draft never affects the current game');
      await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await button(page, '新的一局').click(); await frozen(page);
      const scores = (await state(page)).scores;
      const resumedScores = await page.evaluate(() => { document.querySelector('#cancel-restart').click(); return window.__frog.state().scores; });
      assert.deepEqual(resumedScores, scores, 'cancel preserves scores before the next physics frame resumes');
      await button(page, '新的一局').click(); await button(page, '重新开局').click();
      assert.equal((await state(page)).phase, 'ready'); assert.deepEqual((await state(page)).settings.bots, [false, true, true, true]);
      await button(page, '新的一局').click(); assert.equal(await page.locator('dialog[open]').count(), 0);

      if (name === 'desktop') {
        // Native fullscreen, including exit outside the toolbar, preserves camera and match.
        if (await page.evaluate(() => document.fullscreenEnabled)) {
          await button(page, '开始抢豆').click();
          await page.waitForFunction(() => window.__frog.state().phase === 'playing');
          await page.keyboard.down('a');
          await page.waitForFunction(() => window.__frog.state().scores[0] > 0);
          await page.keyboard.up('a');
          await button(page, '向右旋转视角').click();
          await button(page, '暂停游戏').click();
          const match = await state(page);
          const camera = (await diag(page)).camera;
          await button(page, '进入全屏').click(); await expect(button(page, '退出全屏')).toHaveAttribute('data-tooltip', '退出全屏');
          await page.evaluate(() => document.exitFullscreen());
          await expect(button(page, '进入全屏')).toHaveAttribute('aria-pressed', 'false');
          sameCamera((await diag(page)).camera, camera); assert.deepEqual(await state(page), match);
          await button(page, '进入全屏').click(); await button(page, '退出全屏').click();
          await button(page, '继续游戏').last().click();
          await button(page, '恢复默认视角').click();
        }
        await settings(page, 3, [0, 1, 2]);
        await page.reload(); await page.waitForFunction(() => window.__frog);
        assert.equal((await state(page)).settings.count, 3); assert.deepEqual((await state(page)).settings.bots, [true, true, true, false]);
        await button(page, '游戏设置').click(); await button(page, '4 人').click();
        await expect(button(page, '4 号红蛙设为真人')).toHaveAttribute('aria-pressed', 'true');
        await button(page, '关闭设置').click();
        await button(page, '开始抢豆').click();
        await button(page, '游戏规则').click(); await frozen(page); await button(page, '关闭规则').click();
        await page.waitForFunction(() => window.__frog.state().phase === 'playing');
        await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await frozen(page);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForFunction(() => window.__frog.state().remaining < 48);
        await button(page, '暂停游戏').click(); await shot(page, 'chrome-midgame-paused');
        await button(page, '继续游戏').last().click();
        // Full match through real robot input: no diagnostics or force-finish shortcut.
        await page.locator('#result-dialog[open]').waitFor({ timeout: 90000 });
        assert.equal((await state(page)).remaining, 0); assert.equal((await state(page)).scores.reduce((a, b) => a + b, 0), 60);
        await shot(page, 'chrome-result');
        await button(page, '再来一局').click(); assert.equal((await state(page)).phase, 'ready');
        await page.waitForTimeout(400); assert.equal((await state(page)).remaining, 60);
        await button(page, '关闭音效').click(); await page.reload(); await page.waitForFunction(() => window.__frog);
        await expect(button(page, '开启音效')).toBeVisible();
      }

      if (engine === 'chrome' && name === 'ipad-landscape') {
        await settings(page, 2, []); await button(page, '开始抢豆').click();
        await page.waitForFunction(() => window.__frog.state().phase === 'playing');
        const cdp = await context.newCDPSession(page);
        const targets = [];
        for (const id of [0, 1]) { const box = await page.locator(`#eat-${id}`).boundingBox(); targets.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: id + 1, radiusX: 4, radiusY: 4 }); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: targets });
        await page.waitForTimeout(1700);
        const bites = (await state(page)).bites;
        assert.ok(bites[0] >= 3 && bites[1] >= 3, 'two real touch contacts must hold both players simultaneously');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.waitForTimeout(850); assert.deepEqual((await state(page)).bites, bites, 'pointercancel releases both inputs');
        const canvas = await page.locator('#frog-scene canvas').boundingBox();
        const p1 = { x: canvas.x + canvas.width * 0.4, y: canvas.y + canvas.height * 0.5, id: 1 }, p2 = { x: canvas.x + canvas.width * 0.6, y: p1.y, id: 2 };
        const oldCamera = (await diag(page)).camera;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p1, x: p1.x - 50 }, { ...p2, x: p2.x + 50 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.deepEqual((await state(page)).bites, bites, 'pinch must not bite');
        assert.notDeepEqual((await diag(page)).camera, oldCamera, 'pinch actually changes zoom');
        await button(page, '恢复默认视角').click();
        await page.keyboard.down('a'); await button(page, '游戏设置').click();
        await button(page, '按此设置开始新局').click(); await page.keyboard.up('a');
        await page.waitForTimeout(800); assert.deepEqual((await state(page)).bites, [0, 0, 0, 0], 'restarting cancels held input from the previous match');
      }

      await page.getByRole('link', { name: '返回游戏大厅' }).click();
      await button(page, '最近玩过').click(); await expect(page.locator('.game-card[data-game="frog-feast"]')).toBeVisible();
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${name}`);
    } catch (error) { await shot(page, `${engine}-${name}-failure`); throw error; }
    finally { await context.close(); }
  }

  const browser = engines[0][1];
  for (const mode of ['disabled', 'missing-exit', 'failure', 'legacy-disabled', 'legacy-incomplete', 'legacy']) {
    const context = await browser.newContext({ baseURL: url });
    await context.addInitScript(mode => {
      // Chrome also exposes prefixed aliases: a disabled-capability fixture must disable both.
      Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, value: false });
      Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, writable: true, value: undefined });
      HTMLElement.prototype.webkitRequestFullscreen = undefined;
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: mode === 'failure' || mode === 'missing-exit' });
      if (mode === 'missing-exit') Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: undefined });
      if (mode === 'failure') HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('denied'));
      if (mode.startsWith('legacy')) {
        Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, value: mode !== 'legacy-disabled' });
        let full = null;
        Object.defineProperty(document, 'webkitFullscreenElement', { get: () => full });
        HTMLElement.prototype.webkitRequestFullscreen = function () { full = this; document.dispatchEvent(new Event('webkitfullscreenchange')); };
        if (mode !== 'legacy-incomplete') document.webkitExitFullscreen = () => { full = null; document.dispatchEvent(new Event('webkitfullscreenchange')); };
      }
    }, mode);
    const page = await context.newPage();
    try {
      await load(page);
      if (mode === 'failure') {
        await button(page, '向右旋转视角').click(); const camera = (await diag(page)).camera;
        await button(page, '进入全屏').click(); await expect(page.getByRole('status')).toContainText('暂时无法切换全屏');
        sameCamera((await diag(page)).camera, camera); assert.equal((await state(page)).remaining, 60);
      } else if (mode === 'legacy') {
        await button(page, '进入全屏').click(); await expect(button(page, '退出全屏')).toHaveAttribute('data-tooltip', '退出全屏');
        await button(page, '退出全屏').click(); await expect(button(page, '进入全屏')).toHaveAttribute('aria-pressed', 'false');
        await button(page, '进入全屏').click(); await page.evaluate(() => document.webkitExitFullscreen());
        await expect(button(page, '进入全屏')).toBeVisible();
      } else await expect(page.locator('#fullscreen-button')).toBeHidden();
      console.log(`PASS fullscreen ${mode}`);
    } finally { await context.close(); }
  }
  for (const mode of ['corrupt-storage', 'blocked-storage', 'webgl-unavailable']) {
    const context = await browser.newContext({ baseURL: url });
    await context.addInitScript(mode => {
      if (mode === 'corrupt-storage') localStorage.setItem('frog-feast-preferences-v1', '{bad');
      if (mode === 'blocked-storage') Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('disabled'); } });
      if (mode === 'webgl-unavailable') {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type.includes('webgl') ? null : get.call(this, type, ...rest); };
      }
    }, mode);
    const page = await context.newPage();
    try {
      await page.goto('./');
      if (mode === 'webgl-unavailable') {
        await expect(button(page, '重新加载')).toBeVisible(); await expect(button(page, '开始抢豆')).toBeDisabled();
      } else { await page.waitForFunction(() => window.__frog); assert.equal((await state(page)).remaining, 60); await button(page, '游戏设置').click(); await button(page, '按此设置开始新局').click(); }
      console.log(`PASS ${mode}`);
    } finally { await context.close(); }
  }
} finally { await Promise.all(engines.map(([, browser]) => browser.close())); }
