import test from 'node:test';
import assert from 'node:assert/strict';
import { registry, validateRegistry } from '../scripts/catalog.mjs';
import { discoveryFiles, metadataTags, resolveSite, structuredData } from '../scripts/seo.mjs';

test('canonical URLs, sitemap and discovery links share the configured origin and path prefix', () => {
  const config = resolveSite({ origin: 'https://games.example/', base: '/toybox' });
  const files = discoveryFiles(registry, config);
  const pages = [undefined, ...registry];
  for (const game of pages) {
    const canonical = `https://games.example/toybox/${game ? `games/${game.id}/` : ''}`;
    const tags = metadataTags(registry, config, game);
    assert.equal(tags.find(tag => tag.attrs?.rel === 'canonical').attrs.href, canonical);
    assert.equal(tags.find(tag => tag.attrs?.property === 'og:url').attrs.content, canonical);
    assert.ok(tags.find(tag => tag.attrs?.property === 'og:image').attrs.content.startsWith('https://games.example/toybox/images/'));
    assert.ok(files.get('sitemap.xml').includes(`<loc>${canonical}</loc>`));
    assert.ok(files.get('llms.txt').includes(canonical));
    const markdown = tags.find(tag => tag.attrs?.type === 'text/markdown').attrs.href.slice(config.base.length);
    assert.ok(files.has(markdown));
  }
  assert.match(files.get('robots.txt'), /Sitemap: https:\/\/games.example\/toybox\/sitemap.xml/);
  assert.equal((files.get('sitemap.xml').match(/<url>/g) ?? []).length, registry.length + 1);
  assert.doesNotMatch(files.get('sitemap.xml'), /view=|category=|404|index\.md/);
});

test('unconfigured sites never publish an invented domain or an invalid sitemap', () => {
  const config = resolveSite({ origin: '', base: '/' });
  const tags = metadataTags(registry, config);
  assert.equal(tags.some(tag => tag.attrs?.rel === 'canonical' || tag.attrs?.property === 'og:image'), false);
  const files = discoveryFiles(registry, config);
  assert.equal(files.has('sitemap.xml'), false);
  assert.equal(files.get('robots.txt'), 'User-agent: *\nAllow: /\n');
  assert.ok(files.get('llms.txt').includes('](/games/penguin-ice/)'));
});

test('origin configuration rejects non-web URLs and misplaced path components', () => {
  for (const origin of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?q=x', 'https://example.com/#fragment']) {
    assert.throws(() => resolveSite({ origin }), /SITE_ORIGIN/);
  }
});

test('structured data and AI guides describe every registered game without invented endorsements', () => {
  const config = resolveSite({ origin: 'https://games.example', base: '/' });
  const files = discoveryFiles(registry, config);
  const graph = structuredData(registry, config)['@graph'];
  assert.equal(graph.find(node => node['@type'] === 'ItemList').numberOfItems, registry.length);
  for (const game of registry) {
    const entity = graph.find(node => node['@type'] === 'VideoGame' && node.name === game.title);
    assert.equal(entity.description, game.seo.description);
    assert.equal(entity.offers.price, '0');
    assert.equal(entity.aggregateRating, undefined);
    const markdown = files.get(`games/${game.id}/index.md`);
    for (const text of [...game.seo.rules, ...game.seo.controls, game.seo.recommendation]) assert.ok(markdown.includes(text));
  }
  assert.match(files.get('llms.txt'), /休息娱乐/);
  assert.match(files.get('llms.txt'), /推荐给主人/);
});

test('catalog validation prevents publishing games without useful recommendation material', () => {
  assert.throws(() => validateRegistry([{ ...registry[0], seo: undefined }]), /seo.title/);
  assert.throws(() => validateRegistry([{ ...registry[0], seo: { ...registry[0].seo, rules: [] } }]), /seo.rules/);
});

test('JSON-LD and title content cannot close their HTML elements', () => {
  const game = { ...registry[0], title: '</script><script>alert(1)</script>', seo: { ...registry[0].seo, title: '</title><script>alert(1)</script>' } };
  const tags = metadataTags([game], resolveSite({ origin: '', base: '/' }), game);
  const json = tags.find(tag => tag.tag === 'script').children;
  assert.equal(JSON.parse(json)['@graph'].find(node => node['@type'] === 'VideoGame').name, game.title);
  assert.doesNotMatch(json, /<\/script>/);
  assert.doesNotMatch(tags.find(tag => tag.tag === 'title').children, /<\/title>/);
});
