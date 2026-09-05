import { describe, expect, it, vi } from "vitest";
import { Client } from "boardgame.io/client";
import {
  chooseToken,
  FINISH,
  RabbitGame,
  routeFor,
  upgradeSavedGame,
  resolveLanding,
  isStunned,
  movableTokens,
  type RabbitState,
} from "../src/game";
import {
  GROUND_COUNT,
  STAR_TILES,
  TRAPS,
  TRAP_PATTERNS,
  FEATURE_TILES,
  PATH,
} from "../src/world";
import { cloudPosition, createWeather } from "../src/weather";

function createClient(
  seed = "rabbit-test",
  options: { weather?: boolean; randomMap?: boolean } = {},
) {
  const client = Client<RabbitState>({
    game: { ...RabbitGame, seed },
    numPlayers: 3,
    debug: false,
  });
  client.moves.configureWeather(options.weather ?? false);
  if (!options.randomMap) {
    const state = structuredClone(client.store.getState());
    state.G.features = FEATURE_TILES.map((tile) => ({ ...tile }));
    client.store.dispatch({ type: "RESET", state, clientOnly: true });
  }
  return client;
}
type TestClient = ReturnType<typeof createClient>;

function arrange(client: TestClient, update: (G: RabbitState) => void) {
  const state = structuredClone(client.store.getState());
  update(state.G);
  client.store.dispatch({ type: "RESET", state, clientOnly: true });
}

