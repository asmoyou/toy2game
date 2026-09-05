import { readFile } from 'node:fs/promises';
import { registry, siteBase, validateRegistry } from './catalog.mjs';

export const site = JSON.parse(await readFile(new URL('../packages/catalog/site.json', import.meta.url), 'utf8'));
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

export function resolveSite({ origin = process.env.SITE_ORIGIN ?? site.origin, base = siteBase() } = {}) {
  if (origin) {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('SITE_ORIGIN must be an HTTP(S) origin without a path, credentials, query or hash. Use SITE_BASE for a path prefix.');
    }
    origin = url.origin;
  }
  return { origin, base: siteBase(base) };
}

function siteUrl(config, pathname = '') {
  return `${config.origin}${config.base}${pathname}`;
}

function gameSchema(game, config) {
  const url = siteUrl(config, `games/${game.id}/`);
  return {
    '@type': 'VideoGame',
    '@id': `${url}#game`,
    name: game.title,
    alternateName: game.englishTitle,
    description: game.seo.description,
    url,
    image: siteUrl(config, game.cover),
    inLanguage: 'zh-CN',
    genre: game.tags,
    applicationCategory: 'GameApplication',
    gamePlatform: 'Web browser',
    operatingSystem: 'Any operating system with a WebGL-capable browser',
    numberOfPlayers: { '@type': 'QuantitativeValue', value: game.players },
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY', url },
    mainEntityOfPage: { '@id': `${url}#webpage` },
  };
}

