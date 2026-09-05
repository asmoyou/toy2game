import { test, expect, type Page } from "@playwright/test";
import type {} from "./game.spec";
import { configureParticipants } from "./fixtures";
import { PATH } from "../../src/world";

test.use({
  viewport: { width: 1180, height: 820 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});

async function setup(page: Page, strikeOnRabbit: boolean, allStunned = false) {
  await page.goto("./");
  await page.getByRole("button", { name: "新的一局", exact: true }).tap();
  await configureParticipants(page, 2);
  await page.getByRole("checkbox", { name: "雷云天气", exact: true }).check();
  await page.getByRole("button", { name: "出发，去胡萝卜山！" }).tap();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(
    ({ point, strikeOnRabbit, allStunned }) => {
      const state = structuredClone(window.__rabbit.client.store.getState());
      state.G.deck = [2, 1, 1];
      if (strikeOnRabbit) state.G.tokens[0].position = 7;
      if (allStunned)
        state.G.tokens
          .filter((token: { player: number }) => token.player === 0)
          .forEach((token: { position: number }) => {
            token.position = 7;
          });
      state.G.weather.from = strikeOnRabbit ? point : [-5, -6];
      state.G.weather.to = strikeOnRabbit ? point : [5, -6];
      state.G.weather.duration = 9;
      state.G.weather.elapsed = 0;
      state.G.weather.strikeIn = 1.2;
      state.G.weather.revision++;
      localStorage.setItem(
        "little-rabbit-match-v1",
        JSON.stringify({
          version: 1,
          players: [{ bot: false }, { bot: false }],
          state,
        }),
      );
    },
    { point: PATH[7], strikeOnRabbit, allStunned },
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
}

test("the cloud remains present, drifts smoothly, strikes empty ground and pauses with the game", async ({
  page,
}) => {
  await setup(page, false);
  const before = await page.evaluate(() => window.__rabbit.diagnostics());
  expect(before.cloudVisible).toBe(true);
  await page.waitForFunction(
    () => window.__rabbit.client.getState()!.G.weather.strikes > 0,
  );
  await page.waitForFunction(
    () => window.__rabbit.diagnostics().lightningVisible,
  );
  await page.screenshot({
    path: "artifacts/ipad-empty-lightning.png",
    fullPage: true,
  });
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const after = await page.evaluate(() => ({
    G: window.__rabbit.client.getState()!.G,
    scene: window.__rabbit.diagnostics(),
  }));
  expect(after.G.weather.lastStrike?.hits).toEqual([]);
  expect(after.scene.cloudVisible).toBe(true);
  expect(after.scene.cloudPosition).not.toEqual(before.cloudPosition);
  after.scene.cameraPosition.forEach((coordinate, i) =>
    expect(coordinate).toBeCloseTo(before.cameraPosition[i], 5),
  );
  await page.getByRole("button", { name: "暂停游戏" }).tap();
  await page.waitForTimeout(150);
  const paused = await page.evaluate(
    () => window.__rabbit.diagnostics().cloudPosition,
  );
  await page.waitForTimeout(800);
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().cloudPosition),
  ).toEqual(paused);
  await page.getByRole("button", { name: "继续冒险" }).tap();
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().cloudPosition),
  ).not.toEqual(paused);
});

test("lightning disables a rabbit for one team turn, persists on reload and recovers after another rabbit moves", async ({
  page,
}) => {
  await setup(page, true);
  await page.waitForFunction(
    () => window.__rabbit.diagnostics().tokens[0].stunned,
  );
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.getByRole("button", { name: "抽一张卡牌" }).tap();
  await expect(page.getByRole("button", { name: "选择 2 号兔" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "选择 1 号兔" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "artifacts/ipad-stunned-rabbit.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "选择 2 号兔" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "选择 1 号兔" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().tokens[0].stunned),
  ).toBe(true);
  await page.getByRole("button", { name: "选择 2 号兔" }).tap();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().tokens[0].stunned),
  ).toBe(false);
});

test("all stunned rabbits can rest without drawing or getting stuck", async ({
  page,
}) => {
  await setup(page, true, true);
  await expect(page.getByRole("button", { name: "休息一回合" })).toBeEnabled();
  const deck = await page.evaluate(
    () => window.__rabbit.client.getState()!.G.deck,
  );
  await page.getByRole("button", { name: "休息一回合" }).tap();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const state = await page.evaluate(() => ({
    state: window.__rabbit.client.getState()!,
    scene: window.__rabbit.diagnostics(),
  }));
  expect(state.state.ctx.currentPlayer).toBe("1");
  expect(state.state.G.deck).toEqual(deck);
  expect(state.scene.tokens.filter((token) => token.stunned)).toHaveLength(0);
});

test("random items are centered inside their tiles and the manual camera does not move during play", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.evaluate(() =>
    window.__rabbit.client.moves.configureWeather(false),
  );
  const before = await page.evaluate(() => window.__rabbit.diagnostics());
  expect(before.features).toHaveLength(8);
  for (const prop of before.featurePositions) {
    expect(prop.position[0]).toBeCloseTo(PATH[prop.index][0], 6);
    expect(prop.position[2]).toBeCloseTo(PATH[prop.index][1], 6);
  }
  expect(before.following).toBe(false);
  await page.getByRole("button", { name: "跟随小兔" }).tap();
  await page.mouse.move(600, 350);
  await page.mouse.down();
  await page.mouse.move(665, 380, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "跟随小兔" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().following),
  ).toBe(false);
  await page.getByRole("button", { name: "重置视角" }).tap();
  await page.screenshot({
    path: "artifacts/ipad-random-centered-items.png",
    fullPage: true,
  });
});
