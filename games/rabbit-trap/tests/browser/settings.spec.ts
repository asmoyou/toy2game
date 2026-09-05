import { test, expect } from "@playwright/test";
import type {} from "./game.spec";
import { configureParticipants } from "./fixtures";

test("restart keeps the active roster and weather, ignores discarded drafts, and preserves progress when cancelled", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await configureParticipants(page, 4, [false, false, true, true]);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).uncheck();
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "重新开始这一局？" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "玩家人数" })).toHaveCount(0);
  const before = await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"));
  await page.screenshot({ path: "artifacts/restart-confirmation.png", fullPage: true });
  await dialog.getByRole("button", { name: "继续这局" }).click();
  expect(await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"))).toBe(before);
  await expect(page.getByRole("button", { name: "新的一局", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await configureParticipants(page, 2, [true, true]);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).check();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"))).toBe(before);
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  await dialog.getByRole("button", { name: "重新开局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("little-rabbit-match-v1")!));
  expect(saved.players).toEqual([{ bot: false }, { bot: false }, { bot: true }, { bot: true }]);
  expect(saved.state.G.weather.enabled).toBe(false);
  expect(saved.state.G.action.id).toBe(0);
  expect(saved.state.G.deck).toHaveLength(52);
  expect(saved.state.G.tokens).toHaveLength(12);
  expect(saved.state.ctx.currentPlayer).toBe("0");
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await expect(page.locator(".mode-indicator")).toHaveText("2 真人 · 2 机器人");

  const previousClient = await page.evaluateHandle(() => window.__rabbit.client);
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => previousClient.evaluate((client) => client === window.__rabbit.client)).toBe(false);
  await previousClient.dispose();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
});

test("restart confirmation protects discoveries, pauses computer and weather timers, and cancels old turns", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.getByRole("button", { name: "蘑菇营地", exact: true }).click();
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "重新开始这一局？" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  expect(await page.evaluate(() => window.__rabbit.client.getState()!.G.discoveries)).toEqual(["mushroom"]);
  await page.evaluate(() => {
    const client = window.__rabbit.client;
    const state = structuredClone(client.store.getState());
    state.G.deck = [1, 1];
    state.G.features = [];
    client.store.dispatch({ type: "RESET", state, clientOnly: true });
  });
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await page.getByRole("button", { name: "选择 1 号兔" }).click();
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    const client = window.__rabbit.client;
    const state = structuredClone(client.store.getState());
    state.G.weather.strikeIn = 0.2;
    state.G.weather.revision++;
    client.store.dispatch({ type: "RESET", state, clientOnly: true });
  });
  const before = await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"));
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"))).toBe(before);
  await dialog.getByRole("button", { name: "重新开局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.waitForTimeout(1700);
  const state = await page.evaluate(() => window.__rabbit.client.getState()!);
  expect(state.ctx.currentPlayer).toBe("0");
  expect(state.G.action.id).toBe(0);
  expect(state.G.deck).toHaveLength(52);
  expect(state.G.discoveries).toEqual([]);
});

test("roster drafts retain hidden seats, cancel without changing the match, and apply only active seats", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(() => window.__rabbit.client.moves.configureWeather(false));
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"));
  const counts = page.getByRole("group", { name: "玩家人数", exact: true });
  await counts.getByRole("button", { name: "4 人", exact: true }).click();
  await expect(page.getByRole("button", { name: "芋圆设为真人" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "布丁设为真人" }).click();
  await page.getByRole("button", { name: "芋圆设为机器人" }).click();
  await counts.getByRole("button", { name: "2 人", exact: true }).click();
  await expect(page.locator(".participant-row")).toHaveCount(2);
  await counts.getByRole("button", { name: "4 人", exact: true }).click();
  await expect(page.getByRole("button", { name: "布丁设为真人" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "芋圆设为机器人" })).toHaveAttribute("aria-pressed", "true");
  await expect(counts.getByRole("button", { pressed: true })).toHaveText("4 人");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"))).toBe(before);
  await expect(page.getByRole("button", { name: "游戏设置", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await expect(counts.getByRole("button", { pressed: true })).toHaveText("3 人");
  await expect(page.getByRole("button", { name: "布丁设为机器人" })).toHaveAttribute("aria-pressed", "true");
  await configureParticipants(page, 2);
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("little-rabbit-match-v1")!));
  expect(saved.players).toEqual([{ bot: false }, { bot: false }]);
  expect(saved.state.ctx.numPlayers).toBe(2);
  expect(saved.state.ctx.currentPlayer).toBe("0");
  expect(saved.state.G.deck).toHaveLength(52);
  expect(saved.state.G.tokens).toHaveLength(6);
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await expect(page.locator(".mode-indicator")).toHaveText("2 人对战");
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await expect(counts.getByRole("button", { pressed: true })).toHaveText("2 人");
  await expect(page.locator(".role-control button[aria-pressed=true]")).toHaveText(["真人", "真人"]);
});

test("computer matches pause in settings and in the background, and a new roster cancels old turns", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await configureParticipants(page, 2, [true, true]);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).uncheck();
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await expect(page.locator(".mode-indicator")).toHaveText("0 真人 · 2 机器人");
  await expect(page.locator(".playing-card")).toBeDisabled();
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  const before = await page.evaluate(() => window.__rabbit.client.getState()!.G.action.id);
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => window.__rabbit.client.getState()!.G.action.id)).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => window.__rabbit.client.getState()!.G.action.id)).toBe(before);
  await page.evaluate(() => {
    delete (document as Partial<Document>).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction((id) => window.__rabbit.client.getState()!.G.action.id > id, before);
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await configureParticipants(page, 2);
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.waitForTimeout(1700);
  const state = await page.evaluate(() => window.__rabbit.client.getState()!);
  expect(state.G.action.id).toBe(0);
  expect(state.G.deck).toHaveLength(52);
  expect(state.ctx.currentPlayer).toBe("0");
});

