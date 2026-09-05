import { readFile } from 'node:fs/promises';
import { loadGames, root } from './catalog.mjs';
import { run } from './processes.mjs';

const url = process.env.SITE_URL ?? 'http://localhost:5173/';
for (const game of await loadGames()) {
  const manifest = JSON.parse(await readFile(`${root}games/${game.id}/package.json`, 'utf8'));
  const script = manifest.scripts['test:browser'] ? 'test:browser' : manifest.scripts['test:e2e'] ? 'test:e2e' : null;
  if (!script) continue;
  await run('npm', ['run', script, '--workspace', `games/${game.id}`], {
    env: { ...process.env, GAME_URL: new URL(`games/${game.id}/`, url).href },
  });
}
