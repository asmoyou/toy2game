import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { movesFrom } from '../src/rules.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const levels = JSON.parse(await readFile(new URL('../src/levels.json', import.meta.url), 'utf8'));
const finalLevel = levels.at(-1);
const baseURL = process.env.GAME_URL ?? 'http://localhost:5173/games/parking-escape/';
const staticDirectory = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
await mkdir(path.join(root, 'artifacts/parking-escape'), { recursive: true });

async function routeStatic(context) {
  if (!staticDirectory) return;
  await context.route(`${new URL(baseURL).origin}/**`, async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname.startsWith('/images/')) {
      try { return await route.fulfill({ body: await readFile(path.join(root, 'apps/web/public', pathname)), contentType: 'image/png' }); }
      catch { return route.fulfill({ status: 404, body: 'Not found' }); }
    }
    const relative = pathname.slice(new URL(baseURL).pathname.length) || 'index.html';
    const file = path.resolve(staticDirectory, relative);
    if (!file.startsWith(`${staticDirectory}/`)) return route.fulfill({ status: 404, body: 'Not found' });
    try { await route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] ?? 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
}

async function hintMove(page) {
  await page.getByRole('button', { name: '提示', exact: true }).click();
  await page.getByRole('button', { name: '执行提示这一步' }).click();
  await expect(page.locator('#hint-result')).toBeHidden();
}

function pixelColors(bytes) {
  const png = PNG.sync.read(bytes), colors = new Set();
  for (let y = 0; y < png.height; y += 3) for (let x = 0; x < png.width; x += 3) {
    const i = (y * png.width + x) * 4;
    colors.add(`${png.data[i] >> 3},${png.data[i + 1] >> 3},${png.data[i + 2] >> 3}`);
  }
  return colors.size;
}

async function checkInput(page, context) {
  assert.equal(await page.evaluate(() => '__parking' in window), true, 'Input diagnostics require a development build');
  const initial = await page.evaluate(() => ({ level: window.__parking.level, state: window.__parking.state }));
  const move = movesFrom(initial.level.cars, initial.state.positions).find(move => move.car !== 0);
  const points = await page.evaluate(move => ({ from: window.__parking.scene.screenPoint(move.car), to: window.__parking.scene.screenPoint(move.car, move.to) }), move);
  await page.mouse.move(points.from.x, points.from.y); await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('#move-count')).toHaveText('01');
  assert.equal(await page.evaluate(car => window.__parking.state.positions[car], move.car), move.to);
  await page.getByRole('button', { name: '撤销一步' }).click();
  await expect(page.locator('#move-forward')).toBeEnabled();
  const cdp = await context.newCDPSession(page);
  const a = { id: 11, x: points.from.x, y: points.from.y, radiusX: 7, radiusY: 7 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...a, x: points.to.x, y: points.to.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('#move-count')).toHaveText('00');
  const beforeZoom = await page.evaluate(() => window.__parking.scene.camera.zoom);
  const b = { ...a, id: 22, x: a.x + 50 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...a, x: a.x - 20 }, { ...b, x: b.x + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#move-count')).toHaveText('00');
  assert.notEqual(await page.evaluate(() => window.__parking.scene.camera.zoom), beforeZoom);
  await page.getByRole('button', { name: '恢复默认视角' }).click();
  await hintMove(page);
  await expect(page.locator('#undo')).toBeEnabled();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const frozen = await page.evaluate(() => window.__parking.seconds);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__parking.seconds), frozen);
  await page.evaluate(move => window.__parking.move(move), move);
  await expect(page.locator('#move-count')).toHaveText('01');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: '新的一局' }).click();
  await page.getByRole('button', { name: '重新开局' }).click();
  await page.getByRole('button', { name: '提示', exact: true }).click();
  await page.getByRole('button', { name: '游戏设置' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '关闭设置' }).click();
  await expect(page.locator('#hint-result')).toBeHidden();
  await expect(page.locator('#move-count')).toHaveText('00');
  await cdp.detach();
}

