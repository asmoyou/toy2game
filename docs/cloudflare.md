# Cloudflare Workers 部署

此项目使用 **Workers Static Assets**，大厅及游戏都是静态资源，无需额外 Worker 业务代码、数据库、API 密钥或游戏服务器。后续需要排行榜或联机服务时，再按实际需求增加后端。

## 关联 GitHub 自动部署

先把仓库变更提交并推送到 `asmoyou/toy2game`。在 Cloudflare 的 **Workers & Pages** 中创建 **Worker**，选择导入 Git 仓库，关联该 GitHub 仓库。

按以下内容填写：

| Cloudflare 字段 | 填写值 |
| --- | --- |
| 项目 / Worker 名称 | `toy2game` |
| 生产分支 | `main`（如实际分支不同，选择实际分支） |
| 根目录 / Root directory | 仓库根目录，留空或 `/` |
| 构建命令 / Build command | `npm run build` |
| 部署命令 / Deploy command | `npx wrangler deploy` |
| 非生产分支部署命令（如果启用） | `npx wrangler versions upload` |
| 构建环境变量 | `NODE_VERSION` = `22.21.1` |
| SEO 构建环境变量 | `SITE_ORIGIN` = 最终公开访问的 HTTPS 域名（不带路径） |

Workers 不需要单独填写输出目录，根目录 `wrangler.jsonc` 已将静态资源目录设为 `./dist`。依赖由 Cloudflare 自动安装，根目录的 `package-lock.json` 必须一起提交。如果界面允许覆盖安装命令，可填写 `npm ci`。

根目录应指向**整个仓库**，不是 `apps/web` 或某个游戏，因为根构建脚本负责生成全部页面。保持 `SITE_BASE` 未设置，使用默认 `/`。

Worker 名称要与 `wrangler.jsonc` 的 `name` 一致。如果在 Cloudflare 里选择了别的名称，请同步修改该字段。

完成首次部署后，使用 Cloudflare 提供的 `workers.dev` 地址访问。以后向生产分支推送提交，会自动构建并部署大厅和所有登记的游戏。不需要为每个游戏单独创建 Worker。

得到正式访问地址后，将其设为构建环境变量 `SITE_ORIGIN`，或写入 `packages/catalog/site.json` 的 `origin`，然后重新构建部署，以生成 canonical、分享图片绝对地址和 `sitemap.xml`。绑定自定义域名后同步更新此值。该变量属于构建环境，不是 Worker 运行时变量；详见 [SEO 与智能体发现](seo.md)。

当前登记的正式地址为 `https://games.asmo.top`，默认构建会生成该域名的 canonical 和 sitemap。部署到其他域名时用 `SITE_ORIGIN` 覆盖；显式设置为空仍可生成不含正式域名的本地构建。

## 分析线上指标

- Web Analytics 按 `asmo.top` 站点统计时可能包含多个子域名。检查本项目时添加「主机等于 `games.asmo.top`」筛选，再比较相同时间范围的数据。它统计浏览器上报的访问和体验数据，Workers 的 Asset 请求数则包含 HTML、字体、图片和脚本等，不能当作玩家人数。
- Asset 4xx/5xx 是状态码汇总，不能直接推断游戏脚本报错。需结合具体请求路径、请求方式和浏览器实际导航核对；未知路径应继续返回真实 404。
- Cloudflare Speed Brain 的预取请求带有 `Sec-Purpose: prefetch`，未能预取时可能返回 503。它与用户实际导航分开，见 [Cloudflare 说明](https://developers.cloudflare.com/speed/optimization/content/speed-brain/)。站点浏览器测试只忽略这种 503，实际页面和资源失败仍然报错。
- 大厅使用实际截图压缩的 WebP 封面，前三张立即加载、后续封面按需加载；首张提高下载优先级。`npm run covers` 按登记表格式输出封面。原 PNG 地址保留，兼容已发布的图片链接。

本地生产构建验证完成后，可用 `SITE_URL=https://games.asmo.top/ npx playwright test tests/browser/games.spec.ts --project=desktop` 检查线上游戏入口、操作和资源；它会产生少量实际访问，不能代表所有地区网络或真实 iPad 硬件表现。

## 本地检查构建及 Cloudflare 路由

```sh
npm ci
npm run build
npm run preview:cloudflare
```

也可以只验证配置和打包，不上传：

```sh
npx wrangler deploy --dry-run
```

Cloudflare 托管后的路径如下：

```text
/
/games/penguin-ice/
/games/rabbit-trap/
```

每个游戏有自己的 `index.html`。配置保留目录末尾的 `/`，找不到的路径返回 `404.html` 和 HTTP 404，不启用覆盖所有路径的 SPA 回退规则。

## 手动部署（可选）

```sh
npm ci
npm run build
npx wrangler login
npm run deploy:workers
```

GitHub 自动部署不需要在构建命令里运行 `wrangler login`。Cloudflare 的 Git 集成负责构建环境中的部署认证。

## 参考

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Builds 的 Git 构建与部署设置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [静态资源配置](https://developers.cloudflare.com/workers/static-assets/binding/)