describe("Little Rabbit game rules", () => {
  it("starts with three rabbits per team and a shuffled shared 52-card deck", () => {
    const state = createClient().getState()!;
    expect(state.G.tokens).toHaveLength(9);
    expect(state.G.tokens.every((t) => t.position === -1)).toBe(true);
    expect(state.G.deck).toHaveLength(52);
    expect(state.G.deck.filter((card) => card === 1)).toHaveLength(18);
    expect(state.G.deck.filter((card) => card === 2)).toHaveLength(16);
    expect(state.G.deck.filter((card) => card === 3)).toHaveLength(10);
    expect(state.G.deck.filter((card) => card === "carrot")).toHaveLength(8);
    expect(state.ctx.currentPlayer).toBe("0");
  });

  it("draws, moves the chosen rabbit and advances the turn exactly once", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.deck = [2];
    });
    client.moves.draw();
    expect(client.getState()!.G.stage).toBe("select");
    expect(client.getState()!.ctx.currentPlayer).toBe("0");
    client.moves.hop("0-1");
    expect(client.getState()!.G.tokens[1].position).toBe(1);
    expect(client.getState()!.ctx.currentPlayer).toBe("1");
    expect(client.getState()!.G.discard).toEqual([2]);
  });

  it("rejects a second draw, a wrong-team move and a move before drawing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = createClient();
      arrange(client, (G) => {
        G.deck = [1, 2];
      });
      client.moves.hop("0-0");
      expect(client.getState()!.G.action.id).toBe(0);
      client.moves.draw();
      client.moves.draw();
      client.moves.hop("1-0");
      expect(client.getState()!.G.deck).toEqual([1]);
      expect(client.getState()!.G.action.id).toBe(1);
      expect(client.getState()!.ctx.currentPlayer).toBe("0");
    } finally {
      error.mockRestore();
    }
  });

  it("counts occupied tiles as normal steps and allows sharing the destination", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[3].position = 0;
      G.tokens[6].position = 1;
      G.deck = [2];
    });
    const G = client.getState()!.G;
    expect(routeFor(G.tokens[0], 2)).toEqual([0, 1]);
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.G.tokens[0].position).toBe(1);
    expect(client.getState()!.G.tokens[6].position).toBe(1);
  });

  it("allows three rabbits from the same and different teams on one tile", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[1].position = 1;
      G.tokens[3].position = 1;
      G.deck = [2];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(
      client
        .getState()!
        .G.tokens.filter((t) => t.position === 1)
        .map((t) => t.id),
    ).toEqual(["0-0", "0-1", "1-0"]);
  });

  it("leaves a shared tile by the exact card count even if the next tile is occupied", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = 1;
      G.tokens[1].position = 1;
      G.tokens[3].position = 2;
      G.tokens[6].position = 3;
      G.deck = [2];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.G.action.route).toEqual([2, 3]);
    expect(client.getState()!.G.tokens[0].position).toBe(3);
    expect(client.getState()!.G.tokens[1].position).toBe(1);
  });

  it("allows jumping over a hole but eliminates a rabbit that lands in it", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.holes = [0];
      G.deck = [1, 2];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.G.tokens[0].position).toBe(1);
    client.moves.draw();
    client.moves.hop("1-0");
    expect(client.getState()!.G.tokens[3].position).toBe(-2);
  });

  it("switches all traps together and drops rabbits from both teams", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.deck = ["carrot"];
      G.tokens[0].position = TRAPS[0];
      G.tokens[3].position = TRAPS[3];
    });
    client.moves.draw();
    client.moves.rotate();
    const { G, ctx } = client.getState()!;
    expect(G.holes).toEqual(TRAP_PATTERNS[1]);
    expect(G.action.fallen).toEqual(["0-0", "1-0"]);
    expect(G.tokens[0].position).toBe(-2);
    expect(G.tokens[3].position).toBe(-2);
    expect(ctx.currentPlayer).toBe("1");
  });

  it("skips teams whose three rabbits have been eliminated", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens
        .filter((t) => t.player === 1)
        .forEach((t) => {
          t.position = -2;
        });
      G.deck = [1];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.ctx.currentPlayer).toBe("2");
  });

  it("drops every rabbit sharing a tile when that trap opens", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = TRAPS[0];
      G.tokens[1].position = TRAPS[0];
      G.tokens[3].position = TRAPS[0];
      G.deck = ["carrot"];
    });
    client.moves.draw();
    client.moves.rotate();
    expect(client.getState()!.G.action.fallen).toEqual(["0-0", "0-1", "1-0"]);
    expect(
      client.getState()!.G.tokens.filter((t) => t.position === -2),
    ).toHaveLength(3);
  });

  it("awards the summit to the first rabbit, including overshoot", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = FINISH - 2;
      G.deck = [3];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.ctx.gameover).toEqual({
      winner: "0",
      reason: "summit",
    });
    expect(client.getState()!.G.tokens[0].position).toBe(FINISH);
  });

  it("awards the last surviving team after a trap", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens
        .filter((t) => t.player !== 0)
        .forEach((t) => {
          t.position = -2;
        });
      G.tokens[3].position = TRAPS[0];
      G.deck = ["carrot"];
    });
    client.moves.draw();
    client.moves.rotate();
    expect(client.getState()!.ctx.gameover).toEqual({
      winner: "0",
      reason: "survivor",
    });
  });

  it("ends in a draw if a mechanism eliminates every remaining team", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens.forEach((t) => {
        t.position = -2;
      });
      G.tokens[0].position = TRAPS[0];
      G.tokens[3].position = TRAPS[3];
      G.deck = ["carrot"];
    });
    client.moves.draw();
    client.moves.rotate();
    expect(client.getState()!.ctx.gameover).toEqual({ draw: true });
  });

  it("reshuffles the discard pile and restores the exact random state from a save", () => {
    const first = createClient();
    arrange(first, (G) => {
      G.deck = [];
      G.discard = [1, 2, 3, "carrot", 2, 1];
    });
    const second = createClient("different-seed");
    const saved = JSON.parse(JSON.stringify(first.store.getState()));
    second.store.dispatch({ type: "RESET", state: saved, clientOnly: true });
    first.moves.draw();
    second.moves.draw();
    expect(first.getState()!.G).toEqual(second.getState()!.G);
    expect(first.getState()!.G.deck).toHaveLength(5);
    expect(first.getState()!.G.discard).toEqual([]);
  });

  it("the computer avoids landing in an open trap when a safe move exists", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.card = 1;
      G.tokens[0].position = TRAPS[1] - 1;
    });
    expect(chooseToken(client.getState()!.G, 0)).toBe("0-1");
  });

  it("completes 40 seeded matches without stalled turns or extra movement", () => {
    for (let seed = 0; seed < 40; seed++) {
      const client = createClient(`simulation-${seed}`);
      let actions = 0;
      while (!client.getState()!.ctx.gameover && actions < 1200) {
        const { G, ctx } = client.getState()!;
        if (G.stage === "draw") client.moves.draw();
        else if (G.stage === "rotate") client.moves.rotate();
        else client.moves.hop(chooseToken(G, Number(ctx.currentPlayer))!);
        const next = client.getState()!.G;
        if (next.action.kind === "move") {
          const from = G.tokens.find(
            (t) => t.id === next.action.token,
          )!.position;
          const destination = Math.min(from + Number(G.card), FINISH);
          expect(next.action.route).toEqual(
            Array.from({ length: destination - from }, (_, i) => from + i + 1),
          );
          let resolved = destination;
          for (const effect of next.action.effects ?? []) {
            expect(effect.from).toBe(resolved);
            if (effect.kind === "spring")
              expect(effect.to).toBe(Math.min(FINISH, effect.from + 3));
            if (effect.kind === "wind")
              expect(effect.to).toBe(Math.max(0, effect.from - 2));
            resolved = effect.to;
          }
          expect(
            next.tokens.find((t) => t.id === next.action.token)!.position,
          ).toBe(resolved);
        }
        expect(client.getState()!.G.action.id).toBe(G.action.id + 1);
        actions++;
      }
      expect(client.getState()!.ctx.gameover).toBeTruthy();
      client.stop();
    }
  }, 15000);

  it("collects a star once without altering movement or letting another team collect it again", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = STAR_TILES[0] - 1;
      G.tokens[3].position = STAR_TILES[0] - 1;
      G.deck = [1, 1];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.G.tokens[0].position).toBe(STAR_TILES[0]);
    expect(client.getState()!.G.stars).toEqual([1, 0, 0]);
    expect(client.getState()!.G.action.route).toEqual([STAR_TILES[0]]);
    client.moves.draw();
    client.moves.hop("1-0");
    expect(client.getState()!.G.stars).toEqual([1, 0, 0]);
    expect(client.getState()!.G.collected).toEqual([STAR_TILES[0]]);
  });

  it("records discoveries without consuming cards, turns or a pending move", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.deck = [2];
    });
    client.moves.draw();
    const before = client.getState()!;
    client.moves.discover("mushroom");
    client.moves.discover("pond");
    client.moves.discover("windmill");
    const after = client.getState()!;
    expect(after.ctx.turn).toBe(before.ctx.turn);
    expect(after.G.card).toBe(2);
    expect(after.G.action).toEqual(before.G.action);
    expect(after.G.discoveries).toEqual(["mushroom", "pond", "windmill"]);
    client.moves.hop("0-0");
    expect(client.getState()!.G.tokens[0].position).toBe(1);
  });

  it("migrates old saves to the same hill tiles and leaves them stable on subsequent loads", () => {
    const G = structuredClone(createClient().getState()!.G);
    delete (G as Partial<RabbitState>).worldVersion;
    G.tokens[0].position = 5;
    G.tokens[1].position = -2;
    G.tokens[2].position = 27;
    G.holes = [8, 21];
    G.action.route = [26, 27];
    upgradeSavedGame(G, 3);
    expect(G.tokens.slice(0, 3).map((t) => t.position)).toEqual([
      5 + GROUND_COUNT,
      -2,
      FINISH,
    ]);
    expect(G.holes).toEqual(TRAP_PATTERNS[0]);
    expect(G.action.route).toEqual([FINISH - 1, FINISH]);
    const upgraded = structuredClone(G);
    upgradeSavedGame(G, 3);
    expect(G).toEqual(upgraded);
  });

  it.each([
    { tile: 5, end: 8, kind: "spring" },
    { tile: 11, end: 9, kind: "wind" },
    { tile: 15, end: 8, kind: "slide" },
  ])("resolves $kind after the exact card movement", ({ tile, end, kind }) => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = tile - 1;
      G.deck = [1];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    const state = client.getState()!;
    expect(state.G.action.route).toEqual([tile]);
    expect(state.G.action.effects?.[0]).toMatchObject({
      kind,
      from: tile,
      to: end,
    });
    expect(state.G.tokens[0].position).toBe(end);
    expect(state.ctx.turn).toBe(2);
  });

  it("grants one shield and consumes it to stop a wind trap", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = 2;
      G.deck = [1];
    });
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.G.tokens[0].shield).toBe(true);
    const G = client.getState()!.G;
    const saved = JSON.stringify(G);
    const preview = resolveLanding(G, G.tokens[0], 11);
    expect(preview.position).toBe(11);
    expect(preview.shield).toBe(false);
    expect(preview.effects[0].kind).toBe("blocked");
    expect(JSON.stringify(G)).toBe(saved);
  });

  it("a shield saves a rabbit from an opening hole exactly once, even when the safe tile is occupied", () => {
    const client = createClient();
    arrange(client, (G) => {
      G.tokens[0].position = TRAPS[0];
      G.tokens[0].shield = true;
      G.tokens[3].position = TRAPS[0] - 1;
      G.deck = ["carrot", "carrot"];
    });
    client.moves.draw();
    client.moves.rotate();
    expect(client.getState()!.G.tokens[0].position).toBe(TRAPS[0] - 1);
    expect(client.getState()!.G.tokens[0].shield).toBe(false);
    expect(client.getState()!.G.action.fallen).toEqual([]);
    arrange(client, (G) => {
      G.tokens[0].position = TRAPS[2];
    });
    client.moves.draw();
    client.moves.rotate();
    expect(client.getState()!.G.tokens[0].position).toBe(-2);
  });

  it("chains a spring into a shield pickup and still checks a boosted landing for holes", () => {
    const client = createClient();
    const G = client.getState()!.G;
    const pickup = resolveLanding(G, G.tokens[0], GROUND_COUNT + 7);
    expect(pickup.position).toBe(GROUND_COUNT + 10);
    expect(pickup.shield).toBe(true);
    expect(pickup.effects.map((effect) => effect.kind)).toEqual([
      "spring",
      "shield",
    ]);
    const dangerous = { ...G, holes: [8] };
    expect(resolveLanding(dangerous, G.tokens[0], 5).position).toBe(-2);
    const protectedLanding = resolveLanding(
      dangerous,
      { ...G.tokens[0], shield: true },
      5,
    );
    expect(protectedLanding.position).toBe(7);
    expect(protectedLanding.shield).toBe(false);
  });
});

