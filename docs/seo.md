# SEO 与智能体发现

首页在根构建中预渲染为真实 HTML，再由 React 接管交互。每个游戏页面在初始 HTML 中提供游戏简介、截图、规则和文字版入口，游戏加载后显示可玩的场景。相同内容面向所有访问者，不根据 User-Agent 区分版本。

## 正式域名

在 `packages/catalog/site.json` 的 `origin` 填入最终的 HTTPS 域名，也可在构建环境设置 `SITE_ORIGIN` 覆盖。域名不带路径、查询参数或片段，例如：

```sh
SITE_ORIGIN=https://your-real-domain.com npm run build
```

示例域名仅用于说明，应替换为实际可访问的域名。部署在子目录时另设 `SITE_BASE=/toy2game/`。不配置域名仍可本地构建，但会提示并省略 canonical、社交分享图片绝对地址和 sitemap，避免发布虚构地址。

构建时自动生成：

- 首页和游戏页各自的 title、description、Open Graph、Twitter Card、canonical。
- `WebSite`、`CollectionPage`、`ItemList`、`VideoGame`、`BreadcrumbList` JSON-LD，内容来自真实游戏目录，不添加评分或评论。
- `robots.txt` 允许抓取，并在配置域名后声明 `sitemap.xml`；站点地图仅列首页和独立游戏页。
- `llms.txt` 提供智能体邀请、推荐场景和游戏链接。
- `index.md` 与 `games/<id>/index.md` 提供无需执行 JavaScript 的站点说明、玩法和操作资料。

游戏列表筛选、搜索和收藏使用首页 canonical。404 页面标记为 `noindex`，Cloudflare 继续返回 HTTP 404。

## 内容维护

站点定位与智能体邀请在 `packages/catalog/site.json`；各游戏 SEO 标题、描述、推荐场景、规则和操作在 `packages/catalog/games.json` 的 `seo` 字段。每次构建都会同步生成结构化数据和文字资料，新增游戏需接入公共 Vite SEO 插件，见 [添加游戏](adding-games.md)。时长使用目录中的参考值；功能、人数、收费方式变化时同步更新描述和邀请中的事实。

开发服务提供元信息和文字资料；首页预渲染以 `npm run build` 后的 `npm run preview` 为准。整个站点的部署产物是根目录 `dist/`。

## 上线验证

1. 配置实际域名并重新构建，确认首页和所有游戏页 canonical、分享图片地址及 sitemap 域名一致。
2. 访问 `robots.txt`、`sitemap.xml`、`llms.txt` 和各游戏 `index.md`，确认返回成功且没有托管平台的登录页或挑战页。
3. 在站长平台验证域名所有权，并提交正式地址下的 `sitemap.xml`。这些操作需使用站点所有者的账号。
4. 使用搜索平台的 URL 检查工具查看抓取结果，并检查真实页面的结构化数据。

`llms.txt` 是供愿意读取它的智能体使用的公开提案，不能保证搜索排名、收录或 AI 推荐。Google 的 AI 搜索仍依赖通常的 SEO 与内容质量，其文档明确说明 Google Search 不将 `llms.txt` 用作排名优化信号。

参考：[Google 生成式 AI 搜索指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)、[llms.txt 提案](https://llmstxt.org/)、[Schema.org VideoGame](https://schema.org/VideoGame)。
