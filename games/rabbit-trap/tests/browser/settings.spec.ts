import { test, expect } from "@playwright/test";
import type {} from "./game.spec";
import { configureParticipants } from "./fixtures";

test("players have independent computer controls and draw from the same 52-card deck", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  await configureParticipants(page, 4, [true, false, true, false]);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).uncheck();
  await page.screenshot({
    path: "artifacts/participant-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "出发，去胡萝卜山！" }).click();
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
  await page.getByRole("button", { name: "新的一局", exact: true }).click();
  await configureParticipants(page, 2);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).uncheck();
  await page.getByRole("button", { name: "出发，去胡萝卜山！" }).click();
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