describe("Random maps and roaming weather", () => {
  function aim(client: TestClient, point: [number, number]) {
    arrange(client, (G) => {
      G.weather = {
        ...createWeather(),
        from: [...point],
        to: [...point],
        duration: 20,
        strikeIn: 0.01,
      };
    });
  }

  it("creates sparse balanced maps that vary between seeds and persist in saves", () => {
    const layouts = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const client = createClient(`map-${seed}`, { randomMap: true });
      const layout = client.getState()!.G.features;
      expect(layout).toHaveLength(8);
      for (const kind of ["spring", "wind", "slide", "shield"])
        expect(layout.filter((tile) => tile.kind === kind)).toHaveLength(2);
      layout.forEach((tile, i) => {
        expect([...TRAPS, ...STAR_TILES].includes(tile.index)).toBe(false);
        layout
          .slice(i + 1)
          .forEach((other) =>
            expect(Math.abs(tile.index - other.index)).toBeGreaterThanOrEqual(
              3,
            ),
          );
      });
      layouts.add(JSON.stringify(layout));
      const copy = createClient("copy");
      copy.store.dispatch({
        type: "RESET",
        state: JSON.parse(JSON.stringify(client.store.getState())),
        clientOnly: true,
      });
      expect(copy.getState()!.G.features).toEqual(layout);
    }
    expect(layouts.size).toBeGreaterThan(10);
  });

  it("moves the cloud independently without consuming cards or turns, including empty strikes", () => {
    const client = createClient("cloud", { weather: true });
    const original = client.getState()!;
    const start = cloudPosition(original.G.weather);
    client.moves.weatherAdvance(1, false);
    expect(cloudPosition(client.getState()!.G.weather)).not.toEqual(start);
    expect(client.getState()!.G.action.id).toBe(original.G.action.id);
    expect(client.getState()!.ctx.turn).toBe(original.ctx.turn);
    expect(client.getState()!.G.deck).toEqual(original.G.deck);
    aim(client, [0, -6]);
    client.moves.weatherAdvance(0.02, true);
    expect(client.getState()!.G.weather.lastStrike?.hits).toEqual([]);
    expect(
      client
        .getState()!
        .G.tokens.some((token) => isStunned(client.getState()!.G, token)),
    ).toBe(false);
  });

  it("stuns a current player's rabbit for this pending turn, then recovers it", () => {
    const client = createClient("current-stun", { weather: true });
    arrange(client, (G) => {
      G.tokens[0].position = 7;
      G.deck = [1];
    });
    aim(client, PATH[7]);
    client.moves.weatherAdvance(0.02, true);
    expect(
      isStunned(client.getState()!.G, client.getState()!.G.tokens[0]),
    ).toBe(true);
    expect(
      movableTokens(client.getState()!.G, 0).map((token) => token.id),
    ).toEqual(["0-1", "0-2"]);
    client.moves.draw();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    client.moves.hop("0-0");
    error.mockRestore();
    expect(client.getState()!.G.tokens[0].position).toBe(7);
    client.moves.hop("0-1");
    expect(
      isStunned(client.getState()!.G, client.getState()!.G.tokens[0]),
    ).toBe(false);
    expect(client.getState()!.G.action.recovered).toEqual(["0-0"]);
  });

  it("holds another team's stun until that team's turn ends and does not extend repeat hits", () => {
    const client = createClient("future-stun", { weather: true });
    arrange(client, (G) => {
      G.tokens[3].position = 7;
      G.deck = [1, 1];
    });
    aim(client, PATH[7]);
    client.moves.weatherAdvance(0.02, true);
    const until = client.getState()!.G.tokens[3].stunnedUntil;
    aim(client, PATH[7]);
    client.moves.weatherAdvance(0.02, true);
    expect(client.getState()!.G.tokens[3].stunnedUntil).toBe(until);
    client.moves.draw();
    client.moves.hop("0-0");
    expect(client.getState()!.ctx.currentPlayer).toBe("1");
    expect(
      isStunned(client.getState()!.G, client.getState()!.G.tokens[3]),
    ).toBe(true);
    client.moves.draw();
    client.moves.hop("1-1");
    expect(
      isStunned(client.getState()!.G, client.getState()!.G.tokens[3]),
    ).toBe(false);
  });

  it("lets an entirely stunned team rest after drawing without deadlocking", () => {
    const client = createClient("rest", { weather: true });
    arrange(client, (G) => {
      G.tokens
        .filter((token) => token.player === 0)
        .forEach((token) => {
          token.position = 7;
        });
      G.deck = [2];
    });
    client.moves.draw();
    aim(client, PATH[7]);
    client.moves.weatherAdvance(0.02, true);
    expect(movableTokens(client.getState()!.G, 0)).toHaveLength(0);
    client.moves.rest();
    expect(client.getState()!.ctx.currentPlayer).toBe("1");
    expect(client.getState()!.G.discard).toEqual([2]);
    expect(client.getState()!.G.action.recovered).toHaveLength(3);
    expect(movableTokens(client.getState()!.G, 0)).toHaveLength(3);
  });

  it("consumes a shield on lightning and applies stun to unprotected rabbits sharing the tile", () => {
    const client = createClient("shield-storm", { weather: true });
    arrange(client, (G) => {
      G.tokens[0].position = 7;
      G.tokens[0].shield = true;
      G.tokens[3].position = 7;
    });
    aim(client, PATH[7]);
    client.moves.weatherAdvance(0.02, true);
    const G = client.getState()!.G;
    expect(G.weather.lastStrike?.hits).toEqual(["0-0", "1-0"]);
    expect(G.weather.lastStrike?.blocked).toEqual(["0-0"]);
    expect(G.tokens[0].shield).toBe(false);
    expect(isStunned(G, G.tokens[0])).toBe(false);
    expect(isStunned(G, G.tokens[3])).toBe(true);
  });

  it("defers lightning during movement while the cloud keeps drifting", () => {
    const client = createClient("defer", { weather: true });
    arrange(client, (G) => {
      G.weather.from = [-5, -6];
      G.weather.to = [5, -6];
      G.weather.duration = 10;
      G.weather.elapsed = 0;
      G.weather.strikeIn = 0.1;
    });
    client.moves.weatherAdvance(1, false);
    const intermediate = cloudPosition(client.getState()!.G.weather);
    expect(intermediate[0]).toBeGreaterThan(-5);
    expect(client.getState()!.G.weather.strikes).toBe(0);
    client.moves.weatherAdvance(0.3, true);
    expect(client.getState()!.G.weather.strikes).toBe(1);
    expect(client.getState()!.G.weather.lastStrike?.point[0]).toBeGreaterThan(
      intermediate[0],
    );
  });

  it("draws in order from one shared 52-card pool and upgrades legacy pools on the next draw", () => {
    const client = createClient("shared-deck");
    const order = [...client.getState()!.G.deck].reverse();
    client.moves.draw();
    expect(client.getState()!.G.card).toBe(order[0]);
    if (order[0] === "carrot") client.moves.rotate();
    else client.moves.hop("0-0");
    client.moves.draw();
    expect(client.getState()!.G.card).toBe(order[1]);
    expect(client.getState()!.G.deck).toHaveLength(50);
    const legacy = createClient();
    arrange(legacy, (G) => {
      delete G.deckVersion;
      G.deck = [1, "carrot"];
      G.discard = [2];
      G.tokens[0].position = 7;
    });
    legacy.moves.draw();
    const G = legacy.getState()!.G;
    expect(G.deckVersion).toBe(2);
    expect(G.deck).toHaveLength(51);
    expect(
      [...G.deck, G.card!].filter((card) => card === "carrot"),
    ).toHaveLength(8);
    expect(G.tokens[0].position).toBe(7);
  });

  it("finishes randomized matches even with live weather and stunned teams", () => {
    for (let seed = 0; seed < 12; seed++) {
      const client = createClient(`live-match-${seed}`, {
        weather: true,
        randomMap: true,
      });
      let actions = 0;
      while (!client.getState()!.ctx.gameover && actions < 1400) {
        const { G, ctx } = client.getState()!;
        const player = Number(ctx.currentPlayer);
        if (G.stage !== "rotate" && !movableTokens(G, player).length)
          client.moves.rest();
        else if (G.stage === "draw") client.moves.draw();
        else if (G.stage === "rotate") client.moves.rotate();
        else client.moves.hop(chooseToken(G, player)!);
        actions++;
        if (actions % 4 === 0 && !client.getState()!.ctx.gameover)
          client.moves.weatherAdvance(6, true);
      }
      expect(client.getState()!.ctx.gameover).toBeTruthy();
    }
  }, 15000);
});
