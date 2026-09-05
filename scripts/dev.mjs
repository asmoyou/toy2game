import { createServer } from 'vite';
import { loadGames, root, siteBase } from './catalog.mjs';
import { freePort, start } from './processes.mjs';

const games = await loadGames();
const base = siteBase();
const port = await freePort(Number(process.env.PORT ?? 5173));
const children = [];
let web;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* The process may already have exited. */ }
    }
  }
  await web?.close();
  process.exit(code);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  const proxy = {};
  let nextPort = port + 1;
  for (const game of games) {
    const gamePort = await freePort(nextPort);
    nextPort = gamePort + 1;
    const gameBase = `${base}games/${game.id}/`;
    const child = start('npm', ['run', 'dev', '--workspace', `games/${game.id}`, '--', '--port', String(gamePort), '--strictPort', '--base', gameBase], { detached: true });
    children.push(child);
    child.once('error', error => { console.error(error); void stop(1); });
    child.once('exit', code => { if (!stopping) void stop(code || 1); });
    proxy[`${base}games/${game.id}`] = { target: `http://127.0.0.1:${gamePort}`, ws: true };
  }
  web = await createServer({
    root: `${root}apps/web`,
    base,
    server: { host: '0.0.0.0', port, strictPort: true, proxy },
  });
  await web.listen();
  console.log('\nToy2Game game library');
  web.printUrls();
} catch (error) {
  console.error(error);
  await stop(1);
}
