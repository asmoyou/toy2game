import { expect, type Page } from "@playwright/test";
import { FEATURE_TILES } from "../../src/world";
import type {} from "./game.spec";

export async function configureParticipants(
  page: Page,
  count: number,
  bots: boolean[] = [],
) {
  await page
    .getByLabel("玩家人数", { exact: true })
    .selectOption(String(count));
  const controls = page.getByRole("checkbox", { name: /电脑控制/ });
  for (let i = 0; i < count; i++)
    await controls.nth(i).setChecked(bots[i] ?? false);
}

export async function classicFixture(page: Page) {
  await page.evaluate((layout) => {
    const state = structuredClone(window.__rabbit.client.store.getState());
    state.G.features = layout;
    state.G.weather.enabled = false;
    const mode =
      state.ctx.numPlayers === 3
        ? "solo"
        : state.ctx.numPlayers === 2
          ? "duo"
          : "party";
    localStorage.setItem(
      "little-rabbit-match-v1",
      JSON.stringify({ version: 1, mode, state }),
    );
  }, FEATURE_TILES);
  await page.reload();
  await expect(page.getByRole("button", { name: "抽一张卡牌" })).toBeEnabled();
}
