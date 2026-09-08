import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const baseURL = process.env.GAME_URL ?? 'http://localhost:5173/games/flip-match/';
const artifacts = fileURLToPath(new URL('../../../artifacts/flip-match/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const prefs = 'flip-match-preferences-v1';
const state = page => page.evaluate(() => window.__flip.state());
const ready = page => page.waitForFunction(() => window.__flip.game.ready);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const load = async page => { await page.goto('./'); await expect(page.locator('#loading')).toHaveCount(0); await expect(page.locator('#match-scene canvas')).toBeVisible(); };
const waitTurn = page => page.waitForFunction(() => window.__flip.game.ready && window.__flip.state().phase === 'first');

async function configure(page, count, pairs, bots, difficulty) {
  await button(page, '游戏设置').click(); await button(page, `${count} 人`).click();
  await page.locator(`[data-pairs="${pairs}"]`).click();
  for (let i = 0; i < count; i++) await page.locator(`[data-owner="${i}"][data-bot="${bots[i]}"]`).click();
  if (difficulty) await page.getByRole('combobox', { name: '机器人难度' }).selectOption(difficulty);
  await button(page, '按此设置开始新局').click();
}
async function tapTile(page, id, touch = false) {
  await ready(page);
  const p = await page.evaluate(id => window.__flip.diagnostics().tiles[id], id);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
function assertPixels(buffer) {
  const png = PNG.sync.read(buffer), colors = new Set(); let nonBackground = 0, count = 0;
  for (let i = 0; i < png.data.length; i += 64) {
    const [r, g, b] = png.data.subarray(i, i + 3); colors.add(`${r >> 3},${g >> 3},${b >> 3}`);
    if (Math.max(r, g, b) - Math.min(r, g, b) > 25) nonBackground++; count++;
  }
  assert.ok(colors.size > 80, `3D canvas has ${colors.size} quantized colors`);
  assert.ok(nonBackground / count > 0.06, 'Visible toy occupies a substantial canvas area');
}

for (const engine of process.env.CHECK_ENGINE ? process.env.CHECK_ENGINE.split(',') : process.env.CHECK_WEBKIT ? ['chrome', 'webkit'] : ['chrome']) {
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
  async function check(name, run, { width = 1180, height = 820, touch = true, init } = {}) {
    if (process.env.CHECK_CASE && !new RegExp(process.env.CHECK_CASE).test(name)) return;
    const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
    await context.addInitScript(({ prefs }) => { if (!localStorage.getItem(prefs)) localStorage.setItem(prefs, JSON.stringify({ version: 1, settings: { count: 2, pairs: 24, bots: [false, false] }, sound: false })); }, { prefs });
    if (init) await context.addInitScript(init);
    const page = await context.newPage(), errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseURL).origin) failures.push(response.url()); });
    try { await run(page); assert.deepEqual(errors, []); assert.deepEqual(failures, []); console.log(`PASS ${engine}: ${name}`); }
    catch (error) { await page.screenshot({ path: `${artifacts}failure-${engine}-${name}.png`, fullPage: true }).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
  try {
    const viewports = engine === 'webkit' ? [['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['phone', 390, 844], ['phone-landscape', 844, 390]] : [['desktop', 1440, 1000], ['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['ipad-small', 1024, 768], ['phone', 390, 844], ['phone-landscape', 844, 390]];
    for (const [name, width, height] of viewports) await check(name, async page => {
      await load(page); const canvas = page.locator('#match-scene canvas');
      const before = await canvas.screenshot(); assertPixels(before);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const points = await page.evaluate(() => window.__flip.diagnostics().tiles), bounds = await canvas.boundingBox();
      for (const p of points) assert.ok(p.x > bounds.x && p.x < bounds.x + bounds.width && p.y > bounds.y && p.y < bounds.y + bounds.height, 'All playable tiles fit the scene');
      const G = await state(page), a = 17, b = G.deck.findIndex((face, id) => id !== a && face !== G.deck[a]);
      await tapTile(page, a, name !== 'desktop'); await expect(page.locator('#reveal-0 img')).toBeVisible();
      await page.waitForTimeout(380); assert.notEqual(Buffer.compare(before, await canvas.screenshot()), 0);
      await tapTile(page, b, name !== 'desktop'); assert.equal((await state(page)).phase, 'settling');
      await page.waitForTimeout(380); await page.screenshot({ path: `${artifacts}${engine}-${name}-playing.png`, fullPage: true });
      await button(page, '暂停游戏').click(); const paused = await state(page); await page.waitForTimeout(1650); assert.deepEqual(await state(page), paused);
      await button(page, '继续游戏').last().click(); await waitTurn(page); assert.equal((await state(page)).current, 1);
      await button(page, '游戏设置').click(); await button(page, '4 人').click(); await page.locator('[data-owner="3"][data-bot="true"]').click();
      await page.screenshot({ path: `${artifacts}${engine}-${name}-settings.png`, fullPage: true });
      const targets = await page.locator('.seat-roles button:visible, .count-options button:visible, .header button:visible, #bot-difficulty').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
      for (const target of targets) assert.ok(target.width >= 43.5 && target.height >= 43.5, '44 px buttons');
      assert.equal(await page.locator('#settings-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
      await button(page, '关闭设置').click(); assert.equal((await state(page)).settings.count, 2);
    }, { width, height, touch: name !== 'desktop' });

    await check('settings-restart-storage', async page => {
      await load(page); await tapTile(page, 0); const original = await state(page);
      await button(page, '游戏设置').click(); await button(page, '4 人').click();
      await expect(page.locator('[data-owner="2"][data-bot="false"]')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('[data-owner="3"][data-bot="true"]').click(); await button(page, '2 人').click(); await button(page, '4 人').click();
      await expect(page.locator('[data-owner="3"][data-bot="true"]')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('[data-pairs="12"]').click(); await button(page, '关闭设置').click(); assert.deepEqual(await state(page), original);
      await expect(button(page, '游戏设置')).toBeFocused();
      await button(page, '新的一局').click(); await button(page, '继续这局').click(); assert.deepEqual(await state(page), original);
      await button(page, '新的一局').click(); await button(page, '重新开局').click();
      const reset = await state(page); assert.equal(reset.settings.pairs, 24); assert.equal(reset.settings.count, 2); assert.equal(reset.actions.length, 0); assert.notEqual(reset.seed, original.seed);
      await button(page, '新的一局').click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
      await configure(page, 4, 12, [false, false, true, false]);
      await tapTile(page, 5); const saved = await state(page); await page.reload(); await expect(page.locator('#reveal-0 img')).toBeVisible(); assert.deepEqual(await state(page), saved);
      await button(page, '开启音效').click(); await page.reload(); await expect(button(page, '关闭音效')).toBeVisible(); assert.deepEqual(await state(page), saved);
      assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefs)).settings.count, 4);
    });

    await check('difficulty-draft-restart-storage', async page => {
      await load(page); await configure(page, 2, 12, [false, true]);
      assert.equal((await state(page)).settings.difficulty, 'normal');
      await expect(page.locator('[data-player="1"]')).toContainText('普通机器人');
      await tapTile(page, 0); const before = await state(page);
      await button(page, '游戏设置').click(); const select = page.getByRole('combobox', { name: '机器人难度' });
      await expect(select).toHaveValue('normal'); await expect(select.locator('option')).toHaveCount(4);
      await select.selectOption('hard'); await expect(page.locator('#difficulty-description')).toContainText('仍会遗忘');
      await page.waitForTimeout(1100); assert.deepEqual(await state(page), before);
      await button(page, '关闭设置').click(); assert.deepEqual(await state(page), before);
      await button(page, '新的一局').click(); await button(page, '继续这局').click(); assert.deepEqual(await state(page), before);
      await button(page, '游戏设置').click(); await select.selectOption('hard'); await button(page, '按此设置开始新局').click();
      assert.equal((await state(page)).settings.difficulty, 'hard'); assert.equal((await state(page)).actions.length, 0);
      await tapTile(page, 0); await button(page, '游戏设置').click(); await select.selectOption('perfect'); await button(page, '关闭设置').click();
      await button(page, '新的一局').click(); await button(page, '重新开局').click(); assert.equal((await state(page)).settings.difficulty, 'hard');
      await button(page, '游戏设置').click(); await select.selectOption('easy');
      await page.locator('[data-owner="1"][data-bot="false"]').click(); await expect(select).toBeDisabled(); await expect(select).toHaveValue('easy');
      await page.locator('[data-owner="1"][data-bot="true"]').click(); await expect(select).toBeEnabled(); await expect(select).toHaveValue('easy'); await button(page, '关闭设置').click();
      for (const level of ['easy', 'perfect', 'normal']) {
        await button(page, '游戏设置').click(); await select.selectOption(level); await button(page, '按此设置开始新局').click();
        await tapTile(page, 0); const saved = await state(page); assert.equal(saved.settings.difficulty, level);
        await page.reload(); await expect(page.locator('#reveal-0 img')).toBeVisible(); assert.deepEqual(await state(page), saved);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('flip-match-save-v1')).version), 2);
      }
      await page.evaluate(() => localStorage.removeItem('flip-match-save-v1')); await page.reload();
      await expect(page.locator('#loading')).toHaveCount(0); assert.equal((await state(page)).settings.difficulty, 'normal');
    });

    await check('difficulty-four-bots-layout', async page => {
      await load(page);
      for (const difficulty of ['perfect', 'normal']) {
        await configure(page, 4, 24, [true, true, true, true], difficulty);
        await page.evaluate(() => { const game = window.__flip.game; for (let i = 0; i < 30000 && game.state.phase !== 'finished'; i++) game.update(0.05); });
        await expect(page.locator('#result-dialog')).toBeVisible(); await button(page, '查看棋盘').click();
        assert.equal((await state(page)).scores.reduce((a, b) => a + b), 24);
        for (const [width, height] of [[390, 844], [844, 390], [1180, 820]]) {
          await page.setViewportSize({ width, height }); await page.waitForTimeout(200);
          const boxes = await page.locator('.player').evaluateAll(players => players.map(player => { const r = player.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right, overflow: player.scrollWidth > player.clientWidth }; }));
          for (const box of boxes) assert.ok(box.top >= 0 && box.bottom <= height && box.right <= width && !box.overflow, 'Scores and difficulty labels fit all four seats');
          await page.screenshot({ path: `${artifacts}${engine}-${difficulty}-${width}x${height}.png` });
        }
      }
    });

    await check('difficulty-legacy-save', async page => {
      await load(page); const G = await state(page);
      assert.equal(G.settings.difficulty, 'normal'); assert.deepEqual(G.scores, [1, 0]); assert.deepEqual(G.open, [1]);
      assert.equal(G.seed, 900); assert.deepEqual(G.owners.flatMap((owner, id) => owner >= 0 ? [id] : []), [0, 37]);
      await expect(page.locator('[data-player="1"]')).toContainText('普通机器人');
      await page.reload(); await expect(page.locator('#reveal-0 img')).toBeVisible(); assert.deepEqual(await state(page), G);
      await button(page, '游戏设置').click(); await expect(page.getByRole('combobox', { name: '机器人难度' })).toHaveValue('normal'); await button(page, '关闭设置').click();
    }, { init: () => {
      if (localStorage.getItem('legacy-difficulty-fixture')) return;
      localStorage.setItem('legacy-difficulty-fixture', 'yes');
      localStorage.setItem('flip-match-save-v1', JSON.stringify({ version: 1, settings: { count: 2, pairs: 24, bots: [false, true] }, seed: 900, actions: [
        { type: 'flip', id: 0, actor: 'human' }, { type: 'flip', id: 37, actor: 'human' }, { type: 'settle' }, { type: 'flip', id: 1, actor: 'human' },
      ] }));
    } });

    await check('match-miss-complete-and-replay', async page => {
      await load(page); await configure(page, 2, 12, [false, false]);
      const G = await state(page); const first = G.deck.flatMap((face, id) => face === 0 ? [id] : []);
      await tapTile(page, first[0]); await tapTile(page, first[1]); await waitTurn(page);
      assert.deepEqual((await state(page)).scores, [1, 0]); assert.equal((await state(page)).current, 0);
      await page.screenshot({ path: `${artifacts}${engine}-collected.png` });
      await button(page, '棋子列表').click();
      for (let face = 1; face < 12; face++) {
        for (const id of G.deck.flatMap((value, id) => value === face ? [id] : [])) { await ready(page); await page.locator(`[data-tile="${id}"]`).click(); }
        if (face < 11) await waitTurn(page);
      }
      await expect(page.locator('#result-dialog')).toBeVisible(); assert.equal((await state(page)).phase, 'finished');
      await expect(page.locator('#result-scores')).toContainText('12'); await page.screenshot({ path: `${artifacts}${engine}-result.png` });
      await button(page, '再来一局').click(); assert.equal((await state(page)).actions.length, 0); assert.equal((await state(page)).settings.pairs, 12);
    });

    await check('robots-pause-background-and-cancel-old-game', async page => {
      await load(page); await configure(page, 4, 12, [true, true, true, true]);
      await expect.poll(async () => (await state(page)).actions.length).toBeGreaterThan(0);
      const readyState = await state(page); const forbidden = readyState.owners.findIndex(owner => owner < 0);
      assert.equal(await page.evaluate(id => window.__flip.game.flip(id, 'human'), forbidden), false);
      await button(page, '游戏规则').click(); const frozen = await state(page); await page.waitForTimeout(1800); assert.deepEqual(await state(page), frozen);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await button(page, '关闭规则').click(); await page.waitForTimeout(1700); assert.deepEqual(await state(page), frozen);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      await expect.poll(async () => (await state(page)).actions.length).toBeGreaterThan(frozen.actions.length);
      await button(page, '新的一局').click(); const confirm = await state(page); await page.waitForTimeout(1800); assert.deepEqual(await state(page), confirm); await button(page, '继续这局').click();
      await configure(page, 2, 12, [false, false]); const newGame = await state(page); await page.waitForTimeout(1800); assert.deepEqual(await state(page), newGame);
      await configure(page, 4, 12, [true, true, true, true]);
      // Accelerate only elapsed time; all computer choices and engine moves stay unchanged.
      await page.evaluate(() => { const game = window.__flip.game; for (let i = 0; i < 30000 && game.state.phase !== 'finished'; i++) game.update(0.05); });
      await expect(page.locator('#result-dialog')).toBeVisible(); const final = await state(page); assert.equal(final.scores.reduce((a, b) => a + b), 12);
      await button(page, '查看棋盘').click(); await button(page, '新的一局').click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
    });

    if (engine === 'chrome') await check('gestures-and-pointercancel', async page => {
      await load(page); const point = await page.evaluate(() => window.__flip.diagnostics().tiles[20]); const initial = await state(page);
      await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 80, point.y + 30, { steps: 6 }); await page.mouse.up(); assert.deepEqual(await state(page), initial);
      const cdp = await page.context().newCDPSession(page);
      const a = { x: point.x - 25, y: point.y }, b = { x: point.x + 25, y: point.y };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); assert.deepEqual(await state(page), initial);
      const zoom = await page.evaluate(() => window.__flip.scene.camera.zoom);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...a, x: a.x - 18 }, { ...b, x: b.x + 18 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.notEqual(await page.evaluate(() => window.__flip.scene.camera.zoom), zoom); assert.deepEqual(await state(page), initial);
      await button(page, '恢复默认视角').click(); assert.equal(await page.evaluate(() => window.__flip.scene.camera.zoom), 1);
      await tapTile(page, 20, true); assert.equal((await state(page)).open.length, 1);
    });

    await check('four-seats-keyboard-and-context-loss', async page => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); await load(page); await configure(page, 4, 24, [false, false, false, false]);
      await button(page, '棋子列表').click(); await page.locator('[data-tile="20"]').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#reveal-0 img')).toBeVisible();
      await button(page, '收起棋子列表').click();
      await tapTile(page, 20, true); assert.equal((await state(page)).actions.length, 1, 'Touching an open tile must not flip its neighbor');
      const pair = await state(page), mate = pair.deck.findIndex((face, id) => id !== 20 && face === pair.deck[20]);
      await tapTile(page, mate, true); await waitTurn(page);
      await tapTile(page, 20, true); assert.equal((await state(page)).actions.length, 3, 'Touching a cleared well must not flip its neighbor');
      for (const [name, width, height] of [['phone-four', 390, 844], ['ipad-four', 1180, 820], ['phone-wide-four', 844, 390]]) {
        await page.setViewportSize({ width, height }); await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const scores = await page.locator('.player').evaluateAll(players => players.map(player => { const r = player.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
        for (const score of scores) assert.ok(score.top >= 0 && score.bottom <= height, 'All four player scores remain visible');
        await page.screenshot({ path: `${artifacts}${engine}-${name}.png` });
        await button(page, '棋子列表').click(); await button(page, '收起棋子列表').click();
      }
      await page.evaluate(() => window.__flip.scene.renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
      await expect(page.getByText('暂时无法打开 3D 棋盘', { exact: true })).toBeVisible(); assert.equal(await page.evaluate(() => window.__flip.game.paused), true);
    }, { width: 390, height: 844 });

    for (const kind of ['corrupt', 'disabled']) await check(`storage-${kind}`, async page => {
      await load(page); await tapTile(page, 0); await expect(page.locator('#reveal-0 img')).toBeVisible();
    }, { init: kind === 'corrupt' ? () => { localStorage.setItem('flip-match-save-v1', '{broken'); localStorage.setItem('flip-match-preferences-v1', '{broken'); } : () => { Storage.prototype.getItem = () => { throw new Error('Blocked'); }; Storage.prototype.setItem = () => { throw new Error('Blocked'); }; } });

    await check('webgl-unavailable', async page => {
      await page.goto('./'); await expect(page.getByText('暂时无法打开 3D 棋盘', { exact: true })).toBeVisible(); await expect(button(page, '重新加载')).toBeVisible(); await expect(page.getByRole('link', { name: '返回游戏大厅' })).toBeVisible();
    }, { init: () => { const getContext = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.includes('webgl') ? null : getContext.call(this, type, ...args); }; } });
  } finally { await browser.close(); }
}
