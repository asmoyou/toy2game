import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import parkingLevels from '../../games/parking-escape/src/levels.json' with { type: 'json' };

for (const game of [
  { id: 'flip-match', title: '翻棋对对碰', canvas: '#match-scene canvas', control: '游戏规则', action: '向右旋转视角', close: '关闭规则', debug: '__flip' },
  { id: 'frog-feast', title: '青蛙吃豆豆', canvas: '#frog-scene canvas', control: '游戏规则', action: '向右旋转视角', close: '关闭规则', debug: '__frog' },
  { id: 'penguin-ice', title: '企鹅敲敲敲', canvas: '#scene canvas', control: '游戏设置', action: '向右旋转视角', close: '关闭设置', debug: '__iceGame' },
  { id: 'rabbit-trap', title: '小兔闯关', canvas: '.scene-host canvas', control: '游戏规则', action: '抽一张卡牌', close: '关闭', debug: '__rabbit' },
  { id: 'balance-astronaut', title: '平衡太空人', canvas: '#space-scene canvas', control: '游戏规则', action: '向右旋转视角', close: '关闭规则', debug: '__balance' },
  { id: 'parking-escape', title: '益智移车出库', canvas: '#parking-scene canvas', control: '游戏规则', action: '向右旋转视角', close: '关闭规则', debug: '__parking' },
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
    expect(await page.evaluate(key => key in window, game.debug)).toBe(false);
    await page.waitForTimeout(1200);
    const canvas = PNG.sync.read(await page.locator(game.canvas).screenshot());
    const colors = new Set();
    for (let y = 0; y < canvas.height; y += 5) for (let x = 0; x < canvas.width; x += 5) {
      const offset = (y * canvas.width + x) * 4;
      colors.add(`${canvas.data[offset] >> 3},${canvas.data[offset + 1] >> 3},${canvas.data[offset + 2] >> 3}`);
    }
    expect(colors.size).toBeGreaterThan(80);
    const before = await page.locator(game.canvas).screenshot();
    await page.getByRole('button', { name: game.action }).click();
    await page.waitForTimeout(700);
    expect(Buffer.compare(before, await page.locator(game.canvas).screenshot())).not.toBe(0);
    await page.getByRole('button', { name: game.control, exact: true }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('dialog[open]').getByRole('button', { name: game.close, exact: true }).click();
    if (game.id === 'flip-match') {
      await expect(page.locator('[data-player="1"]')).toContainText('普通机器人');
      await page.getByRole('button', { name: '游戏设置', exact: true }).click();
      const difficulty = page.getByRole('combobox', { name: '机器人难度' });
      await expect(difficulty).toHaveValue('normal');
      await difficulty.selectOption('perfect');
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
      await expect(page.locator('[data-player="1"]')).toContainText('普通机器人');
      await page.getByRole('button', { name: '游戏设置', exact: true }).click();
      await difficulty.selectOption('hard');
      await page.getByRole('button', { name: '按此设置开始新局', exact: true }).click();
      await expect(page.locator('[data-player="1"]')).toContainText('困难机器人');
      await page.getByRole('button', { name: '棋子列表', exact: true }).click();
      await page.getByRole('button', { name: '第 1 枚，背面', exact: true }).click();
      await expect(page.locator('#reveal-0 img')).toBeVisible();
      const first = await page.locator('#reveal-0 img').getAttribute('alt');
      await page.getByRole('button', { name: '新的一局', exact: true }).click();
      await page.getByRole('button', { name: '继续这局', exact: true }).click();
      await expect(page.locator('#reveal-0 img')).toHaveAttribute('alt', first!);
      await page.reload();
      await expect(page.locator('#reveal-0 img')).toHaveAttribute('alt', first!);
      await page.getByRole('button', { name: '棋子列表', exact: true }).click();
      await page.getByRole('button', { name: '第 2 枚，背面', exact: true }).click();
      await expect(page.locator('#attempt-count')).toHaveText('01');
      await page.getByRole('button', { name: '新的一局', exact: true }).click();
      await page.getByRole('button', { name: '重新开局', exact: true }).click();
      await expect(page.locator('#attempt-count')).toHaveText('00');
      await expect(page.locator('#matched-count')).toHaveText('00');
      await page.reload();
      await expect(page.locator('[data-player="1"]')).toContainText('困难机器人');
    }
    if (game.id === 'frog-feast') {
      await expect(page.locator('#remaining-count')).toHaveText('60');
      await page.getByRole('button', { name: '开始抢豆', exact: true }).click();
      await expect(page.locator('#countdown-state')).toBeHidden();
      await page.keyboard.down('a');
      await expect(page.locator('#score-0')).not.toHaveText('0');
      await page.keyboard.up('a');
      await page.getByRole('button', { name: '新的一局', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '重新开始这一局？' })).toBeVisible();
      const score = await page.locator('#score-0').textContent();
      await page.getByRole('button', { name: '继续这局', exact: true }).click();
      await expect(page.locator('#score-0')).toHaveText(score!);
      await page.getByRole('button', { name: '新的一局', exact: true }).click();
      await page.getByRole('button', { name: '重新开局', exact: true }).click();
      await expect(page.locator('#remaining-count')).toHaveText('60');
      await expect(page.getByRole('button', { name: '开始抢豆', exact: true })).toBeEnabled();
    }
    if (game.id === 'rabbit-trap') {
      const card = page.locator('.playing-card');
      const cardLabel = await card.getAttribute('aria-label');
      await page.getByRole('button', { name: '游戏设置', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '游戏设置', exact: true })).toBeVisible();
      await page.getByRole('group', { name: '玩家人数', exact: true }).getByRole('button', { name: '4 人', exact: true }).click();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(card).toHaveAttribute('aria-label', cardLabel!);
      await page.getByRole('button', { name: '新的一局', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '重新开始这一局？' })).toBeVisible();
      await page.getByRole('button', { name: '继续这局', exact: true }).click();
      await expect(card).toHaveAttribute('aria-label', cardLabel!);
      await page.getByRole('button', { name: '新的一局', exact: true }).click();
      await page.getByRole('button', { name: '重新开局', exact: true }).click();
      await expect(page.getByRole('button', { name: '抽一张卡牌', exact: true })).toBeEnabled();
    }
    if (game.id === 'balance-astronaut') {
      await expect(page.locator('#crew-count')).toHaveText('00');
      await page.getByRole('button', { name: '停靠位列表', exact: true }).click();
      await page.getByRole('button', { name: '35 号停靠位', exact: true }).click();
      await expect(page.locator('#crew-count')).toHaveText('01');
      await expect(page.getByRole('button', { name: '放置太空人', exact: true })).toHaveCount(0);
      await expect(page.locator('#movement-state')).toContainText('观察平衡');
      await expect(page.locator('#movement-state')).toHaveText('已等 8 秒，继续回合');
      await expect(page.locator('#crew-count')).toHaveText('02');
      await expect(page.getByRole('button', { name: '停靠位列表', exact: true })).toBeEnabled();
    }
    if (game.id === 'parking-escape') {
      await expect(page.locator('#move-count')).toHaveText('00');
      if (await page.evaluate(() => document.fullscreenEnabled)) {
        await page.getByRole('button', { name: '进入全屏' }).click();
        await expect(page.getByRole('button', { name: '退出全屏' })).toHaveAttribute('data-tooltip', '退出全屏');
        await page.getByRole('button', { name: '退出全屏' }).click();
        await expect(page.getByRole('button', { name: '进入全屏' })).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('#move-count')).toHaveText('00');
      }
      await page.getByRole('button', { name: '提示', exact: true }).click();
      await page.getByRole('button', { name: '执行提示这一步' }).click();
      await expect(page.locator('#move-count')).toHaveText('01');
      await page.getByRole('button', { name: '撤销一步' }).click();
      await expect(page.locator('#move-count')).toHaveText('00');
      await page.getByRole('button', { name: '重做一步' }).click();
      await expect(page.locator('#move-count')).toHaveText('01');
      await page.getByRole('button', { name: '新的一局' }).click();
      await page.getByRole('button', { name: '继续这局' }).click();
      await expect(page.locator('#move-count')).toHaveText('01');
      const last = parkingLevels.at(-1)!;
      await page.getByRole('button', { name: '游戏设置' }).click();
      await page.getByRole('button', { name: '出库高手', exact: true }).click();
      await page.getByRole('button', { name: `第 ${last.id} 关 ${last.name}`, exact: true }).click();
      await page.getByRole('button', { name: '按此关卡开始新局' }).click();
      await expect(page.locator('#level-number')).toHaveText(`第 ${last.id} 关`);
      await expect(page.locator('#minimum')).toHaveText(String(last.minimum));
      await expect(page.locator('#move-count')).toHaveText('00');
      await page.getByRole('button', { name: '提示', exact: true }).click();
      await page.getByRole('button', { name: '执行提示这一步' }).click();
      await expect(page.locator('#move-count')).toHaveText('01');
      await page.reload();
      await expect(page.locator('#level-number')).toHaveText(`第 ${last.id} 关`);
      await expect(page.locator('#move-count')).toHaveText('01');
    }
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
