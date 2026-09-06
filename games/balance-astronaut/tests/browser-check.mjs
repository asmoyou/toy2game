import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';
import { PNG } from 'pngjs';

const url = process.env.GAME_URL ?? 'http://localhost:5173/games/balance-astronaut/';
const output = new URL('../artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const names = ['蓝星队', '金星队', '火星队', '绿星队'];
const colors = ['#257bc1', '#e5ae34', '#de7769', '#429d8b'];
const state = page => page.evaluate(() => window.__balance.state());
const diagnostics = page => page.evaluate(() => window.__balance.diagnostics());
async function placeFromList(page, id) {
  await page.getByRole('button', { name: '停靠位列表', exact: true }).click();
  await page.getByRole('button', { name: `${id + 1} 号停靠位`, exact: true }).click();
}
async function settled(page) { await page.waitForFunction(() => window.__balance.state().phase !== 'settling', null, { timeout: 20000 }); }
async function configure(page, { mode = 'classic', count = 2, bots = [] } = {}) {
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  await page.locator(`input[name="mode"][value="${mode}"]`).check();
  await page.getByRole('button', { name: `${count} 支队伍`, exact: true }).click();
  for (let i = 0; i < count; i++) await page.getByRole('button', { name: `${names[i]}设为${bots.includes(i) ? '机器人' : '真人'}`, exact: true }).click();
  await page.getByRole('button', { name: '开启新的一局', exact: true }).click();
  await page.waitForFunction(() => window.__balance.state().count === 0);
}
async function checkPixels(page) {
  const png = PNG.sync.read(await page.locator('#space-scene canvas').screenshot());
  const palette = new Set(); let cyan = 0;
  for (let y = 0; y < png.height; y += 4) for (let x = 0; x < png.width; x += 4) {
    const offset = (y * png.width + x) * 4;
    const [r, g, b] = png.data.subarray(offset, offset + 3);
    palette.add(`${r >> 3},${g >> 3},${b >> 3}`);
    if (g > r + 20 && b > r + 15) cyan++;
  }
  assert.ok(palette.size > 80 && cyan > 80, 'the platform must actually render');
}

const cases = [['desktop', 1440, 1000, false], ['ipad-landscape', 1180, 820, true], ['ipad-portrait', 820, 1180, true], ['phone-portrait', 390, 844, true], ['phone-landscape', 844, 390, true]];
const browsers = [];
if (process.env.PLAYWRIGHT_ENGINE !== 'webkit') browsers.push(['chrome', await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' })]);
if (process.env.CHECK_WEBKIT === '1' || process.env.PLAYWRIGHT_ENGINE === 'webkit') browsers.push(['webkit', await webkit.launch()]);
try {
  for (const [engine, browser] of browsers) for (const [name, width, height, touch] of engine === 'webkit' ? cases.filter(entry => entry[0].startsWith('ipad')) : cases) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(new URL(url).origin)) errors.push(`${response.status()} ${response.url()}`); });
    try {
      await page.goto(url); await page.waitForFunction(() => window.__balance);
      assert.equal((await state(page)).count, 0);
      const initial = await diagnostics(page);
      assert.equal(initial.rings.length, 4);
      assert.equal(initial.slots.length, 48);
      assert.deepEqual(initial.standby.map(crew => crew.color), colors.slice(0, 2));
      assert.equal(await page.getByRole('button', { name: '放置太空人', exact: true }).count(), 0);
      await checkPixels(page);
      const slot = initial.slots.find(slot => slot.id === 0);
      const before = await page.locator('#space-scene canvas').screenshot();
      if (touch) await page.touchscreen.tap(slot.x, slot.y); else await page.mouse.click(slot.x, slot.y);
      assert.equal((await state(page)).moves, 1, 'one canvas tap must immediately place one astronaut');
      assert.equal((await state(page)).count, 1);
      if (touch) await page.touchscreen.tap(slot.x, slot.y); else await page.mouse.click(slot.x, slot.y);
      assert.equal((await state(page)).moves, 1, 'repeated input while settling must be ignored');
      await page.waitForFunction(() => window.__balance.state().moves === 2 && window.__balance.state().turn === 0 && window.__balance.state().phase === 'place', null, { timeout: 25000 });
      assert.notEqual(Buffer.compare(before, await page.locator('#space-scene canvas').screenshot()), 0);

      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      const stopped = await state(page); await page.waitForTimeout(300);
      assert.equal((await state(page)).time, stopped.time);
      await page.locator('#resume-button').click();
      await page.getByRole('button', { name: '游戏规则', exact: true }).click();
      assert.equal((await state(page)).paused, true);
      await page.getByRole('button', { name: '关闭规则', exact: true }).click();

      await page.getByRole('button', { name: '游戏设置', exact: true }).click();
      await page.getByRole('button', { name: '4 支队伍', exact: true }).click();
      await page.getByRole('button', { name: '火星队设为机器人', exact: true }).click();
      await page.getByRole('button', { name: '2 支队伍', exact: true }).click();
      await page.getByRole('button', { name: '4 支队伍', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '火星队设为机器人', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#difficulty').count(), 0);
      await page.screenshot({ path: new URL(`${engine}-${name}-settings.png`, output).pathname });
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
      assert.equal((await state(page)).settings.count, 2);
      assert.equal((await state(page)).moves, 2);
      assert.equal((await diagnostics(page)).standby.length, 2);

      const bounds = await page.locator('#space-scene canvas').boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 90, bounds.y + bounds.height / 2 + 30, { steps: 6 }); await page.mouse.up();
      assert.equal((await state(page)).moves, 2, 'dragging must not place an astronaut');
      await page.getByRole('button', { name: '恢复默认视角', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual((await diagnostics(page)).slots.filter(slot => slot.x < 0 || slot.x > width || slot.y < 0 || slot.y > height), []);
      await page.screenshot({ path: new URL(`${engine}-${name}.png`, output).pathname });

      if (name === 'desktop') {
        await configure(page, { mode: 'dice', count: 4, bots: [2] });
        assert.deepEqual((await diagnostics(page)).standby.map(crew => crew.color), colors);
        await page.reload(); await page.waitForFunction(() => window.__balance);
        assert.equal((await state(page)).count, 0);
        assert.deepEqual((await diagnostics(page)).standby.map(crew => crew.color), colors);
        assert.equal((await state(page)).settings.bots[2], true);
        await page.getByRole('button', { name: '掷骰子', exact: true }).click();
        await page.waitForFunction(() => window.__balance.state().phase === 'place');
        const quota = (await state(page)).remaining;
        await placeFromList(page, 0); await settled(page);
        assert.equal((await state(page)).moves, 1);
        assert.equal((await state(page)).turn, quota === 1 ? 1 : 0);
        await configure(page, { count: 3 });
        assert.deepEqual((await diagnostics(page)).standby.map(crew => crew.color), colors.slice(0, 3));
        await configure(page);
        assert.equal((await diagnostics(page)).standby.length, 2);
        await placeFromList(page, 30); await settled(page);
        await placeFromList(page, 31); await settled(page);
        assert.equal((await state(page)).phase, 'finished');
        await page.locator('#result-dialog[open]').waitFor();
        await page.screenshot({ path: new URL(`${engine}-result.png`, output).pathname });
        await page.getByRole('button', { name: '趣味转盘', exact: true }).click();
        await page.getByRole('button', { name: '转动转盘', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('#spin-button').disabled);
        await page.getByRole('button', { name: '转动转盘', exact: true }).click();
        await page.getByRole('button', { name: '关闭转盘', exact: true }).click();
        await page.getByRole('button', { name: '查看结果', exact: true }).click();
        await page.getByRole('button', { name: '再来一局', exact: true }).click();
        assert.equal((await state(page)).count, 0);
        assert.equal((await state(page)).moves, 0);
        assert.equal(await page.locator('#spin-button').isDisabled(), false);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${name}`);
    } finally { await context.close(); }
  }
} finally { for (const [, browser] of browsers) await browser.close(); }
