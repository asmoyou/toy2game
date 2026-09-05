import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const registry = JSON.parse(await readFile(new URL('../packages/catalog/games.json', import.meta.url), 'utf8'));

export function validateRegistry(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('The game registry must contain games.');
  const ids = new Set();
  for (const game of entries) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(game.id) || ids.has(game.id)) {
      throw new Error(`Invalid or duplicate game id: ${game.id}`);
    }
    ids.add(game.id);
    for (const field of ['title', 'englishTitle', 'description', 'players', 'duration']) {
      if (typeof game[field] !== 'string' || !game[field].trim()) throw new Error(`${game.id}: missing ${field}`);
    }
    if (!['party', 'strategy'].includes(game.category)) throw new Error(`${game.id}: unknown category`);
    if (!['ice', 'garden'].includes(game.color)) throw new Error(`${game.id}: unknown cover color`);
    if (!Array.isArray(game.tags) || !game.tags.every(tag => typeof tag === 'string')) throw new Error(`${game.id}: invalid tags`);
    if (!/^images\/[a-z0-9-]+\.(png|webp|jpg)$/.test(game.cover)) throw new Error(`${game.id}: invalid cover path`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(game.addedAt) || !Number.isFinite(Date.parse(game.addedAt))) throw new Error(`${game.id}: invalid date`);
    for (const field of ['title', 'description', 'recommendation']) {
      if (typeof game.seo?.[field] !== 'string' || !game.seo[field].trim()) throw new Error(`${game.id}: missing seo.${field}`);
    }
    for (const field of ['rules', 'controls']) {
      if (!Array.isArray(game.seo?.[field]) || !game.seo[field].length || !game.seo[field].every(value => typeof value === 'string' && value.trim())) {
        throw new Error(`${game.id}: invalid seo.${field}`);
      }
    }
  }
  return entries;
}

export async function loadGames({ checkCovers = false } = {}) {
  validateRegistry(registry);
  for (const game of registry) {
    const directory = path.join(root, 'games', game.id);
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (!manifest.scripts?.dev || !manifest.scripts?.build) throw new Error(`${game.id}: dev and build scripts are required`);
    await access(path.join(directory, 'index.html'));
    if (checkCovers) await access(path.join(root, 'apps/web/public', game.cover));
  }
  return registry;
}

export function siteBase(value = process.env.SITE_BASE ?? '/') {
  if (!value.startsWith('/') || value.includes('..') || /[?#\\\s]/.test(value)) throw new Error('SITE_BASE must be an absolute URL path, e.g. /toy2game/');
  return value.endsWith('/') ? value : `${value}/`;
}
