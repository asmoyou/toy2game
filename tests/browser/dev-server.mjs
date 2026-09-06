import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { registry } from '../../scripts/catalog.mjs';

const base = new URL(process.env.SITE_URL ?? 'http://localhost:5173/');
const statusUrl = new URL('__toy2game/status', base);
const initial = await (await fetch(statusUrl)).json();
assert.equal(initial.ready, true);
assert.deepEqual(initial.games, registry.map(game => game.id));
const repeat = await promisify(execFile)('npm', ['run', 'dev'], { env: { ...process.env, PORT: base.port, SITE_BASE: base.pathname }, timeout: 10000 });
assert.match(repeat.stdout, /already running/);
assert.equal((await (await fetch(statusUrl)).json()).pid, initial.pid);

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
try {
  for (const game of [null, ...registry]) {
    const page = await browser.newPage();
    const failures = [], connected = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base.origin)) failures.push(response.url()); });
    page.on('websocket', socket => {
      assert.equal(new URL(socket.url()).port, base.port, 'HMR must use the same listening port');
      socket.on('framereceived', ({ payload }) => { if (JSON.parse(String(payload)).type === 'connected') connected.push(socket.url()); });
    });
    try {
      const url = new URL(game ? `games/${game.id}/` : './', base);
      await page.goto(url.href);
      await expect.poll(() => connected.length).toBe(1);
      if (game) await expect(page.getByRole('link', { name: '返回游戏大厅', exact: true })).toBeVisible();
      else await expect(page.locator('.game-card')).toHaveCount(registry.length);
      const icon = await page.locator('link[rel="icon"]').getAttribute('href');
      assert.equal((await page.request.get(new URL(icon, url).href)).status(), 200);
      assert.deepEqual(failures, []);
      console.log(`PASS single-port page and HMR: ${game?.id ?? 'library'}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
assert.equal((await fetch(new URL('games/does-not-exist/', base))).status, 404);
console.log('PASS repeated startup reuses the existing process');
