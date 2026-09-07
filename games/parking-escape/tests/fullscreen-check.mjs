import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const baseURL = process.env.GAME_URL ?? 'http://localhost:5173/games/parking-escape/';
const artifacts = fileURLToPath(new URL('../../../artifacts/parking-escape/', import.meta.url));
await mkdir(artifacts, { recursive: true });

function mockFullscreen(mode) {
  let element = null;
  const legacy = mode.startsWith('legacy');
  const event = legacy ? 'webkitfullscreenchange' : 'fullscreenchange';
  const enter = () => {
    if (mode === 'rejected') return Promise.reject(new Error('Fullscreen denied'));
    if (mode === 'legacy-error') { document.dispatchEvent(new Event('webkitfullscreenerror')); return; }
    if (mode === 'event-driven') return;
    element = document.documentElement;
    document.dispatchEvent(new Event(event));
  };
  const exit = () => { element = null; document.dispatchEvent(new Event(event)); };
  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, value: legacy ? undefined : mode !== 'disabled' },
    fullscreenElement: { configurable: true, get: () => legacy ? null : element },
    exitFullscreen: { configurable: true, value: legacy || mode === 'missing-exit' ? undefined : exit },
    webkitFullscreenEnabled: { configurable: true, value: legacy && mode !== 'legacy-disabled' },
    webkitFullscreenElement: { configurable: true, get: () => legacy ? element : null },
    webkitExitFullscreen: { configurable: true, value: mode === 'legacy-missing-exit' ? undefined : exit },
  });
  Object.defineProperties(HTMLElement.prototype, {
    requestFullscreen: { configurable: true, value: legacy || mode === 'missing-enter' ? undefined : enter },
    webkitRequestFullscreen: { configurable: true, value: mode === 'legacy-missing-enter' ? undefined : enter },
  });
  window.__fullscreenMock = {
    enter: () => { element = document.documentElement; document.dispatchEvent(new Event(event)); },
    exit,
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const debug = window.__parking;
    return {
      game: JSON.parse(localStorage.getItem('parking-escape-save-v2')).game,
      camera: debug ? { position: debug.scene.camera.position.toArray(), quaternion: debug.scene.camera.quaternion.toArray(), zoom: debug.scene.camera.zoom } : null,
    };
  });
}

async function prepare(page) {
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: '提示', exact: true }).click();
  await page.getByRole('button', { name: '执行提示这一步' }).click();
  await expect(page.getByRole('button', { name: '撤销一步' })).toBeEnabled();
  await page.getByRole('button', { name: '向右旋转视角' }).click();
  if (await page.evaluate(() => '__parking' in window)) await page.evaluate(() => { window.__parking.scene.camera.zoom = 1.1; window.__parking.scene.camera.updateProjectionMatrix(); });
}

async function checkToggle(page, externalExit) {
  const before = await snapshot(page);
  await page.getByRole('button', { name: '进入全屏' }).click();
  const button = page.getByRole('button', { name: '退出全屏' });
  await expect(button).toHaveAttribute('data-tooltip', '退出全屏');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button.locator('svg')).toHaveAttribute('data-lucide', 'minimize');
  await button.click();
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '进入全屏' }).click();
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible();
  await externalExit();
  await expect(page.getByRole('button', { name: '进入全屏' })).toHaveAttribute('data-tooltip', '进入全屏');
  await expect(page.locator('#fullscreen svg')).toHaveAttribute('data-lucide', 'maximize');
  assert.deepEqual(await snapshot(page), before, 'Fullscreen must preserve the move history and camera pose/zoom');
}

for (const engine of process.env.CHECK_WEBKIT ? ['chrome', 'webkit'] : ['chrome']) {
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
  const check = async (name, run, { mode, viewport = { width: 1180, height: 820 } } = {}) => {
    const context = await browser.newContext({ baseURL, viewport, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
    try {
      if (mode) await context.addInitScript(mockFullscreen, mode);
      await run(page);
      assert.deepEqual(errors, []); assert.deepEqual(failures, []);
      console.log(`PASS ${engine}: ${name}`);
    } finally { await context.close(); }
  };
  try {
    for (const mode of ['disabled', 'missing-enter', 'missing-exit', 'legacy-disabled', 'legacy-missing-enter', 'legacy-missing-exit']) {
      await check(`hidden when ${mode}`, async page => {
        await page.goto('./');
        await expect(page.locator('#loading')).toHaveCount(0);
        await expect(page.locator('#fullscreen')).toBeHidden();
      }, { mode });
    }
    for (const mode of ['standard', 'legacy']) {
      await check(`${mode} enter, exit and external exit`, async page => {
        await prepare(page);
        await checkToggle(page, () => page.evaluate(() => window.__fullscreenMock.exit()));
      }, { mode });
    }
    await check('state changes only after browser events', async page => {
      await page.goto('./');
      await page.getByRole('button', { name: '进入全屏' }).click();
      await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
      await page.evaluate(() => window.__fullscreenMock.enter());
      await expect(page.getByRole('button', { name: '退出全屏' })).toHaveAttribute('aria-pressed', 'true');
    }, { mode: 'event-driven' });
    for (const mode of ['rejected', 'legacy-error']) {
      await check(`${mode} feedback preserves the game and camera`, async page => {
        await prepare(page);
        const before = await snapshot(page);
        await page.getByRole('button', { name: '进入全屏' }).click();
        await expect(page.locator('#toast')).toHaveText('暂时无法切换全屏，请稍后再试');
        await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
        assert.deepEqual(await snapshot(page), before);
      }, { mode });
    }
    if (engine === 'chrome') await check('native fullscreen including external exit', async page => {
      await prepare(page);
      await checkToggle(page, () => page.evaluate(() => document.exitFullscreen()));
    });
    for (const [name, width, height] of [['desktop', 1440, 1000], ['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['phone', 390, 844], ['small-phone', 320, 740], ['phone-landscape', 844, 390]]) {
      await check(`${name} toolbar, settings and scene`, async page => {
        await page.goto('./');
        await expect(page.getByRole('button', { name: '进入全屏' })).toBeVisible();
        const buttons = await page.locator('.header button:visible').evaluateAll(buttons => buttons.map(button => {
          const r = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label'), x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        }));
        assert.equal(buttons.length, 6);
        for (const button of buttons) {
          assert.ok(button.width >= 43.5 && button.height >= 43.5, `${button.label}: 44px target`);
          assert.ok(button.x >= 0 && button.right <= width, `${button.label}: fits the viewport`);
        }
        for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
          const a = buttons[i], b = buttons[j];
          assert.ok(a.right <= b.x + 0.1 || b.right <= a.x + 0.1 || a.bottom <= b.y || b.bottom <= a.y, 'Toolbar buttons must not overlap');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const png = PNG.sync.read(await page.locator('#parking-scene canvas').screenshot()), colors = new Set();
        for (let i = 0; i < png.data.length; i += 80) colors.add(`${png.data[i] >> 3},${png.data[i + 1] >> 3},${png.data[i + 2] >> 3}`);
        assert.ok(colors.size > 120);
        await page.screenshot({ path: `${artifacts}fullscreen-${engine}-${name}.png`, fullPage: true });
        await page.getByRole('button', { name: '游戏设置' }).click();
        await expect(page.getByRole('dialog', { name: '选择关卡' })).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `${artifacts}fullscreen-${engine}-${name}-settings.png`, fullPage: true });
      }, { mode: 'standard', viewport: { width, height } });
    }
  } finally { await browser.close(); }
}
