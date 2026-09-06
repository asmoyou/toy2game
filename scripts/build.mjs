import { cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadGames, root, siteBase } from './catalog.mjs';
import { run } from './processes.mjs';
import { resolveSite } from './seo.mjs';
import { prerenderLibrary } from './prerender.mjs';

const games = await loadGames({ checkCovers: true });
const base = siteBase();
const site = resolveSite({ base });
// Prerendering creates a Vite dev server, so child builds need an explicit production environment.
const buildOptions = { env: { ...process.env, NODE_ENV: 'production' } };
if (!site.origin) console.warn('SITE_ORIGIN is unset: canonical URLs, absolute social images and sitemap.xml will be omitted. Set the public origin before publishing.');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await run('npm', ['run', 'build', '--workspace', 'apps/web', '--', '--base', base], buildOptions);
await cp(path.join(root, 'apps/web/dist'), dist, { recursive: true });
await prerenderLibrary(dist, base);
for (const game of games) {
  await run('npm', ['run', 'build', '--workspace', `games/${game.id}`, '--', '--base', `${base}games/${game.id}/`], buildOptions);
  const destination = path.join(dist, 'games', game.id);
  await mkdir(destination, { recursive: true });
  await cp(path.join(root, 'games', game.id, 'dist'), destination, { recursive: true });
}
console.log(`\nBuilt ${games.length} games and the library into dist/ (base: ${base}).`);
