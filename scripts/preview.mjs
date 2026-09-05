import { preview } from 'vite';
import { access } from 'node:fs/promises';
import { root, siteBase } from './catalog.mjs';

await access(`${root}dist/index.html`);
const server = await preview({
  configFile: false,
  root,
  base: siteBase(),
  appType: 'mpa',
  build: { outDir: 'dist' },
  preview: { host: '0.0.0.0', port: Number(process.env.PORT ?? 4173) },
});
server.printUrls();
