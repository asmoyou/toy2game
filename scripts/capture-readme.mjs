import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { build } from 'vite';
import { registry, root } from './catalog.mjs';

const url = process.env.SITE_URL ?? 'http://localhost:5173/';
const output = `${root}docs/images/`;
const artifacts = `${root}artifacts/readme/`;
const descriptions = {
  'penguin-ice': '轮流敲冰，别让企鹅落水。',
  'rabbit-trap': '翻牌过机关，向胡萝卜山顶出发。',
  'balance-astronaut': '逐一放置队员，守住平台的平衡。',
  'parking-escape': '挪出一条路，让警车顺利出库。',
};
assert.equal(registry.length, 4, 'Update the four-game layout when the registry changes.');
for (const game of registry) assert.ok(descriptions[game.id], `Missing caption: ${game.id}`);

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const asset = async (path, mime = 'image/png') => `data:${mime};base64,${(await readFile(path)).toString('base64')}`;
await mkdir(output, { recursive: true });
await mkdir(artifacts, { recursive: true });
const font = await asset(`${root}apps/web/public/fonts/dm-sans.ttf`, 'font/ttf');
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const fontBuild = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    emptyOutDir: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: { input: webRequire.resolve('@fontsource-variable/noto-sans-sc/wght.css') },
  },
});
const chineseFontCss = (Array.isArray(fontBuild) ? fontBuild : [fontBuild])
  .flatMap(result => result.output).filter(file => file.type === 'asset' && file.fileName.endsWith('.css'))
  .map(file => file.source).join('\n');
assert.ok(chineseFontCss.includes('data:font/woff2'), 'The standalone image layouts need embedded Noto Sans SC.');
const mark = await asset(`${root}apps/web/public/favicon.png`);
const covers = new Map();
for (const game of registry) covers.set(game.id, await asset(`${root}apps/web/public/${game.cover}`));

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const checks = [];

async function capturePage(name, path, viewport, canvas) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: name !== 'desktop' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(url).origin) errors.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto(new URL(path, url).href);
    await page.evaluate(() => document.fonts.ready);
    if (canvas) {
      await page.locator(canvas).waitFor();
      await page.waitForFunction(() => !document.querySelector('#loading, .scene-loading'));
    } else {
      await page.locator('.game-card').last().waitFor();
      await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
    }
    await page.waitForTimeout(1600);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
    await page.screenshot({ path: `${artifacts}${name}.png` });
    const check = { name, viewport, errors };
    if (canvas) {
      const before = await page.locator(canvas).screenshot();
      const pixels = PNG.sync.read(before);
      const colors = new Set();
      for (let index = 0; index < pixels.data.length; index += 80) {
        colors.add(`${pixels.data[index] >> 3},${pixels.data[index + 1] >> 3},${pixels.data[index + 2] >> 3}`);
      }
      assert.ok(colors.size > 80, `${name}: blank scene`);
      if (name === 'tablet') {
        await page.getByRole('button', { name: '抽一张卡牌', exact: true }).click();
      } else {
        await page.getByRole('button', { name: '提示', exact: true }).click();
        await page.getByRole('button', { name: '执行提示这一步' }).click();
        await page.waitForFunction(() => document.querySelector('#move-count')?.textContent === '01');
      }
      await page.waitForTimeout(800);
      assert.notEqual(Buffer.compare(before, await page.locator(canvas).screenshot()), 0, `${name}: unchanged scene`);
      await page.screenshot({ path: `${artifacts}${name}-after.png` });
      check.colors = colors.size;
      check.interactionChanged = true;
    }
    assert.deepEqual(errors, [], `${name}: browser errors`);
    checks.push(check);
    console.log(`Captured ${name}: ${viewport.width} x ${viewport.height}`);
    return await asset(`${artifacts}${name}.png`);
  } finally {
    await page.close();
  }
}

const css = `
  ${chineseFontCss}
  @font-face { font-family: 'DM Sans'; src: url('${font}'); font-weight: 100 1000; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { color: #242826; background: #f6f7f8; font-family: 'DM Sans', 'Noto Sans SC Variable', sans-serif; letter-spacing: 0; }
  h1, h2, h3, p, figure { margin: 0; }
  .sheet { width: 1600px; height: 1280px; padding: 54px 64px 36px; overflow: hidden; }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand img { width: 64px; height: 64px; border-radius: 8px; }
  .brand h1 { font-size: 68px; line-height: 1.05; font-weight: 850; }
  .brand h1 span { color: #528336; }
  .brand .name { font-size: 30px; margin-left: 6px; color: #58615b; }
  .intro { margin-top: 26px; display: flex; align-items: end; justify-content: space-between; gap: 32px; }
  .intro p { font-size: 34px; line-height: 1.4; font-weight: 650; }
  .facts { font-size: 21px; color: #58615b; white-space: nowrap; padding-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 32px; }
  .game { overflow: hidden; border: 1px solid #dde3df; border-radius: 8px; background: #fff; }
  .game img { display: block; width: 100%; height: 326px; object-fit: contain; }
  .game[data-game='penguin-ice'] img { background: #e5ecee; }
  .game[data-game='rabbit-trap'] img { background: #edf4ef; }
  .game[data-game='balance-astronaut'] img { background: #ebebea; }
  .game[data-game='parking-escape'] img { background: #edf4f6; }
  .caption { padding: 18px 24px 20px; }
  .caption-top { display: flex; justify-content: space-between; align-items: center; gap: 18px; }
  .caption h2 { font-size: 30px; font-weight: 750; line-height: 1.4; }
  .caption .players { font-size: 21px; color: #58615b; white-space: nowrap; }
  .caption p { margin-top: 5px; font-size: 23px; color: #58615b; line-height: 1.5; }
  footer { margin-top: 25px; border-top: 1px solid #d9dfdb; padding-top: 22px; display: flex; justify-content: space-between; font-size: 20px; color: #58615b; }
  footer strong { font-weight: 700; color: #303b34; }
  .devices { height: 960px; }
  .devices .intro { margin-top: 28px; }
  .device-grid { display: grid; grid-template-columns: 644px 510px 250px; gap: 34px; align-items: end; margin-top: 20px; }
  .device img { width: 100%; display: block; }
  .device .frame { padding: 7px; background: #303633; border-radius: 8px; border: 1px solid #49524c; }
  .device h2 { font-size: 26px; margin-top: 24px; font-weight: 750; }
  .device p { font-size: 20px; color: #58615b; margin-top: 7px; }
  .device.phone .frame { padding: 7px; }
  .devices footer { margin-top: 35px; }
  .social { width: 1280px; height: 640px; padding: 48px 48px 32px; background: #f6f7f8; }
  .social .brand h1 { font-size: 62px; }
  .social .brand .name { font-size: 28px; }
  .social .intro { margin-top: 24px; }
  .social .intro p { font-size: 30px; }
  .social .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 30px; }
  .social .game img { height: 223px; }
  .social .caption { padding: 15px 16px 18px; }
  .social .caption-top { display: block; }
  .social .caption h2 { font-size: 23px; }
  .social .players { display: block; font-size: 18px; margin-top: 7px; }
  .social footer { margin-top: 29px; font-size: 18px; }
`;

