import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { registry, root } from './catalog.mjs';

const url = process.env.SITE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
try {
  for (const game of registry) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(new URL(`games/${game.id}/`, url).href);
    const selector = game.id === 'penguin-ice' ? '#scene canvas' : '.scene-host canvas';
    await page.locator(selector).waitFor();
    await page.waitForFunction(() => !document.querySelector('#loading, .scene-loading'));
    // Resize the existing game scene for a cover; no separate illustration or scene implementation.
    await page.addStyleTag({ content: `${game.id === 'penguin-ice' ? '#scene' : '.scene-host'} { position: fixed !important; inset: 0 !important; width: 1200px !important; height: 800px !important; z-index: 9999 !important; } body * { visibility: hidden !important; } ${selector} { visibility: visible !important; }` });
    await page.waitForTimeout(2000);
    await page.locator(selector).screenshot({ path: `${root}apps/web/public/${game.cover}` });
    await page.close();
    console.log(`Captured ${game.cover}`);
  }
  // Raster favicon matches the library's dice mark.
  const icon = new PNG({ width: 64, height: 64 });
  const dots = [[19, 19], [45, 19], [32, 32], [19, 45], [45, 45]];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4;
    const dot = dots.some(([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 < 20);
    icon.data.set(dot ? [41, 55, 44, 255] : [198, 237, 135, 255], i);
  }
  await mkdir(`${root}apps/web/public`, { recursive: true });
  await writeFile(`${root}apps/web/public/favicon.png`, PNG.sync.write(icon));
} finally {
  await browser.close();
}