for (const capability of ["disabled", "missing-enter", "missing-exit", "webkit-disabled"] as const) {
  test(`fullscreen is hidden when ${capability}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(document, "webkitFullscreenEnabled", { value: false });
      if (mode === "disabled" || mode === "webkit-disabled")
        Object.defineProperty(document, "fullscreenEnabled", { value: false });
      if (mode === "missing-enter" || mode === "webkit-disabled")
        Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { value: undefined });
      if (mode === "missing-exit")
        Object.defineProperty(document, "exitFullscreen", { value: undefined });
      if (mode === "webkit-disabled") {
        Object.defineProperty(HTMLElement.prototype, "webkitRequestFullscreen", { value: () => {} });
        Object.defineProperty(document, "webkitExitFullscreen", { value: () => {} });
      }
    }, capability);
    await page.goto("./");
    await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
    await expect(page.getByRole("button", { name: /进入全屏|退出全屏/ })).toHaveCount(0);
  });
}

test("legacy Safari fullscreen tracks browser events and preserves the match", async ({ page }) => {
  await page.addInitScript(() => {
    let element: Element | null = null;
    Object.defineProperties(document, {
      fullscreenEnabled: { value: undefined },
      webkitFullscreenEnabled: { value: true },
      webkitFullscreenElement: { get: () => element },
      webkitExitFullscreen: { value: () => {
        element = null;
        document.dispatchEvent(new Event("webkitfullscreenchange"));
      } },
    });
    Object.defineProperties(HTMLElement.prototype, {
      requestFullscreen: { value: undefined },
      webkitRequestFullscreen: { value: () => {
        element = document.documentElement;
        document.dispatchEvent(new Event("webkitfullscreenchange"));
      } },
    });
  });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(() => window.__rabbit.client.moves.configureWeather(false));
  const before = await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"));
  await page.getByRole("button", { name: "进入全屏" }).click();
  await expect(page.getByRole("button", { name: "退出全屏" })).toHaveAttribute("data-tooltip", "退出全屏");
  await page.getByRole("button", { name: "退出全屏" }).click();
  await page.getByRole("button", { name: "进入全屏" }).click();
  await page.evaluate(() => (document as Document & { webkitExitFullscreen: () => void }).webkitExitFullscreen());
  await expect(page.getByRole("button", { name: "进入全屏" })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"))).toBe(before);
});

test("a rejected fullscreen request keeps the current match and shows feedback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      value: () => Promise.reject(new Error("Fullscreen denied")),
    });
  });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(() => window.__rabbit.client.moves.configureWeather(false));
  const before = await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"));
  await page.getByRole("button", { name: "进入全屏" }).click();
  await expect(page.getByText("暂时无法切换全屏", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入全屏" })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1"))).toBe(before);
  expect(errors).toEqual([]);
});

test("players have independent computer controls and draw from the same 52-card deck", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await configureParticipants(page, 4, [true, false, true, false]);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).uncheck();
  await page.screenshot({
    path: "artifacts/participant-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await page.waitForFunction(
    () => window.__rabbit.client.getState()!.ctx.currentPlayer === "1",
  );
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("little-rabbit-match-v1")!),
  );
  expect(saved.players).toEqual([
    { bot: true },
    { bot: false },
    { bot: true },
    { bot: false },
  ]);
  expect(saved.state.G.deck).toHaveLength(51);
  await expect(page.locator(".playing-card")).toHaveAttribute(
    "data-player",
    "1",
  );
  await expect(page.locator(".card-owner")).toHaveText("蓝莓");
  const blue = await page
    .locator(".playing-card")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await page.waitForFunction(
    () => window.__rabbit.client.getState()!.G.card !== null,
  );
  expect(
    await page
      .locator(".playing-card")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(blue);
});

test("card backs and revealed faces use their owner's color", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await configureParticipants(page, 2);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).uncheck();
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(() => {
    const client = window.__rabbit.client;
    const state = structuredClone(client.store.getState());
    state.G.deck = [1, 1];
    client.store.dispatch({ type: "RESET", state, clientOnly: true });
  });
  const pink = await page
    .locator(".playing-card")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  expect(
    await page
      .locator(".playing-card")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(pink);
  await page.getByRole("button", { name: "选择 1 号兔" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const blue = await page
    .locator(".playing-card")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(blue).not.toBe(pink);
  await expect(page.locator(".card-owner")).toHaveText("蓝莓");
  await page.screenshot({
    path: "artifacts/player-colored-card.png",
    fullPage: true,
  });
});

test("fullscreen can be entered and exited without resetting the game or camera", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(() =>
    window.__rabbit.client.moves.configureWeather(false),
  );
  const before = await page.evaluate(() => ({
    turn: window.__rabbit.client.getState()!.ctx.turn,
    position: window.__rabbit.diagnostics().cameraPosition,
  }));
  await page.getByRole("button", { name: "进入全屏" }).click();
  await expect(page.getByRole("button", { name: "退出全屏" })).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(
    true,
  );
  await page.getByRole("button", { name: "退出全屏" }).click();
  await expect(page.getByRole("button", { name: "进入全屏" })).toBeVisible();
  const after = await page.evaluate(() => ({
    turn: window.__rabbit.client.getState()!.ctx.turn,
    position: window.__rabbit.diagnostics().cameraPosition,
  }));
  expect(after.turn).toBe(before.turn);
  after.position.forEach((coordinate, i) =>
    expect(coordinate).toBeCloseTo(before.position[i], 5),
  );
});
