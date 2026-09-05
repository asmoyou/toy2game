import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

for (const game of [
  { id: 'penguin-ice', title: '企鹅敲敲敲', canvas: '#scene canvas', control: '游戏设置' },
  { id: 'rabbit-trap', title: '小兔闯关', canvas: '.scene-host canvas', control: '游戏规则' },
]) {
  test(`${game.id} loads its nested assets, renders a moving scene and returns to the library`, async ({ page }, info) => {
    const errors: string[] = [];
    const failed: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(new URL(info.project.use.baseURL!).origin)) failed.push(response.url()); });
    await page.goto('./');
    await page.getByRole('link', { name: `开始玩${game.title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/games/${game.id}/$`));
    await expect(page.locator(game.canvas)).toBeVisible();
    await expect(page.locator('#loading, .scene-loading')).toHaveCount(0);
    await page.waitForTimeout(1200);
    const canvas = PNG.sync.read(await page.locator(game.canvas).screenshot());
    const colors = new Set();
    for (let y = 0; y < canvas.height; y += 5) for (let x = 0; x < canvas.width; x += 5) {
      const offset = (y * canvas.width + x) * 4;
      colors.add(`${canvas.data[offset] >> 3},${canvas.data[offset + 1] >> 3},${canvas.data[offset + 2] >> 3}`);
    }
    expect(colors.size).toBeGreaterThan(80);
    const before = await page.locator(game.canvas).screenshot();
    if (game.id === 'penguin-ice') await page.getByRole('button', { name: '向右旋转视角' }).click();
    else await page.getByRole('button', { name: '抽一张卡牌' }).click();
    await page.waitForTimeout(700);
    expect(Buffer.compare(before, await page.locator(game.canvas).screenshot())).not.toBe(0);
    await page.getByRole('button', { name: game.control, exact: true }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('dialog[open]').getByRole('button', { name: game.id === 'penguin-ice' ? '关闭设置' : '关闭', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/${game.id}-${info.project.name}.png`, fullPage: true });
    await page.reload();
    await expect(page.locator(game.canvas)).toBeVisible();
    await page.getByRole('link', { name: '返回游戏大厅' }).click();
    await page.getByRole('button', { name: '最近玩过' }).click();
    await expect(page.locator('.game-card')).toHaveCount(1);
    await expect(page.locator('.game-card')).toHaveAttribute('data-game', game.id);
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  });
}

test('unknown games return an actual 404', async ({ request }) => {
  const response = await request.get('games/does-not-exist/');
  expect(response.status()).toBe(404);
});
