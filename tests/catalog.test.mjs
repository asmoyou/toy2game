import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGames, registry, siteBase, validateRegistry } from '../scripts/catalog.mjs';

test('every registered game has source, build scripts, and a cover', async () => {
  assert.equal((await loadGames({ checkCovers: true })).length, registry.length);
});

test('rejects duplicate or unsafe paths before running game scripts', () => {
  assert.throws(() => validateRegistry([registry[0], registry[0]]), /duplicate/);
  assert.throws(() => validateRegistry([{ ...registry[0], id: '../outside' }]), /Invalid/);
  assert.throws(() => validateRegistry([{ ...registry[0], cover: '../../outside.png' }]), /cover path/);
  assert.throws(() => validateRegistry([{ ...registry[0], category: 'missing' }]), /category/);
});

test('normalizes deployment prefixes without accepting unsafe URLs', () => {
  assert.equal(siteBase('/'), '/');
  assert.equal(siteBase('/toy2game'), '/toy2game/');
  assert.throws(() => siteBase('https://example.com'), /absolute URL path/);
  assert.throws(() => siteBase('/../'), /absolute URL path/);
});
