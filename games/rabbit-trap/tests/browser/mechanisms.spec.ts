import { test, expect, type Page } from "@playwright/test";
import type {} from "./game.spec";
import { TRAPS } from "../../src/world";
import { classicFixture, configureParticipants } from "./fixtures";

test.use({
  viewport: { width: 1180, height: 820 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});

async function startFixture(
  page: Page,
  position: number,
  shield = false,
  carrot = false,
) {
  await page.goto("./");
  await page.getByRole("button", { name: "游戏设置", exact: true }).tap();
  await configureParticipants(page, 2);
  await page.getByRole("button", { name: "按此设置开始新局" }).tap();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await classicFixture(page);
  await page.evaluate(
    ({ position, shield, carrot }) => {
      const state = structuredClone(window.__rabbit.client.store.getState());
      state.G.tokens[0].position = position;
      state.G.tokens[0].shield = shield;
      state.G.deck = [carrot ? "carrot" : 1];
      localStorage.setItem(
        "little-rabbit-match-v1",
        JSON.stringify({ version: 1, mode: "duo", state }),
      );
    },
    { position, shield, carrot },
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
}

for (const fixture of [
  { kind: "spring", tile: 5, destination: 8 },
  { kind: "wind", tile: 11, destination: 9 },
  { kind: "slide", tile: 15, destination: 8 },
]) {
  test(`iPad ${fixture.kind} executes its movement and visible effects before the next turn`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await startFixture(page, fixture.tile - 1);
    await page.getByRole("button", { name: "抽一张卡牌" }).tap();
    await expect(
      page.getByRole("button", { name: "选择 1 号兔" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "选择 1 号兔" }).hover();
    const previews = await page.evaluate(
      () => window.__rabbit.diagnostics().previews,
    );
    expect(previews.length).toBeGreaterThan(1);
    await page.getByRole("button", { name: "选择 1 号兔" }).tap();
    await page.waitForFunction(
      () => window.__rabbit.diagnostics().activeEffects > 0,
    );
    await page.screenshot({
      path: `artifacts/ipad-${fixture.kind}-effect.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole("button", { name: "抽一张卡牌" }),
    ).toBeEnabled();
    const result = await page.evaluate(() => ({
      state: window.__rabbit.client.getState()!,
      scene: window.__rabbit.diagnostics(),
    }));
    expect(result.state.G.tokens[0].position).toBe(fixture.destination);
    expect(result.state.G.action.route).toEqual([fixture.tile]);
    expect(result.state.G.action.effects?.[0].kind).toBe(fixture.kind);
    expect(result.scene.tokens[0].visible).toBe(true);
    expect(result.scene.nonTransparentPixels).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
}

test("iPad shield pickup appears on the rabbit and remains after reloading", async ({
  page,
}) => {
  await startFixture(page, 2);
  await page.getByRole("button", { name: "抽一张卡牌" }).tap();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 1 号兔" }).tap();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => window.__rabbit.diagnostics().tokens[0].shieldVisible,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/ipad-shield-pickup.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => window.__rabbit.diagnostics().tokens[0].shieldVisible,
    ),
  ).toBe(true);
});

test("iPad carrot rotation lights the mechanism and a shield prevents the matching fall", async ({
  page,
}) => {
  await startFixture(page, TRAPS[0], true, true);
  await page.getByRole("button", { name: "开启音效" }).tap();
  await page.getByRole("button", { name: "抽一张卡牌" }).tap();
  await expect(page.getByRole("button", { name: "转动胡萝卜" })).toBeEnabled();
  await page.getByRole("button", { name: "转动胡萝卜" }).tap();
  await page.waitForFunction(
    () => window.__rabbit.diagnostics().mechanismGlow > 0.1,
  );
  await page.waitForFunction(() => window.__rabbit.diagnostics().litTraps > 0);
  await page.screenshot({
    path: "artifacts/ipad-carrot-mechanism.png",
    fullPage: true,
  });
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const result = await page.evaluate(() => ({
    state: window.__rabbit.client.getState()!,
    scene: window.__rabbit.diagnostics(),
  }));
  expect(result.state.G.tokens[0].position).toBe(TRAPS[0] - 1);
  expect(result.state.G.tokens[0].shield).toBe(false);
  expect(result.scene.tokens[0].shieldVisible).toBe(false);
  expect(result.scene.tokens[0].visible).toBe(true);
  expect(
    result.state.G.action.effects?.some((effect) => effect.kind === "blocked"),
  ).toBe(true);
});
