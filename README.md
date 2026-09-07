# Toy2Game · 在线玩具箱

把实物玩具变成免费在线游戏，保留熟悉的乐趣，也加入更丰富的玩法。游戏合集会持续更新。

目前包含 **企鹅敲敲敲**、**小兔闯关**、**平衡太空人** 和 **益智移车出库**。前三款支持 2–4 人同屏游玩及电脑对手，移车出库为单人逻辑闯关。大厅支持搜索、分类、收藏、最近玩过和随机游戏。

## 本地运行

需要 Node.js 22.18 或更高版本，仓库用 `.node-version` 固定为 `22.21.1`。

```sh
npm ci
npm run dev
```

在**仓库根目录**执行。统一入口为 `http://localhost:5173/`，大厅、各游戏及热更新共用这一个监听端口。重复启动会复用同仓库已有服务；5173 被其他服务占用时会退出并提示，不自动增加端口。同一 Wi-Fi 下的手机和平板可以访问终端打印的 Network 地址。

## 架构

采用 npm workspaces 管理的多入口静态网站。大厅和每个游戏独立构建，游戏通过普通链接进入自己的页面。首页不会下载 Three.js、物理引擎或游戏代码，离开游戏页面后浏览器释放该页面的场景资源。

```text
apps/
  web/                    # React + Vite 中文游戏大厅
games/
  penguin-ice/            # 企鹅敲敲敲，Three.js + cannon-es
  rabbit-trap/            # 小兔闯关，React + Three.js + boardgame.io
  balance-astronaut/      # 平衡太空人，Three.js + cannon-es
  parking-escape/         # 益智移车出库，Three.js + boardgame.io
packages/
  catalog/
    games.json           # 唯一的游戏登记表，大厅和构建脚本共同读取
    index.ts             # 游戏类型、分类和访问路径
    browser.ts           # 收藏、最近游玩及返回大厅地址
scripts/                 # 自动发现游戏、统一开发、构建和预览
tests/                   # 目录契约和整个网站的浏览器测试
docs/                    # 添加游戏和 Cloudflare 部署说明
wrangler.jsonc           # Cloudflare Workers 静态资源配置
package-lock.json        # 全仓库共用一份锁文件
```

游戏代码、样式、依赖和测试各自维护，保留已有引擎版本。暂不抽象游戏内部规则，也不通过 iframe 嵌入。未来新的 Vite 游戏可使用自己的前端框架，仍遵循同一目录和构建约定。

| 页面 | 路径 |
| --- | --- |
| 游戏大厅 | `/` |
| 企鹅敲敲敲 | `/games/penguin-ice/` |
| 小兔闯关 | `/games/rabbit-trap/` |
| 平衡太空人 | `/games/balance-astronaut/` |
| 益智移车出库 | `/games/parking-escape/` |

浏览器记录保存在本机，不涉及账号或后端；原游戏的偏好和对局存储键保持原样。当前多人模式是同屏游戏。

## 构建和部署

```sh
npm run build
npm run preview
```

开发与生产预览均使用 5173，切换前先停止当前服务。验证结束后关闭临时预览，再按需恢复开发服务。

统一产物位于根目录 `dist/`，包含大厅、游戏页面、字体、封面和 404 页面。可直接部署到 **Cloudflare Workers Static Assets**。

**[Cloudflare Workers 配置与 GitHub 自动部署](docs/cloudflare.md)**

SEO 和智能体资料由游戏目录自动生成，包括每页元信息、结构化数据、首页预渲染、`robots.txt`、`llms.txt` 与游戏文字版。正式部署前配置 `SITE_ORIGIN` 或 `packages/catalog/site.json` 的 `origin`，生成 canonical、分享图片绝对地址和站点地图。详见 **[SEO 与智能体发现](docs/seo.md)**。

## 持续添加游戏

新增 `games/<english-slug>/`，把游戏信息登记到 `packages/catalog/games.json`，放入实际游戏封面。开发和生产构建会自动读取登记表。

**[新游戏接入约定](docs/adding-games.md)**

## 验证

```sh
npm test
npm run build
npm run test:e2e
```

`npm test` 运行目录校验及各游戏的规则和物理测试。运行 `test:e2e` 前先停止开发服务；它自动在 5173 启动生产预览，检查桌面和手机上的搜索、筛选、收藏、最近玩过、游戏跳转、嵌套资源、真实画布像素、游戏操作和 404。

开发服务运行时可执行 `node tests/browser/dev-server.mjs`，验证重复启动复用、全部登记游戏的资源加载及各自热更新连接共用一个端口。

浏览器默认使用本机 Google Chrome。没有 Chrome 时执行 `npx playwright install chromium`，然后用 `PLAYWRIGHT_CHANNEL=chromium npm run test:e2e`。截图输出在 `artifacts/`，失败跟踪在 `test-results/`。

完整原游戏浏览器回归需要先启动 `npm run dev`，另一个终端运行：

```sh
npx playwright install webkit
SITE_URL=http://localhost:5173/ npm run test:games
```

封面已经包含在仓库中，部署时无需浏览器或截图工具。游戏画面更新后，可在开发服务器运行期间执行 `npm run covers` 重新截取封面。
