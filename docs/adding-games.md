# 添加新游戏

## 1. 放入独立游戏目录

使用小写英文和连字符，例如 `games/marble-run/`，不要用中文、空格或序号。目录名同时作为稳定 ID 和公开 URL 的一部分，发布后应保持稳定。

游戏至少包含：

```text
games/marble-run/
  package.json
  index.html
  src/
  public/
  README.md
```

`package.json` 的名称使用 `@toy2game/marble-run`，需要 `dev` 和 `build` 脚本。当前约定为 Vite，脚本必须接受 `--base`，开发脚本还要接受 `--port`、`--strictPort`，生产输出到游戏自身的 `dist/`。

```json
{
  "name": "@toy2game/marble-run",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build"
  },
  "dependencies": {
    "@toy2game/catalog": "*"
  }
}
```

根据游戏补充 Vite、TypeScript、框架及引擎依赖。统一在仓库根目录执行 `npm install` 更新根锁文件，不添加游戏专属锁文件。游戏可通过 `npm run dev --workspace games/marble-run` 单独启动。

## 2. 登记游戏

在 `packages/catalog/games.json` 中新增一项：

```json
{
  "id": "marble-run",
  "title": "弹珠轨道",
  "englishTitle": "MARBLE RUN",
  "description": "搭出自己的轨道，看看弹珠能跑多远。",
  "category": "party",
  "tags": ["物理模拟", "自由搭建"],
  "players": "1 人",
  "duration": "自由时长",
  "cover": "images/marble-run.png",
  "color": "ice",
  "addedAt": "2026-09-05",
  "seo": {
    "title": "弹珠轨道 | 免费在线轨道搭建游戏 | Toy2Game",
    "description": "免费在线搭建弹珠轨道，测试自己的路线，观察弹珠的运动。",
    "recommendation": "适合喜欢自由搭建和观察物理运动的玩家。",
    "rules": ["搭建轨道后释放弹珠，观察它能否顺利抵达终点。"],
    "controls": ["按游戏实际操作方式填写。"]
  }
}
```

`id` 必须与目录名完全一致；分类现有 `party`、`strategy`，封面底色现有 `ice`、`garden`。新增分类时同步更新 `packages/catalog/index.ts` 和 `scripts/catalog.mjs` 的分类校验。

把实际游戏截图放到 `apps/web/public/images/marble-run.png`，建议 1200 × 800，主体居中以适应不同屏幕裁切。不要将未经授权的实体产品参考图作为发布封面。`scripts/capture-covers.mjs` 提供现有两个游戏的截图流程，新游戏可按其场景选择器扩展该脚本。

`seo` 示例仅展示字段格式，必须按实际功能填写。在游戏的 `vite.config.ts` 引入 `import { seoPlugin } from '../../scripts/seo.mjs'`，将 `seoPlugin({ gameId: 'marble-run' })` 加入 `plugins`。移除 HTML 中手写的 title 和 description，由插件统一生成；在游戏挂载容器内放置 `<!-- game-summary -->`，供插件生成加载前可读的简介。游戏初始化时接管该容器，保留现有全屏游玩体验。根构建会自动生成该游戏的结构化数据、站点地图条目、智能体索引和文字版资料。

## 3. 接上返回大厅和游玩记录

在游戏入口中调用：

```ts
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';

recordVisit('marble-run');
const home = libraryUrl(import.meta.env.BASE_URL);
```

把标题或独立返回按钮的链接设为 `home`，并提供“返回游戏大厅”的可访问名称。不要为游戏添加固定在最上方、遮挡棋盘的公共悬浮工具栏。

## 4. 保持资源路径可部署

- 游戏链接统一为 `/games/<id>/`，由登记表和构建脚本生成。
- 在 HTML 中引用公共资源时使用 `%BASE_URL%favicon.png`。
- 在 JS 中引用 `public/` 资源时使用 `import.meta.env.BASE_URL`；源码资源优先使用 `import` 或 `new URL('./asset.png', import.meta.url)`。
- CSS 的本地资源 URL 交给 Vite 处理；不要在运行时硬编码 `/assets/`、`/fonts/` 等站点根路径。
- 游戏的存储键使用自身 ID 和版本，不读写其他游戏的对局数据。
- 各游戏保留自己的规则、引擎、场景销毁和暂停逻辑。只有确实共用的站点能力才放到 `packages/`。
- 浏览器测试用相对的 `page.goto('./')`，使同一测试可以在单独启动和统一站点路径下运行。

## 5. 验证后发布

```sh
npm install
npm test
npm run build
npm run test:e2e
```

为新游戏添加必要的单元测试与桌面、移动端浏览器验证。根目录 `tests/browser/games.spec.ts` 中补充游戏选择器和主要操作，确认实际画布、资源路径、返回大厅和游玩记录。

提交并推送到 GitHub 后，Cloudflare 自动部署更新，不需要修改构建命令或 Worker 配置。
