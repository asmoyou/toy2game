import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { loadGames, root, siteBase } from './catalog.mjs';

const games = await loadGames();
const base = siteBase();
const port = Number(process.env.PORT ?? 5173);
const statusPath = `${base}__toy2game/status`;
const applications = [];
let ready = false;
let stopping = false;

try {
  const response = await fetch(`http://127.0.0.1:${port}${statusPath}`, { signal: AbortSignal.timeout(700) });
  const status = await response.json();
  if (status.root === root) {
    console.log(`Toy2Game is already running at http://localhost:${port}${base}`);
    process.exit(0);
  }
} catch { /* No existing instance of this workspace was found. */ }

const http = createHttpServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === statusPath) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ root, port, pid: process.pid, ready, games: games.map(game => game.id) }));
    return;
  }
  if (!ready) { response.writeHead(503); response.end('Preparing Toy2Game'); return; }
  const app = applications.find(app => pathname.startsWith(app.base) || pathname === app.base.slice(0, -1));
  if (!app) { response.writeHead(404); response.end('Not found'); return; }
  if (app.base !== '/' && pathname === app.base.slice(0, -1)) {
    response.writeHead(302, { Location: `${app.base}${new URL(request.url, 'http://localhost').search}` });
    response.end(); return;
  }
  app.server.middlewares(request, response, () => { response.writeHead(404); response.end('Not found'); });
});

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const app of applications) await app.server.close();
  http.closeAllConnections();
  if (http.listening) await new Promise(resolve => http.close(resolve));
  process.exit(code);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  await new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, '0.0.0.0', resolve);
  });
  // Every Vite application shares the HTTP listener and uses its own HMR path.
  for (const app of [
    ...games.map(game => ({ directory: `games/${game.id}`, base: `${base}games/${game.id}/` })),
    { directory: 'apps/web', base },
  ]) {
    const server = await createServer({
      root: `${root}${app.directory}`,
      base: app.base,
      appType: 'mpa',
      server: { middlewareMode: true, hmr: { server: http, path: '__vite_hmr' } },
    });
    applications.push({ ...app, server });
  }
  ready = true;
  console.log(`Toy2Game: http://localhost:${port}${base} (${games.length} games, one listening port)`);
  for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
    if (address.family === 'IPv4' && !address.internal) console.log(`Network: http://${address.address}:${port}${base}`);
  }
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied. Reuse the existing service or stop its owning project before starting.` : error);
  await stop(1);
}
