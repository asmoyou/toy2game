import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './catalog.mjs';

export async function prerenderLibrary(dist, base) {
  const server = await createServer({
    root: path.join(root, 'apps/web'),
    base,
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  });
  try {
    const { render } = await server.ssrLoadModule('/src/entry-server.tsx');
    const filename = path.join(dist, 'index.html');
    const html = await readFile(filename, 'utf8');
    const placeholder = '<div id="root"></div>';
    if (!html.includes(placeholder)) throw new Error('Library prerender placeholder is missing.');
    await writeFile(filename, html.replace(placeholder, () => `<div id="root">${render()}</div>`));
  } finally {
    await server.close();
  }
}
