import { test, expect } from '@playwright/test';
import games from '../../packages/catalog/games.json' with { type: 'json' };
import site from '../../packages/catalog/site.json' with { type: 'json' };

test('initial HTML contains unique metadata, crawlable game content and discoverable text guides', async ({ page, request }) => {
  const titles = new Set<string>();
  const origin = process.env.SITE_ORIGIN ?? site.origin;
  const base = new URL(test.info().project.use.baseURL!).pathname;
  for (const game of [undefined, ...games]) {
    const pathname = game ? `games/${game.id}/` : './';
    const response = await request.get(pathname);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const head = await page.evaluate(source => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      return {
        title: doc.title,
        titleCount: doc.querySelectorAll('title').length,
        description: doc.querySelector('meta[name="description"]')?.getAttribute('content'),
        descriptionCount: doc.querySelectorAll('meta[name="description"]').length,
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        markdown: doc.querySelector('link[type="text/markdown"]')?.getAttribute('href'),
        schema: JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!),
        text: doc.body.textContent,
        links: Array.from(doc.querySelectorAll('a[href]'), link => link.getAttribute('href')),
        imagePreloads: Array.from(doc.querySelectorAll('link[rel="preload"][as="image"]'), link => link.getAttribute('href')),
      };
    }, html);
    expect(head.titleCount).toBe(1);
    expect(head.descriptionCount).toBe(1);
    expect(head.title).toBe(game?.seo.title ?? site.title);
    expect(head.description).toBe(game?.seo.description ?? site.description);
    titles.add(head.title);
    expect(head.schema['@graph'].some((node: { '@type': string }) => node['@type'] === (game ? 'VideoGame' : 'ItemList'))).toBe(true);
    expect(head.text).toContain(game?.title ?? site.invitationTitle);
    const guide = await request.get(head.markdown!);
    expect(guide.status()).toBe(200);
    expect(await guide.text()).toContain(game?.seo.recommendation ?? site.description);
    if (!game) for (const entry of games) expect(head.links.some(link => link?.endsWith(`/games/${entry.id}/`))).toBe(true);
    if (!game) {
      expect(head.imagePreloads).toHaveLength(Math.min(3, games.length));
      expect(head.imagePreloads).toEqual(games.slice(0, 3).map(entry => `${base}${entry.cover}`));
    }
    if (origin) expect(head.canonical).toBe(`${new URL(origin).origin}${base}${game ? `games/${game.id}/` : ''}`);
    if (head.canonical) {
      expect(new URL(head.canonical).search).toBe('');
      const sitemap = await request.get('sitemap.xml');
      expect(sitemap.status()).toBe(200);
      expect(await sitemap.text()).toContain(`<loc>${head.canonical}</loc>`);
    }
  }
  expect(titles.size).toBe(games.length + 1);
  const robots = await request.get('robots.txt');
  expect(await robots.text()).toContain('Allow: /');
  const llms = await request.get('llms.txt');
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain(site.invitation);
});

test('visitors without JavaScript can read the library, follow game links and view the game summary', async ({ browser }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: info.project.use.viewport });
  const page = await context.newPage();
  try {
    await page.goto(info.project.use.baseURL!);
    await expect(page.locator('.game-card')).toHaveCount(games.length);
    await expect(page.getByRole('heading', { name: site.invitationTitle })).toBeVisible();
    for (const game of games) {
      await page.goto(new URL(`games/${game.id}/`, info.project.use.baseURL!).href);
      await expect(page.getByRole('heading', { name: game.title, exact: true })).toBeVisible();
      await expect(page.locator('#game-summary')).toContainText(game.seo.rules[0]);
      const image = page.locator('#game-summary img');
      await expect(image).toBeVisible();
      expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('hydration preserves saved filters and favorites without replacing the default SEO title', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./?view=favorites&q=企鹅&sort=title');
  await expect(page.getByRole('searchbox')).toHaveValue('企鹅');
  await expect(page.getByRole('combobox', { name: '游戏排序' })).toHaveValue('title');
  await expect(page.getByRole('button', { name: '我的收藏', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/view=favorites&q=.*&sort=title/);
  await page.getByRole('button', { name: '游戏大厅', exact: true }).click();
  await expect(page).toHaveTitle(site.title);
  await expect(page.locator('.game-card')).toHaveCount(games.length);
  expect(errors).toEqual([]);
});
