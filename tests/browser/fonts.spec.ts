import { test, expect } from '@playwright/test';
import games from '../../packages/catalog/games.json' with { type: 'json' };

for (const entry of [{ id: 'library', path: './' }, ...games.map(game => ({ id: game.id, path: `games/${game.id}/` }))]) {
  test(`${entry.id} serves its Chinese font and license locally`, async ({ page, request }) => {
    const fonts: string[] = [];
    page.on('request', item => { if (item.resourceType() === 'font') fonts.push(item.url()); });
    await page.goto(entry.path);
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => ({
      family: getComputedStyle(document.body).fontFamily,
      loaded: [...document.fonts].some(font => font.family.includes('Noto Sans SC Variable') && font.status === 'loaded'),
    }));
    expect(state.family).toContain('Noto Sans SC Variable');
    expect(state.loaded).toBe(true);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    const license = await request.get(new URL('fonts/noto-sans-sc-OFL.txt', page.url()).href);
    expect(license.ok()).toBe(true);
    expect(await license.text()).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
}
