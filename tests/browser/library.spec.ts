import { test, expect } from '@playwright/test';

test('library renders real covers, searches, filters, sorts and handles no results', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  await expect(page.locator('.game-card')).toHaveCount(2);
  for (const image of await page.locator('.game-image img').all()) {
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 500)).toBe(true);
  }
  expect(requests.filter(url => /\/games\/.*\.(js|ts|tsx)/.test(url))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/library-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '策略棋盘', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.game-card')).toHaveAttribute('data-game', 'rabbit-trap');
  await page.getByRole('button', { name: /全部游戏/ }).click();
  await page.getByRole('searchbox', { name: '搜索游戏' }).fill('企鹅');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('企鹅');
  await page.getByRole('searchbox').fill('不存在的游戏');
  await expect(page.getByRole('heading', { name: '没有找到这个游戏' })).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.locator('.game-card')).toHaveCount(2);
  await page.getByRole('combobox', { name: '游戏排序' }).selectOption('title');
  await expect(page).toHaveURL(/sort=title/);
  expect(errors).toEqual([]);
});

test('favorites persist and remain independent from recently played games', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '我的收藏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有收藏的游戏' })).toBeVisible();
  await page.getByRole('button', { name: '逛逛游戏大厅' }).click();
  await page.getByRole('button', { name: '收藏企鹅敲敲敲', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '取消收藏企鹅敲敲敲' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /我的收藏/ }).click();
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.getByRole('button', { name: '最近玩过' }).click();
  await expect(page.getByRole('heading', { name: '第一局，从这里开始' })).toBeVisible();
  await page.getByRole('button', { name: /我的收藏/ }).click();
  await page.getByRole('button', { name: '取消收藏企鹅敲敲敲' }).click();
  await expect(page.locator('.game-card')).toHaveCount(0);
});

test('invalid local storage does not prevent opening the library', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('toy2game-library-v1', '{invalid'));
  await page.goto('./');
  await expect(page.locator('.game-card')).toHaveCount(2);
});

test('random play opens a registered game', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '随便玩一个' }).click();
  await expect(page).toHaveURL(/\/games\/(penguin-ice|rabbit-trap)\/$/);
  await expect(page.getByRole('link', { name: '返回游戏大厅' })).toBeVisible();
});
