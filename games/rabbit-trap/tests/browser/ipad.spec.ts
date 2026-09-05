import { test, expect, webkit, devices } from "@playwright/test";
import type {} from "./game.spec";
import { FINISH, GROUND_COUNT } from "../../src/world";
import { configureParticipants } from "./fixtures";

for (const viewport of [
  { width: 1180, height: 820 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`settings and restart controls fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
    const toolbar = await page.locator(".topbar").evaluate((element) => {
      const buttons = [...element.querySelectorAll<HTMLButtonElement>("button")];
      const brand = element.querySelector(".brand")!.getBoundingClientRect();
      return buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44 && rect.left >= brand.right && rect.right <= innerWidth;
      });
    });
    expect(toolbar.every(Boolean)).toBe(true);
    await page.getByRole("button", { name: "游戏设置", exact: true }).click();
    await configureParticipants(page, 4, [false, true, false, true]);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator(".role-control button[aria-pressed=true]")).toHaveText(["真人", "机器人", "真人", "机器人"]);
    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const start = element.querySelector(".primary-button")!.getBoundingClientRect();
      return {
        fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        startVisible: start.top >= rect.top && start.bottom <= rect.bottom,
        overflow: element.scrollWidth > element.clientWidth,
        controls: [...element.querySelectorAll<HTMLButtonElement>(".segmented button")].map((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.width >= 44 && bounds.height >= 44 && button.scrollWidth <= button.clientWidth;
        }),
      };
    });
    expect(layout.fits).toBe(true);
    expect(layout.startVisible).toBe(true);
    expect(layout.overflow).toBe(false);
    expect(layout.controls.every(Boolean)).toBe(true);
    await page.screenshot({ path: `artifacts/roster-touch-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "按此设置开始新局" }).click();
    await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
    await page.getByRole("button", { name: "抽一张卡牌" }).click();
    await page.getByRole("button", { name: "新的一局", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "重新开始这一局？" })).toBeVisible();
    await page.screenshot({ path: `artifacts/restart-touch-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "重新开局", exact: true }).click();
    await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
    expect(await page.evaluate(() => window.__rabbit.diagnostics().nonTransparentPixels)).toBeGreaterThan(500);
  });
}

test("iPad WebKit renders the complete garden in both orientations with large touch controls", async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({
      ...devices["iPad Pro 11"],
      viewport: { width: 1180, height: 820 },
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(process.env.GAME_URL ?? "http://localhost:5187/");
    await expect(
      page.getByRole("button", { name: "抽一张卡牌" }),
    ).toBeEnabled();
    for (const viewport of [
      { width: 1180, height: 820 },
      { width: 1024, height: 768 },
      { width: 820, height: 1180 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => {
        const action = document
          .querySelector(".action-area")!
          .getBoundingClientRect();
        const title = document
          .querySelector(".world-heading")!
          .getBoundingClientRect();
        const turn = document
          .querySelector(".board-topline")!
          .getBoundingClientRect();
        return {
          diag: window.__rabbit.diagnostics(),
          overflow: document.documentElement.scrollWidth > innerWidth,
          actionBottom: action.bottom,
          height: innerHeight,
          titleTurnOverlap:
            title.left < turn.right &&
            title.right > turn.left &&
            title.top < turn.bottom &&
            title.bottom > turn.top,
          controls: [
            ...document.querySelectorAll<HTMLButtonElement>(
              ".primary-button, .discovery-button, .header-actions .icon-button",
            ),
          ]
            .filter((button) => button.getBoundingClientRect().width > 0)
            .map((button) => ({
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
            })),
        };
      });
      expect(state.diag.pathLength).toBe(FINISH);
      expect(state.diag.groundCount).toBe(GROUND_COUNT);
      expect(state.diag.nonTransparentPixels).toBeGreaterThan(500);
      expect(state.diag.places).toHaveLength(3);
      expect(state.overflow).toBe(false);
      expect(state.titleTurnOverlap).toBe(false);
      expect(state.actionBottom).toBeLessThan(state.height);
      expect(
        state.controls.every(
          (control) => control.width >= 44 && control.height >= 44,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/ipad-webkit-${viewport.width}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

test("iPad touch interactions award all three badges without spending a turn and survive reload", async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({
      ...devices["iPad Pro 11"],
      viewport: { width: 1180, height: 820 },
    });
    await page.goto(process.env.GAME_URL ?? "http://localhost:5187/");
    await expect(
      page.getByRole("button", { name: "抽一张卡牌" }),
    ).toBeEnabled();
    await page.evaluate(() =>
      window.__rabbit.client.moves.configureWeather(false),
    );
    const mushroom = await page.evaluate(
      () =>
        window.__rabbit
          .diagnostics()
          .places.find((place) => place.id === "mushroom")!,
    );
    await page.touchscreen.tap(mushroom.screen.x, mushroom.screen.y);
    await page.waitForFunction(() =>
      window.__rabbit.client.getState()!.G.discoveries.includes("mushroom"),
    );
    await page.waitForFunction(
      () => window.__rabbit.diagnostics().mushroomHeight > 1.05,
    );
    await page.getByRole("button", { name: "泡泡池塘", exact: true }).tap();
    await page.waitForFunction(
      () => window.__rabbit.diagnostics().fishHeight > 0.3,
    );
    await page.getByRole("button", { name: "风车花园", exact: true }).tap();
    await page.waitForFunction(
      () => window.__rabbit.diagnostics().windSpeed > 1,
    );
    await expect(page.getByRole("status")).toHaveText("花园探索家！");
    const state = await page.evaluate(() => window.__rabbit.client.getState()!);
    expect(state.G.discoveries).toEqual(["mushroom", "pond", "windmill"]);
    expect(state.G.deck).toHaveLength(52);
    expect(state.G.action.id).toBe(0);
    expect(state.ctx.turn).toBe(1);
    await page.getByRole("button", { name: "风车花园", exact: true }).tap();
    expect(
      await page.evaluate(
        () => window.__rabbit.client.getState()!.G.discoveries.length,
      ),
    ).toBe(3);
    await page.screenshot({
      path: "artifacts/ipad-discovery.png",
      fullPage: true,
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "抽一张卡牌" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() =>
        window.__rabbit.diagnostics().places.every((place) => place.discovered),
      ),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

test("iPad can flip the physical card, choose a numbered rabbit and collect a star with camera follow", async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({
      ...devices["iPad Pro 11"],
      viewport: { width: 1024, height: 768 },
    });
    await page.goto(process.env.GAME_URL ?? "http://localhost:5187/");
    await expect(
      page.getByRole("button", { name: "抽一张卡牌" }),
    ).toBeEnabled();
    await page.evaluate(() => {
      const client = window.__rabbit.client;
      const state = structuredClone(client.store.getState());
      state.G.deck = [3];
      client.store.dispatch({ type: "RESET", state, clientOnly: true });
    });
    await page.getByRole("button", { name: "待抽取的卡牌" }).tap();
    const rabbit = page.getByRole("button", { name: "选择 1 号兔" });
    await page.getByRole("button", { name: "跟随小兔" }).tap();
    await expect(rabbit).toBeEnabled();
    const bounds = await rabbit.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(56);
    expect(bounds!.width).toBeGreaterThanOrEqual(60);
    await rabbit.tap();
    await page.getByRole("button", { name: "暂停游戏" }).tap();
    await page.waitForFunction(
      () => window.__rabbit.diagnostics().starsRemaining === 8,
    );
    const result = await page.evaluate(() => ({
      state: window.__rabbit.client.getState()!,
      diag: window.__rabbit.diagnostics(),
    }));
    expect(result.state.G.tokens[0].position).toBe(2);
    expect(result.state.G.action.route).toEqual([0, 1, 2]);
    expect(result.state.G.stars[0]).toBe(1);
    expect(result.diag.cameraZoom).toBeCloseTo(1.65);
    expect(result.diag.tokens.every((token) => token.numbered)).toBe(true);
    await page.screenshot({
      path: "artifacts/ipad-star-follow.png",
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
});
