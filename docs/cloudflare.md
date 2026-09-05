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

Workers 不需要单独填写输出目录，根目录 `wrangler.jsonc` 已将静态资源目录设为 `./dist`。依赖由 Cloudflare 自动安装，根目录的 `package-lock.json` 必须一起提交。如果界面允许覆盖安装命令，可填写 `npm ci`。

根目录应指向**整个仓库**，不是 `apps/web` 或某个游戏，因为根构建脚本负责生成全部页面。保持 `SITE_BASE` 未设置，使用默认 `/`。

Worker 名称要与 `wrangler.jsonc` 的 `name` 一致。如果在 Cloudflare 里选择了别的名称，请同步修改该字段。

完成首次部署后，使用 Cloudflare 提供的 `workers.dev` 地址访问。以后向生产分支推送提交，会自动构建并部署大厅和所有登记的游戏。不需要为每个游戏单独创建 Worker。

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