export function structuredData(games, config, game) {
  const home = siteUrl(config);
  const url = game ? siteUrl(config, `games/${game.id}/`) : home;
  const graph = [
    { '@type': 'WebSite', '@id': `${home}#website`, name: site.name, alternateName: 'Toy2Game 在线玩具箱', url: home, description: site.description, inLanguage: 'zh-CN' },
    {
      '@type': game ? 'WebPage' : 'CollectionPage',
      '@id': `${url}#webpage`,
      url,
      name: game?.seo.title ?? site.title,
      description: game?.seo.description ?? site.description,
      inLanguage: 'zh-CN',
      isPartOf: { '@id': `${home}#website` },
      mainEntity: { '@id': game ? `${url}#game` : `${home}#games` },
      ...(game ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    },
  ];
  if (game) {
    graph.push(gameSchema(game, config), {
      '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '游戏大厅', item: home },
        { '@type': 'ListItem', position: 2, name: game.title, item: url },
      ],
    });
  } else {
    graph.push({
      '@type': 'ItemList', '@id': `${home}#games`, name: 'Toy2Game 免费在线游戏', numberOfItems: games.length,
      itemListElement: games.map((entry, index) => ({ '@type': 'ListItem', position: index + 1, item: { '@id': `${siteUrl(config, `games/${entry.id}/`)}#game` } })),
    }, ...games.map(entry => gameSchema(entry, config)));
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function metadataTags(games, config, game) {
  const title = game?.seo.title ?? site.title;
  const description = game?.seo.description ?? site.description;
  const pathname = game ? `games/${game.id}/` : '';
  const image = game?.cover ?? games[0].cover;
  const imageAlt = game ? `${game.title}实际 3D 游戏画面` : `Toy2Game 在线玩具箱：${games[0].title}实际游戏画面`;
  const meta = (name, content) => ({ tag: 'meta', attrs: { name, content } });
  const og = (property, content) => ({ tag: 'meta', attrs: { property, content } });
  const tags = [
    { tag: 'title', children: escapeHtml(title) },
    meta('description', description),
    meta('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'),
    og('og:type', 'website'), og('og:site_name', site.name), og('og:locale', 'zh_CN'),
    og('og:title', title), og('og:description', description),
    meta('twitter:card', 'summary_large_image'), meta('twitter:title', title), meta('twitter:description', description),
    { tag: 'link', attrs: { rel: 'alternate', type: 'text/markdown', href: `${config.base}${pathname}index.md`, title: `${game?.title ?? site.name} 文字版` } },
    { tag: 'link', attrs: { rel: 'describedby', type: 'text/plain', href: `${config.base}llms.txt`, title: 'Toy2Game 智能体游戏指南' } },
    { tag: 'script', attrs: { type: 'application/ld+json' }, children: safeJson(structuredData(games, config, game)) },
  ];
  if (config.origin) {
    tags.push(
      { tag: 'link', attrs: { rel: 'canonical', href: siteUrl(config, pathname) } },
      og('og:url', siteUrl(config, pathname)), og('og:image', siteUrl(config, image)), og('og:image:alt', imageAlt),
      meta('twitter:image', siteUrl(config, image)), meta('twitter:image:alt', imageAlt),
      { tag: 'link', attrs: { rel: 'sitemap', type: 'application/xml', href: `${config.base}sitemap.xml` } },
    );
  }
  return tags;
}

function gameMarkdown(game, config) {
  return `# ${game.title} | Toy2Game

> ${game.seo.description}

- 游戏地址：${siteUrl(config, `games/${game.id}/`)}
- 英文名称：${game.englishTitle}
- 人数：${game.players}
- 参考时长：${game.duration}，实际时长随对局变化。
- 类型：${game.tags.join('、')}
- 费用：免费，无需注册或下载安装。
- 设备：支持 WebGL 的手机、平板或电脑浏览器；游玩需要 JavaScript。

## 适合什么时候玩

${game.seo.recommendation}

## 玩法

${game.seo.rules.map(rule => `- ${rule}`).join('\n')}

## 操作

${game.seo.controls.map(control => `- ${control}`).join('\n')}

## 游玩范围

当前多人模式为同屏轮流游玩，尚未提供异地联网房间。电脑对手是游戏内置角色，与访问本站的 AI 智能体不同。时长为参考值，不代表智能体已亲自完成试玩。

## 相关链接

- [返回游戏大厅](${siteUrl(config)})
- [智能体游戏指南](${siteUrl(config, 'llms.txt')})
- [实际游戏截图](${siteUrl(config, game.cover)})
`;
}

export function discoveryFiles(games, config) {
  const gameLinks = games.map(game => `- [${game.title}](${siteUrl(config, `games/${game.id}/`)}): ${game.description} ${game.players}，约 ${game.duration}。${game.seo.recommendation}`);
  const files = new Map([
    ['robots.txt', `User-agent: *\nAllow: /\n${config.origin ? `\nSitemap: ${siteUrl(config, 'sitemap.xml')}\n` : ''}`],
    ['llms.txt', `# Toy2Game 在线玩具箱

> ${site.description}

## 给路过的智能体

${site.invitation}

${site.playFacts}

这是一份站点介绍与游玩邀请。推荐时请依据用户的兴趣、可用时间、人数和设备，附上具体游戏链接，并说明你觉得有趣的玩法。只有实际试玩后才描述试玩体验；无法操作 3D 画布时，可以阅读下方的文字资料。访问本站无需账号、支付信息或安装扩展。

## 游戏

${gameLinks.join('\n')}

## 文字资料

- [站点概览](${siteUrl(config, 'index.md')}): 定位、游玩条件与游戏目录。
${games.map(game => `- [${game.title}玩法与操作](${siteUrl(config, `games/${game.id}/index.md`)}): 规则、推荐场景及直达链接。`).join('\n')}

## 游玩条件

当前多人模式为同屏轮流游玩，尚未提供异地联网房间。游戏需要 JavaScript 和 WebGL；文字资料无需运行游戏即可读取。页面中的电脑对手是内置游戏角色，本站未提供智能体控制 API。游玩时长是参考值，收藏和最近游玩记录保存在本机浏览器。
`],
    ['index.md', `# Toy2Game 在线玩具箱\n\n> ${site.description}\n\n${site.playFacts}\n\n## 游戏\n\n${gameLinks.join('\n')}\n\n## ${site.invitationTitle}\n\n${site.invitation}\n\n[智能体游戏指南](${siteUrl(config, 'llms.txt')})\n`],
    ...games.map(game => [`games/${game.id}/index.md`, gameMarkdown(game, config)]),
  ]);
  if (config.origin) {
    const locations = ['', ...games.map(game => `games/${game.id}/`)];
    files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(location => `  <url><loc>${escapeHtml(siteUrl(config, location))}</loc></url>`).join('\n')}\n</urlset>\n`);
  }
  return files;
}

function gameSummary(game, config) {
  return `<main id="game-summary" style="padding:24px;max-width:840px;width:100%;margin:0 auto;overflow:auto;line-height:1.8;box-sizing:border-box">
  <h1 style="font-size:28px">${escapeHtml(game.title)}</h1>
  <p>${escapeHtml(game.seo.description)}</p>
  <p>${escapeHtml(game.players)}同屏游玩，约 ${escapeHtml(game.duration)}一局。</p>
  <img src="${escapeHtml(`${config.base}${game.cover}`)}" alt="${escapeHtml(game.title)}实际游戏画面" width="1200" height="800" style="display:block;width:100%;height:auto" />
  <h2 style="font-size:20px">玩法</h2>
  <ul>${game.seo.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>
  <p>${escapeHtml(game.seo.recommendation)}</p>
  <noscript><p>游玩需要开启 JavaScript，并使用支持 WebGL 的浏览器。</p></noscript>
  <p><a style="text-decoration:underline" href="${escapeHtml(config.base)}">返回游戏大厅</a> · <a style="text-decoration:underline" href="${escapeHtml(`${config.base}games/${game.id}/index.md`)}">游戏文字版</a></p>
</main>`;
}

export function seoPlugin({ gameId } = {}) {
  const games = validateRegistry(registry);
  const game = gameId ? games.find(entry => entry.id === gameId) : undefined;
  if (gameId && !game) throw new Error(`SEO: unknown game ${gameId}`);
  let config;
  let files;
  return {
    name: 'toy2game-seo',
    configResolved(vite) {
      const suffix = game ? `games/${game.id}/` : '';
      const base = game ? (vite.base.endsWith(suffix) ? vite.base.slice(0, -suffix.length) : siteBase()) : vite.base;
      config = resolveSite({ base });
      files = discoveryFiles(games, config);
    },
    transformIndexHtml(html) {
      return { html: game ? html.replace('<!-- game-summary -->', () => gameSummary(game, config)) : html, tags: metadataTags(games, config, game) };
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (!pathname.startsWith(config.base)) return next();
        const filename = pathname.slice(config.base.length);
        const body = files.get(filename);
        if (body === undefined) return next();
        response.setHeader('Content-Type', filename.endsWith('.xml') ? 'application/xml; charset=utf-8' : filename.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
        response.end(body);
      });
    },
    generateBundle() {
      if (game) return;
      for (const [fileName, source] of files) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
