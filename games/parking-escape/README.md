# 益智移车出库

根据用户提供的 `玩具参考图/益智移车出库.png` 制作的单人 3D 移车游戏。绿色停车场边框、白色底盘、警车、十辆短车和四辆长车的外观来自参考图；模型和图案均由 Three.js 与 Canvas 代码绘制，参考商品图不作为生产资源发布。

## 规则依据与数字版设计

图片能确定车辆种类与大致外观，但不能确认原产品的完整规则、棋盘尺寸及附赠的 360 道关卡。本作采用 [ThinkFun 同类移车游戏的公开说明](https://legacy.thinkfun.com/wp-content/uploads/2015/09/RushH-5000-IN02.pdf) 中的沿车道前后滑动、不能横移或拿起车辆、目标车从出口离开的机制；这不是图片所示产品的官方复刻。

- 单人闯关，6 × 6 格，右侧第三行是警车出口。短车占两格，长车占三格；每关使用十五辆车库中的一部分。
- 所有车辆只能沿自己的长轴滑动，不可穿过、重叠、旋转或移出棋盘，警车出库除外。
- 一次连续滑动任意格数计一步；警车完全驶出棋盘计最后一步并通关。可撤销、重做，撤销后的步数随路径回退。
- 24 个由固定种子生成并用广度优先搜索验证的独立关卡，不复用或宣称包含商品图里的 360 道关卡。最少步数包含出库动作。
- 提示在 Web Worker 内求当前局面的最短解，只标示下一步，执行仍走同一合法动作入口。暂停、弹窗、重开、切关或隐藏页面时取消旧提示任务。
- 三星为达到最少步数，二星为最多多五步，其余通关一星。不限时，不因使用提示降低评分。
- 关卡选择是开局设置草稿，取消不改变游戏。新的一局沿用当前关卡，有进度时须确认。完成后可直接重玩或进入下一关；所有关卡都可自由选择。
- `parking-escape-save-v1` 保存经过合法动作链校验的关卡进度、撤销历史与最佳成绩；`parking-escape-preferences-v1` 保存音效。损坏或无法访问的存储不妨碍开局。

## 实现与操作

Vite + 严格 TypeScript + Three.js + boardgame.io。规则和碰撞占格位于 `src/rules.ts`，引擎动作在 `src/game.ts`，搜索在 `src/solver.ts`，场景和输入在 `src/scene.ts`，界面调度在 `src/main.ts`。无后端、远程资源或随机运行事件。

拖动车辆滑动，或点选车辆后使用方向按钮；车辆列表提供等效触控选择。方向键移动选中车，空白区域拖动旋转视角，双指缩放。提供俯视、旋转和复位按钮。工具栏提供浏览器全屏切换，兼容标准和旧版 Safari 接口；不支持或权限禁用时隐藏，外部退出后同步按钮，请求失败给出提示，切换不重置进度或视角。缩放、取消和多指手势不会误提交移车。页面隐藏或暂停时停止动画与计时，遵循减少动态效果偏好。

## 运行与验证

在仓库根目录执行：

```sh
npm install
npm run dev
npm test --workspace games/parking-escape
GAME_URL=http://localhost:5173/games/parking-escape/ CHECK_INPUT=1 npm run test:browser --workspace games/parking-escape
GAME_ID=parking-escape npm run covers
npm test
npm run build
npm run test:e2e
```

开发服务使用仓库统一端口；生产浏览器测试前关闭开发服务，测试后关闭临时预览。`CHECK_INPUT=1` 使用开发诊断接口加测拖动、取消、多指缩放、后台暂停和过期提示。`CHECK_WEBKIT=1` 可增加 WebKit 模拟验证，需先安装对应 Playwright 浏览器。设备模拟不代表真实 iPad 硬件测试。开发环境提供 `window.__parking` 诊断接口，生产不暴露。

关卡可通过 `npm run levels --workspace games/parking-escape` 从固定种子重新生成；运行后需重跑规则测试。模型、音效与封面来自本游戏；图标使用 lucide（ISC），字体使用系统字体。与实体玩具的差异是离散吸附、自动计步、求解提示、数字关卡和进度保存，不模拟推车力学。

详细浏览器检查覆盖 Chrome 与 WebKit 的 1440 × 1000、1180 × 820、820 × 1180、390 × 844 和 844 × 390 视口，包含画布像素、移车前后变化、弹窗草稿、撤销重做、暂停、刷新、通关与下一关。`tests/edge-check.mjs` 补充最难关卡的完整通关、减少动态效果、损坏或禁用存储、WebGL 不可用的恢复界面。截图输出到根目录 `artifacts/parking-escape/`。

`tests/fullscreen-check.mjs` 验证全屏能力与权限、标准和旧版 Safari 事件、失败反馈、状态保留及手机和 iPad 工具栏。可单独执行 `GAME_URL=http://localhost:5173/games/parking-escape/ CHECK_WEBKIT=1 node games/parking-escape/tests/fullscreen-check.mjs`。
