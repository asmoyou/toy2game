import { test, expect, type Page } from "@playwright/test";
import type { RabbitState, Card } from "../../src/game";
import type { Client } from "boardgame.io/client";
import { FINISH, TRAPS, TRAP_PATTERNS } from "../../src/world";
import type { RabbitScene } from "../../src/scene";
import { classicFixture, configureParticipants } from "./fixtures";

declare global {
  interface Window {
    __rabbit: {
      client: ReturnType<typeof Client<RabbitState>>;
      diagnostics: RabbitScene["getDiagnostics"];
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.waitForFunction(
    () => window.__rabbit?.diagnostics()?.meshes > 100,
  );
  await classicFixture(page);
});

async function newMatch(page: Page, name: string, classic = true) {
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  const count = name === "双人同行" ? 2 : name === "四人派对" ? 4 : 3;
  await configureParticipants(
    page,
    count,
    name === "单人冒险" ? [false, true, true] : [],
  );
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  if (classic) await classicFixture(page);
}

async function setDeck(page: Page, cards: Card[]) {
  await page.evaluate((deck) => {
    const client = window.__rabbit.client;
    const state = structuredClone(client.store.getState());
    state.G.deck = deck;
    client.store.dispatch({ type: "RESET", state, clientOnly: true });
  }, cards);
}

test("renders a nonblank board without overflow at desktop and mobile sizes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 1920, height: 1080 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const action = document
        .querySelector(".action-area")!
        .getBoundingClientRect();
      const roster = document
        .querySelector(".players")!
        .getBoundingClientRect();
      const diagnostics = window.__rabbit.diagnostics();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        action: { top: action.top, bottom: action.bottom },
        rosterBottom: roster.bottom,
        diagnostics,
      };
    });
    expect(result.overflow).toBe(false);
    expect(result.action.top).toBeGreaterThan(result.rosterBottom);
    expect(result.diagnostics.nonTransparentPixels).toBeGreaterThan(500);
    expect(result.diagnostics.triangles).toBeGreaterThan(10000);
    await page.screenshot({
      path: `artifacts/viewport-${viewport.width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("draws a card, selects a rabbit directly in 3D, and runs both computer turns", async ({
  page,
}) => {
  await setDeck(page, [1, 1, 2]);
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  const rabbit = await page.evaluate(
    () => window.__rabbit.diagnostics().tokens[0],
  );
  await page.mouse.click(rabbit.screen.x, rabbit.screen.y);
  await page.waitForFunction(
    () => window.__rabbit.client.getState()!.G.tokens[0].position === 1,
  );
  await page.waitForTimeout(170);
  const airborne = await page.evaluate(
    () => window.__rabbit.diagnostics().tokens[0].position,
  );
  expect(airborne).not.toEqual(rabbit.position);
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled({
    timeout: 18000,
  });
  const state = await page.evaluate(() => window.__rabbit.client.getState()!);
  expect(state.ctx.currentPlayer).toBe("0");
  expect(state.ctx.turn).toBe(4);
  expect(state.G.tokens.filter((t) => t.position >= 0)).toHaveLength(3);
  await page.screenshot({
    path: "artifacts/desktop-playing.png",
    fullPage: true,
  });
});

test("restores a pending card after reload, then reshuffles the deck correctly", async ({
  page,
}) => {
  await newMatch(page, "双人同行");
  await setDeck(page, [2]);
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 2 号兔" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "选择 2 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 2 号兔" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("heading", { name: "前进 2 格" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  const state = await page.evaluate(() => window.__rabbit.client.getState()!);
  expect(state.ctx.currentPlayer).toBe("1");
  expect(state.G.tokens[1].position).toBe(1);
  expect(state.G.card).toBe(2);
});

test("animates a trap, eliminates affected rabbits, and can close the lids again", async ({
  page,
}) => {
  await newMatch(page, "双人同行");
  await page.evaluate((trap) => {
    const state = structuredClone(window.__rabbit.client.store.getState());
    state.G.tokens[0].position = trap;
    state.G.tokens[1].position = trap;
    state.G.tokens[3].position = trap;
    state.G.deck = ["carrot", "carrot"];
    localStorage.setItem(
      "little-rabbit-match-v1",
      JSON.stringify({ version: 1, mode: "duo", state }),
    );
  }, TRAPS[0]);
  await page.reload();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "转动胡萝卜" })).toBeEnabled();
  await page.getByRole("button", { name: "转动胡萝卜" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const fallen = await page.evaluate(() =>
    window.__rabbit
      .diagnostics()
      .tokens.filter((t) => !t.visible)
      .map((t) => t.id),
  );
  expect(fallen).toEqual(["0-0", "0-1", "1-0"]);
  await page.screenshot({ path: "artifacts/trap-open.png", fullPage: true });
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "转动胡萝卜" })).toBeEnabled();
  await page.getByRole("button", { name: "转动胡萝卜" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  expect(
    await page.evaluate(() => window.__rabbit.client.getState()!.G.holes),
  ).toEqual(TRAP_PATTERNS[2]);
  await page.screenshot({ path: "artifacts/trap-closed.png", fullPage: true });
});

test("shows a victory and restarts in four-player mode on mobile", async ({
  page,
}) => {
  await newMatch(page, "双人同行");
  await page.evaluate((finish) => {
    const state = structuredClone(window.__rabbit.client.store.getState());
    state.G.tokens[0].position = finish - 1;
    state.G.deck = [2];
    localStorage.setItem(
      "little-rabbit-match-v1",
      JSON.stringify({ version: 1, mode: "duo", state }),
    );
  }, FINISH);
  await page.reload();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 1 号兔" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "桃桃，摘得胡萝卜！" }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/victory.png", fullPage: true });
  await expect(page.locator("img.winner-portrait")).toBeVisible();
  await page.waitForFunction(
    () =>
      (document.querySelector("img.winner-portrait") as HTMLImageElement)
        ?.naturalWidth > 0,
  );
  const portraitPixels = await page
    .locator("img.winner-portrait")
    .evaluate((element: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const context = canvas.getContext("2d")!;
      context.drawImage(element, 0, 0, 64, 64);
      return [...context.getImageData(0, 0, 64, 64).data].filter(
        (value, i) => i % 4 === 3 && value > 0,
      ).length;
    });
  expect(portraitPixels).toBeGreaterThan(400);
  await expect(page.getByRole("table", { name: "本局成绩" })).toBeVisible();
  const seated = await page.evaluate(() => window.__rabbit.diagnostics());
  expect(seated.winnerId).toBe("0-0");
  expect(seated.tokens[0].position).toEqual(seated.throne);
  expect(seated.tokens[0].scale[1]).toBeCloseTo(0.92);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({
    path: "artifacts/throne-winner-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "artifacts/throne-winner-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  const restored = await page.evaluate(() => window.__rabbit.diagnostics());
  expect(restored.tokens[0].position).toEqual(restored.throne);
  const finishedMatch = await page.evaluate(() => localStorage.getItem("little-rabbit-match-v1")!);
  await page.getByRole("button", { name: "再来一场冒险" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.__rabbit.client.getState()!.ctx.numPlayers)).toBe(2);
  await page.evaluate((saved) => localStorage.setItem("little-rabbit-match-v1", saved), finishedMatch);
  await page.reload();
  await page.getByRole("button", { name: "换个阵容", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "游戏设置", exact: true })).toBeVisible();
  await configureParticipants(page, 4);
  await page.getByRole("button", { name: "按此设置开始新局" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().tokens.length),
  ).toBe(12);
  await page.screenshot({ path: "artifacts/mobile-party.png", fullPage: true });
});

test("numbers every rabbit and previews the exact route in green", async ({
  page,
}) => {
  const tokens = await page.evaluate(
    () => window.__rabbit.diagnostics().tokens,
  );
  expect(tokens.every((t) => t.numbered)).toBe(true);
  expect(tokens.map((t) => t.number)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
  await setDeck(page, [3]);
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 1 号兔" }).hover();
  const previews = await page.evaluate(
    () => window.__rabbit.diagnostics().previews,
  );
  expect(previews).toHaveLength(3);
  expect(previews.map((p) => p.color)).toEqual(["16883e", "16883e", "16883e"]);
  await page.screenshot({
    path: "artifacts/numbers-green-preview.png",
    fullPage: true,
  });
});

test("shares a tile without extra movement and restores the same grouped layout", async ({
  page,
}) => {
  await newMatch(page, "双人同行");
  await page.evaluate(() => {
    const state = structuredClone(window.__rabbit.client.store.getState());
    state.G.tokens[0].position = 1;
    state.G.tokens[1].position = 3;
    state.G.tokens[3].position = 3;
    state.G.deck = [1, 2];
    localStorage.setItem(
      "little-rabbit-match-v1",
      JSON.stringify({ version: 1, mode: "duo", state }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 1 号兔" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const shared = await page.evaluate(() => ({
    G: window.__rabbit.client.getState()!.G,
    scene: window.__rabbit.diagnostics(),
  }));
  expect(shared.G.action.route).toEqual([2, 3]);
  expect(
    shared.G.tokens.filter((t) => t.position === 3).map((t) => t.id),
  ).toEqual(["0-0", "0-1", "1-0"]);
  const cluster = shared.scene.tokens.filter((t) =>
    ["0-0", "0-1", "1-0"].includes(t.id),
  );
  expect(new Set(cluster.map((t) => JSON.stringify(t.position))).size).toBe(3);
  expect(cluster.every((t) => t.visible && t.scale[0] < 1)).toBe(true);
  await page.screenshot({
    path: "artifacts/shared-tile-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "artifacts/shared-tile-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 1 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 1 号兔" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  expect(
    await page.evaluate(
      () => window.__rabbit.client.getState()!.G.tokens[3].position,
    ),
  ).toBe(4);
  const before = await page.evaluate(() =>
    window.__rabbit
      .diagnostics()
      .tokens.map((t) => ({ id: t.id, position: t.position, scale: t.scale })),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const after = await page.evaluate(() =>
    window.__rabbit
      .diagnostics()
      .tokens.map((t) => ({ id: t.id, position: t.position, scale: t.scale })),
  );
  before.forEach((token, i) =>
    token.position.forEach((value, axis) =>
      expect(after[i].position[axis]).toBeCloseTo(value, 5),
    ),
  );
});

test("keeps twelve rabbits distinct on one tile and allows choosing one on mobile", async ({
  page,
}) => {
  await newMatch(page, "四人派对");
  await page.evaluate(() => {
    const state = structuredClone(window.__rabbit.client.store.getState());
    state.G.tokens.forEach((token: RabbitState["tokens"][number]) => {
      token.position = 6;
    });
    state.G.deck = [1];
    localStorage.setItem(
      "little-rabbit-match-v1",
      JSON.stringify({ version: 1, mode: "party", state }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const tokens = await page.evaluate(
    () => window.__rabbit.diagnostics().tokens,
  );
  expect(tokens).toHaveLength(12);
  expect(new Set(tokens.map((t) => JSON.stringify(t.position))).size).toBe(12);
  expect(tokens.every((t) => t.visible && t.numbered && t.scale[0] > 0.3)).toBe(
    true,
  );
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "选择 3 号兔" })).toBeEnabled();
  await page.getByRole("button", { name: "选择 3 号兔" }).click();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  const moved = await page.evaluate(
    () => window.__rabbit.client.getState()!.G.tokens,
  );
  expect(moved[2].position).toBe(7);
  expect(moved.filter((t) => t.position === 6)).toHaveLength(11);
});

test("seats the surviving team's rabbit on the throne too", async ({
  page,
}) => {
  await newMatch(page, "双人同行");
  await page.evaluate((trap) => {
    const state = structuredClone(window.__rabbit.client.store.getState());
    state.G.tokens.forEach((token: RabbitState["tokens"][number]) => {
      token.position = -2;
    });
    state.G.tokens[0].position = trap;
    state.G.tokens[3].position = -1;
    state.G.deck = ["carrot"];
    localStorage.setItem(
      "little-rabbit-match-v1",
      JSON.stringify({ version: 1, mode: "duo", state }),
    );
  }, TRAPS[0]);
  await page.reload();
  await page.getByRole("button", { name: "抽一张卡牌" }).click();
  await expect(page.getByRole("button", { name: "转动胡萝卜" })).toBeEnabled();
  await page.getByRole("button", { name: "转动胡萝卜" }).click();
  await expect(
    page.getByRole("heading", { name: "蓝莓，摘得胡萝卜！" }),
  ).toBeVisible();
  const diagnostics = await page.evaluate(() => window.__rabbit.diagnostics());
  expect(diagnostics.winnerId).toBe("1-0");
  expect(diagnostics.tokens[3].position).toEqual(diagnostics.throne);
});

test("supports camera rotation, zoom, reset, pause, rules and sound controls", async ({
  page,
}) => {
  const original = await page.evaluate(
    () => window.__rabbit.diagnostics().tokens[0].screen,
  );
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await page.waitForTimeout(100);
  const zoomed = await page.evaluate(
    () => window.__rabbit.diagnostics().tokens[0].screen,
  );
  expect(zoomed).not.toEqual(original);
  await page.getByRole("button", { name: "重置视角" }).click();
  await page.getByRole("button", { name: "环绕查看" }).click();
  await page.waitForTimeout(600);
  expect(
    await page.evaluate(() => window.__rabbit.diagnostics().tokens[0].screen),
  ).not.toEqual(original);
  await page.getByRole("button", { name: "停止旋转" }).click();
  await page.getByRole("button", { name: "重置视角" }).click();
  await page.getByRole("button", { name: "开启音效" }).click();
  await expect(page.getByRole("button", { name: "关闭音效" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "暂停游戏" }).click();
  await expect(page.getByRole("button", { name: "继续冒险" })).toBeEnabled();
  await page.getByRole("button", { name: "继续冒险" }).click();
  await page.getByRole("button", { name: "游戏规则" }).click();
  await expect(
    page.getByRole("heading", { name: "胡萝卜山的冒险约定" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
  await newMatch(page, "双人同行", false);
  await expect(page.getByRole("button", { name: "关闭音效" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("plays on a touch device by tapping a rabbit in the canvas", async ({
  browser,
}) => {
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mobile.goto("./");
  await expect(
    mobile.getByRole("button", { name: "抽一张卡牌" }),
  ).toBeEnabled();
  await setDeck(mobile, [1, 1, 2]);
  await mobile.getByRole("button", { name: "抽一张卡牌" }).tap();
  await expect(
    mobile.getByRole("button", { name: "选择 1 号兔" }),
  ).toBeEnabled();
  const rabbit = await mobile.evaluate(
    () => window.__rabbit.diagnostics().tokens[0],
  );
  await mobile.touchscreen.tap(rabbit.screen.x, rabbit.screen.y);
  await mobile.waitForFunction(
    () => window.__rabbit.client.getState()!.G.tokens[0].position === 1,
  );
  await mobile.getByRole("button", { name: "暂停游戏" }).tap();
  await mobile.waitForTimeout(1000);
  const moved = await mobile.evaluate(
    () => window.__rabbit.diagnostics().tokens[0],
  );
  expect(moved.position).not.toEqual(rabbit.position);
  expect(moved.visible).toBe(true);
  await mobile.screenshot({
    path: "artifacts/mobile-playing.png",
    fullPage: true,
  });
  await mobile.close();
});
