import { cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadGames, root, siteBase } from './catalog.mjs';
import { run } from './processes.mjs';

const games = await loadGames({ checkCovers: true });
const base = siteBase();
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await run('npm', ['run', 'build', '--workspace', 'apps/web', '--', '--base', base]);
await cp(path.join(root, 'apps/web/dist'), dist, { recursive: true });
for (const game of games) {
  await run('npm', ['run', 'build', '--workspace', `games/${game.id}`, '--', '--base', `${base}games/${game.id}/`]);
  const destination = path.join(dist, 'games', game.id);
  await mkdir(destination, { recursive: true });
  await cp(path.join(root, 'games', game.id, 'dist'), destination, { recursive: true });
}
console.log(`\nBuilt ${games.length} games and the library into dist/ (base: ${base}).`);