for (const engine of process.env.CHECK_WEBKIT ? ['chrome', 'webkit'] : ['chrome']) {
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
  try {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['phone', 390, 844], ['phone-landscape', 844, 390]]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: name !== 'desktop', isMobile: name !== 'desktop', deviceScaleFactor: 1 });
      await routeStatic(context);
      const page = await context.newPage(), errors = [], failures = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
      try {
        await page.goto('./');
        await expect(page.locator('#parking-scene canvas')).toBeVisible();
        await expect(page.locator('#loading')).toHaveCount(0);
        await page.waitForTimeout(350);
        const canvas = page.locator('#parking-scene canvas');
        const before = await canvas.screenshot();
        assert.ok(pixelColors(before) > 120, 'The parking toy must contain real rendered detail');
        if (process.env.CHECK_INPUT && engine === 'chrome') await checkInput(page, context);
        await page.screenshot({ path: path.join(root, `artifacts/parking-escape/${engine}-${name}.png`), fullPage: true });
        if (process.env.COVER && name === 'desktop' && engine === 'chrome') {
          await page.addStyleTag({ content: '#parking-scene { position:fixed!important; inset:0!important; width:1200px!important; height:800px!important; z-index:9999!important; } body * { visibility:hidden!important; } #parking-scene canvas { visibility:visible!important; }' });
          await page.waitForTimeout(350);
          await canvas.screenshot({ path: path.join(root, 'apps/web/public/images/parking-escape.png') });
          await page.reload();
        }
        await page.getByRole('button', { name: '向右旋转视角' }).click();
        assert.notEqual(Buffer.compare(before, await canvas.screenshot()), 0);
        await page.getByRole('button', { name: '恢复默认视角' }).click();
        await hintMove(page);
        await expect(page.locator('#move-count')).toHaveText('01');
        await expect(page.getByRole('button', { name: '撤销一步' })).toBeEnabled();
        assert.notEqual(Buffer.compare(before, await canvas.screenshot()), 0);
        await page.getByRole('button', { name: '撤销一步' }).click();
        await expect(page.locator('#move-count')).toHaveText('00');
        await page.getByRole('button', { name: '重做一步' }).click();
        await expect(page.locator('#move-count')).toHaveText('01');
        await page.reload();
        await expect(page.locator('#move-count')).toHaveText('01');
        await page.getByRole('button', { name: '暂停游戏' }).click();
        await expect(page.locator('#hint')).toBeDisabled();
        await page.getByRole('button', { name: '继续游戏', exact: true }).last().click();
        await page.getByRole('button', { name: '游戏设置' }).click();
        const settings = page.getByRole('dialog', { name: '选择关卡' });
        await expect(settings).toBeVisible();
        await expect(settings.locator('.eyebrow')).toHaveText('120 个停车场');
        await expect(settings.locator('[data-draft]')).toHaveCount(30);
        await settings.getByRole('button', { name: '渐入佳境', exact: true }).click();
        await expect(settings.locator('#draft-summary')).toContainText('第 01 关');
        await page.getByRole('button', { name: '第 8 关 礼让通行' }).click();
        await page.screenshot({ path: path.join(root, `artifacts/parking-escape/${engine}-${name}-settings.png`), fullPage: true });
        await page.getByRole('button', { name: '关闭设置' }).click();
        await expect(page.locator('#level-number')).toHaveText('第 01 关');
        await expect(page.locator('#move-count')).toHaveText('01');
        await page.getByRole('button', { name: '游戏设置' }).click();
        await expect(settings.getByRole('button', { name: '第 1 关 清晨出发' })).toHaveAttribute('aria-pressed', 'true');
        await expect(settings.getByRole('button', { name: '初来乍到', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: '游戏设置' })).toBeFocused();
        await page.getByRole('button', { name: '新的一局' }).click();
        await page.getByRole('button', { name: '继续这局' }).click();
        await expect(page.locator('#move-count')).toHaveText('01');
        await page.getByRole('button', { name: '新的一局' }).click();
        await page.getByRole('button', { name: '重新开局' }).click();
        await expect(page.locator('#move-count')).toHaveText('00');
        await expect(page.locator('#level-number')).toHaveText('第 01 关');
        for (let i = 0; i < 4; i++) await hintMove(page);
        await expect(page.getByRole('dialog', { name: '顺利出库！' })).toBeVisible();
        await expect(page.locator('#result-stars')).toHaveAttribute('aria-label', '3 星');
        await expect(page.locator('#result-moves')).toHaveText('4');
        await page.screenshot({ path: path.join(root, `artifacts/parking-escape/${engine}-${name}-result.png`), fullPage: true });
        await page.getByRole('button', { name: '下一关' }).click();
        await expect(page.locator('#level-number')).toHaveText('第 02 关');
        await expect(page.locator('#move-count')).toHaveText('00');
        await page.getByRole('button', { name: '关闭音效' }).click();
        await page.reload();
        await expect(page.getByRole('button', { name: '开启音效' })).toBeVisible();
        await page.getByRole('button', { name: '游戏设置' }).click();
        await expect(settings.getByRole('button', { name: '初来乍到', exact: true }).locator('small')).toHaveText('1 / 30');
        const available = new Set();
        for (const difficulty of ['初来乍到', '渐入佳境', '环环相扣', '出库高手']) {
          await settings.getByRole('button', { name: difficulty, exact: true }).click();
          await expect(settings.locator('[data-draft]')).toHaveCount(30);
          for (const id of await settings.locator('[data-draft]').evaluateAll(buttons => buttons.map(button => Number(button.dataset.draft)))) available.add(id);
        }
        assert.equal(available.size, 120, 'Every level must be reachable through the difficulty selector');
        await settings.getByRole('button', { name: `第 ${finalLevel.id} 关 ${finalLevel.name}`, exact: true }).click();
        await expect(settings.locator('#draft-summary')).toContainText(`第 ${finalLevel.id} 关`);
        const confirm = settings.getByRole('button', { name: '按此关卡开始新局' });
        const confirmBox = await confirm.boundingBox();
        assert.ok(confirmBox.y >= 0 && confirmBox.y + confirmBox.height <= height, 'The start button must stay on screen after scrolling to the last level');
        const gridBox = await settings.locator('#level-grid').boundingBox();
        const optionBox = await settings.locator('[data-draft]').last().boundingBox();
        assert.ok(gridBox.height >= optionBox.height + 8, 'The scrolling list must show at least one complete row of touch targets');
        const smallOptions = await settings.locator('[data-draft], [data-difficulty]').evaluateAll(buttons => buttons.filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width < 43.5 || rect.height < 43.5;
        }).map(button => button.getAttribute('aria-label')));
        assert.deepEqual(smallOptions, [], 'Level selection needs 44px touch targets');
        await page.screenshot({ path: path.join(root, `artifacts/parking-escape/${engine}-${name}-expansion-settings.png`), fullPage: true });
        await page.getByRole('button', { name: '关闭设置' }).click();
        await expect(page.locator('#level-number')).toHaveText('第 02 关');
        await page.getByRole('button', { name: '游戏设置' }).click();
        await expect(settings.locator('[data-draft="2"]')).toHaveAttribute('aria-pressed', 'true');
        await settings.getByRole('button', { name: '出库高手', exact: true }).click();
        await settings.getByRole('button', { name: `第 ${finalLevel.id} 关 ${finalLevel.name}`, exact: true }).click();
        await confirm.click();
        await expect(page.locator('#level-number')).toHaveText(`第 ${finalLevel.id} 关`);
        await expect(page.locator('#move-count')).toHaveText('00');
        await expect(page.locator('#chapter-levels button')).toHaveCount(6);
        await expect(page.locator('#chapter-levels [aria-current="step"]')).toHaveAttribute('data-level', String(finalLevel.id));
        const expandedBefore = await canvas.screenshot();
        assert.ok(pixelColors(expandedBefore) > 120);
        await hintMove(page);
        await expect(page.locator('#move-count')).toHaveText('01');
        await expect(page.locator('#undo')).toBeEnabled();
        assert.notEqual(Buffer.compare(expandedBefore, await canvas.screenshot()), 0);
        await page.reload();
        await expect(page.locator('#level-number')).toHaveText(`第 ${finalLevel.id} 关`);
        await expect(page.locator('#move-count')).toHaveText('01');
        await page.getByRole('button', { name: '游戏设置' }).click();
        await expect(settings.locator(`[data-draft="${finalLevel.id}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(settings.locator(`[data-draft="${finalLevel.id}"]`)).toBeInViewport();
        await page.getByRole('button', { name: '关闭设置' }).click();
        await page.screenshot({ path: path.join(root, `artifacts/parking-escape/${engine}-${name}-expansion.png`), fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
        const undersized = await page.locator('.header button, .puzzle-tools button, .direction-controls button, .garage-car, .chapter-levels button').evaluateAll(buttons => buttons.filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5);
        }).map(button => ({ name: button.getAttribute('aria-label') ?? button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
        assert.deepEqual(undersized, [], 'Touch controls must remain at least 44 CSS pixels');
        assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        console.log(`PASS ${engine} ${name}: scene pixels, movement, hints, undo/redo, pause, settings, restart, completion, expansion selection and persistence`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
