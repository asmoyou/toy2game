# 项目介绍素材

README 与 GitHub 分享图使用实际游戏截图，沿用大厅的绿色点缀和浅色背景。没有使用商品参考照片，也没有补画游戏中不存在的场景。

## 图片

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| [toy2game-overview.png](images/toy2game-overview.png) | 1600 × 1280 | README 首图、四款游戏快速介绍 |
| [toy2game-devices.png](images/toy2game-devices.png) | 1600 × 960 | 桌面、平板横屏和手机竖屏界面预览 |
| [toy2game-social.png](images/toy2game-social.png) | 1280 × 640 | GitHub 仓库 Social preview、横版分享封面 |
| [penguin-ice-gameplay.gif](images/penguin-ice-gameplay.gif) | 600 × 400 | 实际敲冰、连锁坍塌与落水动图 |
| [parking-escape-gameplay.gif](images/parking-escape-gameplay.gif) | 600 × 400 | 第一关四步移车出库的实际通关动图 |

图片中的人数与功能对应当前四款游戏。跨设备画面由 Chrome 按相应视口渲染，展示外框为排版元素，不代表真实设备拍摄或硬件验证。

总览与分享封面的场景来自 `apps/web/public/images/` 下的四张大厅封面。设备预览来自本地站点的大厅、小兔闯关与移车出库页面。英文使用 DM Sans，中文使用 Noto Sans SC，两者均遵循 SIL Open Font License：[DM Sans 许可](../apps/web/public/fonts/OFL.txt)、[Noto Sans SC 许可](../apps/web/public/fonts/noto-sans-sc-OFL.txt)。截图脚本将本地字体嵌入排版页面，不依赖远程字体或指定的系统中文字库。

## 重新制作

在仓库根目录安装依赖后，启动统一开发服务：

```sh
npm ci
npm run dev
```

另一个终端运行：

```sh
node scripts/capture-readme.mjs
```

默认使用本机 Chrome；也可先执行 `npx playwright install chromium`，再设置 `PLAYWRIGHT_CHANNEL=chromium`。开发服务地址可通过 `SITE_URL` 覆盖，子目录地址需保留末尾 `/`。制作完成后用 `Ctrl+C` 关闭本次临时启动的服务。

脚本会更新上表三张 PNG 发布图片；原始页面截图、排版预览 HTML 与检查记录写入被忽略的 `artifacts/readme/`。脚本不修改游戏源码或大厅封面。更换场景画面时，先按根 README 的说明重新截取相应大厅封面。

排版与文案在 [`scripts/capture-readme.mjs`](../scripts/capture-readme.mjs) 中维护，游戏名称、人数和时长读取登记表。新增游戏时需要重新安排总览和分享封面的版式。发布前应实际查看图片，核对文字、主体完整性和当前功能。

动图另由 [`scripts/capture-gameplay.mjs`](../scripts/capture-gameplay.mjs) 录制。需要本机安装 FFmpeg，并在开发服务运行时执行：

```sh
node scripts/capture-gameplay.mjs
```

录制使用游戏现有的合法操作入口，完成真实落水结算和第一关通关。只在录制页面中隐藏周边界面、放大现有场景，不改动规则或用预设动画代替结果。原始视频、前后截图与检查结果保存在 `artifacts/readme/gameplay/`；对外 GIF 不保留视频元数据。

## GitHub About

Description：

> 把实物玩具变成打开即玩的 3D 网页游戏。支持单人解谜、2–4 人同屏与电脑对手，适配手机、平板和电脑。源码开放，非商业使用免费，商用须经作者授权。

Topics：

```text
browser-game threejs typescript vite boardgame physics-game local-multiplayer puzzle-game touch-friendly self-hosted
```

Website 使用当前公开试玩地址 [https://games.asmo.top/](https://games.asmo.top/)。分享封面使用上面的 `toy2game-social.png`。更换域名时同步更新根 README 的试玩链接与仓库 Website。