const brand = `<div class="brand"><img src="${mark}" alt=""><h1>Toy<span>2</span>Game</h1><span class="name">在线玩具箱</span></div>`;
const games = compact => registry.map(game => `<article class="game" data-game="${escape(game.id)}">
  <img src="${covers.get(game.id)}" alt="${escape(game.title)}实际游戏场景">
  <div class="caption"><div class="caption-top"><h2>${escape(game.title)}</h2><span class="players">${game.id === 'parking-escape' ? '单人解谜' : `${escape(game.players)}同屏`}${compact ? '' : ` · ${escape(game.duration)}`}</span></div>
  ${compact ? '' : `<p>${escape(descriptions[game.id])}</p>`}</div></article>`).join('');

async function render(name, width, height, content) {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(name)}</title><style>${css}</style></head><body>${content}</body></html>`;
  await writeFile(`${artifacts}${name}.html`, html);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('h1, h2, p, .players, .name, footer, footer > *, .facts, .frame, .game')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight || element.scrollWidth > element.clientWidth + 1;
    }).map(element => element.textContent || element.tagName));
    assert.deepEqual(overflow, [], `${name}: overflowing content`);
    await page.screenshot({ path: `${output}${name}.png` });
    checks.push({ name, width, height, overflow });
    console.log(`Rendered ${name}: ${width} x ${height}`);
  } finally {
    await page.close();
  }
}

try {
  const desktop = await capturePage('desktop', './', { width: 1440, height: 1100 });
  const tablet = await capturePage('tablet', 'games/rabbit-trap/', { width: 1180, height: 820 }, '.scene-host canvas');
  const phone = await capturePage('phone', 'games/parking-escape/', { width: 390, height: 844 }, '#parking-scene canvas');

  await render('toy2game-overview', 1600, 1280, `<main class="sheet">${brand}
    <div class="intro"><p>把实物玩具，变成打开就能玩的网页游戏。</p><span class="facts">免费游玩 · 无需注册</span></div>
    <div class="grid">${games(false)}</div>
    <footer><strong>单人解谜 / 同屏派对 / 电脑对手</strong><span>手机、平板、电脑 · 实际游戏画面</span></footer></main>`);

  await render('toy2game-devices', 1600, 960, `<main class="sheet devices">${brand}
    <div class="intro"><p>手机、平板、电脑，都有一块游乐场。</p><span class="facts">触控与鼠标 · 横屏与竖屏</span></div>
    <div class="device-grid">
      <figure class="device"><div class="frame"><img src="${desktop}" alt="桌面游戏大厅"></div><figcaption><h2>电脑 · 挑一款，马上开局</h2><p>游戏大厅 / 搜索、收藏与最近玩过</p></figcaption></figure>
      <figure class="device"><div class="frame"><img src="${tablet}" alt="平板横屏小兔闯关"></div><figcaption><h2>平板 · 一起翻牌闯关</h2><p>小兔闯关 / 2–4 人同屏与电脑对手</p></figcaption></figure>
      <figure class="device phone"><div class="frame"><img src="${phone}" alt="手机竖屏移车出库"></div><figcaption><h2>手机 · 解一道谜题</h2><p>移车出库 / 24 个关卡</p></figcaption></figure>
    </div><footer><strong>同一个玩具箱，不同的开局方式。</strong><span>实际页面 · 浏览器视口模拟</span></footer></main>`);

  await render('toy2game-social', 1280, 640, `<main class="social">${brand}
    <div class="intro"><p>把实物玩具，变成打开即玩的 3D 网页游戏。</p></div>
    <div class="grid">${games(true)}</div>
    <footer><strong>免费游玩 · 触控友好 · 纯静态部署</strong><span>github.com/asmoyou/toy2game</span></footer></main>`);
  await writeFile(`${artifacts}checks.json`, `${JSON.stringify(checks, null, 2)}\n`);
} finally {
  await browser.close();
}
