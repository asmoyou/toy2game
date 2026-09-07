import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { root } from './catalog.mjs';

const base = process.env.SITE_URL ?? 'http://localhost:5173/';
const artifacts = `${root}artifacts/readme/gameplay/`;
const output = `${root}docs/images/`;
const viewport = { width: 960, height: 640 };
execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
await mkdir(artifacts, { recursive: true });
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const checks = [];

async function clickControl(page, selector) {
  // Use the real UI handlers while the recording shows only the game scene.
  await page.waitForFunction(selector => {
    const button = document.querySelector(selector);
    return button instanceof HTMLButtonElement && !button.disabled;
  }, selector);
  await page.locator(selector).evaluate(button => button.click());
}

async function record(id, host, play) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, recordVideo: { dir: artifacts, size: viewport } });
  const born = Date.now();
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  let timing;
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(base).origin) errors.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto(new URL(`games/${id}/`, base).href);
    await page.locator(`${host} canvas`).waitFor();
    await page.waitForFunction(() => !document.querySelector('#loading, .scene-loading'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${artifacts}${id}-interface.png` });
    await page.addStyleTag({ content: `${host} { position: fixed !important; inset: 0 !important; width: 960px !important; height: 640px !important; z-index: 9999 !important; } body * { visibility: hidden !important; } ${host} canvas { visibility: visible !important; } dialog::backdrop { background: transparent !important; backdrop-filter: none !important; }` });
    await page.waitForTimeout(900);
    const before = await page.locator(`${host} canvas`).screenshot({ path: `${artifacts}${id}-before.png` });
    const pixels = PNG.sync.read(before);
    const colors = new Set();
    for (let index = 0; index < pixels.data.length; index += 80) colors.add(`${pixels.data[index] >> 3},${pixels.data[index + 1] >> 3},${pixels.data[index + 2] >> 3}`);
    assert.ok(colors.size > 80, `${id}: blank scene`);
    const started = Date.now();
    await page.waitForTimeout(650);
    const result = await play(page);
    await page.waitForTimeout(1400);
    const after = await page.locator(`${host} canvas`).screenshot({ path: `${artifacts}${id}-after.png` });
    timing = { start: (started - born) / 1000, duration: (Date.now() - started) / 1000 };
    assert.notEqual(Buffer.compare(before, after), 0, `${id}: unchanged scene`);
    assert.deepEqual(errors, [], `${id}: browser errors`);
    checks.push({ id, colors: colors.size, errors, result, ...timing });
  } finally {
    await context.close();
  }
  const destination = `${output}${id}-gameplay.gif`;
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-ss', timing.start.toFixed(3), '-i', await video.path(), '-t', timing.duration.toFixed(3),
    '-vf', 'fps=10,scale=600:400:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
    '-map_metadata', '-1', '-loop', '0', destination,
  ]);
  const bytes = (await readFile(destination)).length;
  console.log(`Recorded ${id}: ${timing.duration.toFixed(1)}s, ${Math.round(bytes / 1024)} KiB`);
}

try {
  await record('penguin-ice', '#scene', async page => {
    await page.waitForFunction(() => window.__iceGame);
    for (const id of ['1,0', '0,1', '1,-1', '-1,1', '-1,0', '0,-1', '0,0']) {
      const state = await page.evaluate(() => window.__iceGame.getState());
      if (state.lost) break;
      const tile = state.tiles.find(tile => tile.id === id);
      if (!tile) continue;
      await page.mouse.click(tile.x, tile.y);
      await page.waitForFunction(previous => window.__iceGame.getState().move > previous, state.move);
      await page.waitForFunction(() => {
        const state = window.__iceGame.getState();
        return state.lost || state.phase === 'playing';
      }, null, { timeout: 20000 });
      await page.waitForTimeout(350);
    }
    const state = await page.evaluate(() => window.__iceGame.getState());
    assert.equal(state.lost, true, 'The recorded round must show a real physical loss.');
    return { moves: state.move, lost: state.lost, remaining: state.remaining };
  });
  await record('parking-escape', '#parking-scene', async page => {
    for (let step = 0; step < 4; step++) {
      await clickControl(page, '#hint');
      await page.waitForFunction(() => Boolean(window.__parking?.hint) && !document.querySelector('#apply-hint').disabled);
      await clickControl(page, '#apply-hint');
      await page.waitForFunction(() => !window.__parking.animating);
      await page.waitForTimeout(700);
    }
    await page.waitForFunction(() => document.querySelector('#result-dialog')?.open);
    const moves = await page.locator('#move-count').textContent();
    assert.equal(moves, '04');
    return { moves: Number(moves), completed: true };
  });
  await writeFile(`${artifacts}checks.json`, `${JSON.stringify(checks, null, 2)}\n`);
} finally {
  await browser.close();
}
