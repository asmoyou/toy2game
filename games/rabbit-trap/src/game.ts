import type { Game } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import {
  FINISH,
  PATH,
  GROUND_COUNT,
  TRAPS,
  TRAP_PATTERNS,
  STAR_TILES,
  DISCOVERIES,
  FEATURE_INFO,
  FEATURE_TILES,
  randomizeFeatures,
  type FeatureTile,
  featureAt,
  checkpointFor,
  type FeatureKind,
  type Discovery,
} from "./world";
import {
  advanceCloud,
  createWeather,
  type WeatherState,
  type WeatherStrike,
} from "./weather";
export { FINISH, PATH, TRAPS, TRAP_PATTERNS } from "./world";
export const COLORS = ["#e996ae", "#88aee6", "#e8be58", "#ad94d3"];
export const NAMES = ["桃桃", "蓝莓", "布丁", "芋圆"];
export type Card = 1 | 2 | 3 | "carrot";
export type Mode = "solo" | "duo" | "party";
export type PlayerConfig = { bot: boolean };
export type Token = {
  id: string;
  player: number;
  index: number;
  position: number;
  shield?: boolean;
  stunnedUntil?: number;
};
export type TileEffect = {
  kind: FeatureKind | "blocked" | "pit";
  token: string;
  from: number;
  to: number;
  route: number[];
};
export type Action = {
  id: number;
  kind: "start" | "draw" | "move" | "rotate" | "rest";
  player: number;
  token?: string;
  route?: number[];
  fallen?: string[];
  card?: Card;
  collected?: number;
  effects?: TileEffect[];
  collections?: { token: string; index: number }[];
  recovered?: string[];
};
export type RabbitState = {
  worldVersion: 2;
  turns: number[];
  weather: WeatherState;
  features: FeatureTile[];
  tokens: Token[];
  stars: number[];
  collected: number[];
  discoveries: Discovery[];
  deck: Card[];
  deckVersion?: 2;
  discard: Card[];
  card: Card | null;
  stage: "draw" | "select" | "rotate";
  mechanism: number;
  holes: number[];
  action: Action;
  history: { id: number; text: string; player: number }[];
};

export function upgradeSavedGame(G: RabbitState, numPlayers: number) {
  G.turns ??= Array(numPlayers).fill(1);
  if (G.weather?.version !== 2)
    G.weather = { ...createWeather(), enabled: G.weather?.enabled ?? true };
  G.features ??= FEATURE_TILES.map((tile) => ({ ...tile }));
  if (G.worldVersion === 2) return;
  G.tokens.forEach((token) => {
    if (token.position >= 0) token.position += GROUND_COUNT;
  });
  G.holes = G.holes.map((position) => position + GROUND_COUNT);
  if (G.action.route)
    G.action.route = G.action.route.map((position) => position + GROUND_COUNT);
  G.worldVersion = 2;
  G.stars = Array(numPlayers).fill(0);
  G.collected = [];
  G.discoveries = [];
}

export function isStunned(G: RabbitState, token: Token) {
  return (
    token.position >= 0 &&
    token.position < FINISH &&
    Boolean(
      token.stunnedUntil &&
        token.stunnedUntil >= (G.turns?.[token.player] ?? 0),
    )
  );
}

export function movableTokens(G: RabbitState, player: number) {
  return G.tokens.filter(
    (token) =>
      token.player === player &&
      token.position >= -1 &&
      token.position < FINISH &&
      !isStunned(G, token),
  );
}

export function weatherText(G: RabbitState, event: WeatherStrike) {
  if (!event.hits.length) return "雷电落在空地，大家都安全";
  if (event.hits.length === event.blocked.length) return "泡泡护盾挡住了雷击";
  const stunned = event.hits.filter((id) => !event.blocked.includes(id));
  if (stunned.length > 1) return `${stunned.length} 只小兔被雷击，眩晕一回合`;
  const token = G.tokens.find((token) => token.id === stunned[0])!;
  return `${NAMES[token.player]} ${token.index + 1} 号兔被雷击，眩晕一回合`;
}

export const CARD_DISTRIBUTION: { card: Card; count: number }[] = [
  { card: 1, count: 18 },
  { card: 2, count: 16 },
  { card: 3, count: 10 },
  { card: "carrot", count: 8 },
];
const DECK: Card[] = CARD_DISTRIBUTION.flatMap(({ card, count }) =>
  Array<Card>(count).fill(card),
);

export function routeFor(token: Token, steps: number): number[] {
  if (token.position < -1 || token.position >= FINISH) return [];
  const route: number[] = [];
  let position = token.position;
  for (let step = 0; step < steps; step++) {
    position++;
    route.push(Math.min(position, FINISH));
    if (position >= FINISH) break;
  }
  return route;
}

function between(from: number, to: number) {
  const direction = Math.sign(to - from);
  return Array.from(
    { length: Math.abs(to - from) },
    (_, i) => from + (i + 1) * direction,
  );
}

export function resolveLanding(
  G: RabbitState,
  token: Token,
  destination: number,
  tileEffects = true,
) {
  let position = destination;
  let shield = Boolean(token.shield);
  const effects: TileEffect[] = [];
  const visited = new Set<number>();
  while (position >= 0 && position < FINISH && !visited.has(position)) {
    visited.add(position);
    const from = position;
    if (G.holes.includes(position)) {
      if (shield) {
        shield = false;
        do {
          position--;
        } while (G.holes.includes(position));
        effects.push({
          kind: "blocked",
          token: token.id,
          from,
          to: position,
          route: between(from, position),
        });
      } else {
        position = -2;
        effects.push({ kind: "pit", token: token.id, from, to: -2, route: [] });
      }
      break;
    }
    if (!tileEffects) break;
    const kind = featureAt(position, G.features);
    if (!kind) break;
    if (kind === "shield") {
      shield = true;
      effects.push({ kind, token: token.id, from, to: position, route: [] });
      break;
    }
    if ((kind === "wind" || kind === "slide") && shield) {
      shield = false;
      effects.push({
        kind: "blocked",
        token: token.id,
        from,
        to: position,
        route: [],
      });
      break;
    }
    position =
      kind === "spring"
        ? Math.min(FINISH, position + 3)
        : kind === "wind"
          ? Math.max(0, position - 2)
          : checkpointFor(position);
    effects.push({
      kind,
      token: token.id,
      from,
      to: position,
      route: between(from, position),
    });
  }
  return { position, shield, effects };
}

export function effectText(effect: TileEffect) {
  if (effect.kind === "pit") return "掉进了地洞";
  if (effect.kind === "blocked") return "护盾挡住了陷阱";
  if (effect.kind === "shield") return "获得泡泡护盾";
  if (effect.kind === "spring") return "弹簧助力，前进 3 格";
  if (effect.kind === "wind") return "遇到逆风，后退 2 格";
  return `${FEATURE_INFO.slide.name}，回到第 ${effect.to + 1} 格`;
}

function record(G: RabbitState, text: string, player: number) {
  G.history.unshift({ id: G.action.id, text, player });
  G.history = G.history.slice(0, 30);
}

export function chooseToken(
  G: RabbitState,
  player: number,
): string | undefined {
  if (typeof G.card !== "number") return;
  const steps = G.card;
  const choices = movableTokens(G, player).map((t) => {
    const route = routeFor(t, steps);
    const landing = resolveLanding(G, t, route[route.length - 1]);
    const destination = landing.position;
    const score =
      destination >= FINISH
        ? 1000
        : destination === -2
          ? -100
          : destination +
            (landing.shield ? 3 : 0) +
            (TRAPS.includes(destination) ? -3 : 0);
    return { id: t.id, score };
  });
  choices.sort((a, b) => b.score - a.score);
  return choices[0]?.id;
}

export const RabbitGame: Game<RabbitState> = {
  name: "little-rabbit",
  minPlayers: 2,
  maxPlayers: 4,
  disableUndo: true,
  setup: ({ ctx, random }) => ({
    worldVersion: 2,
    turns: Array(ctx.numPlayers).fill(0),
    weather: createWeather(random),
    features: randomizeFeatures(random),
    stars: Array(ctx.numPlayers).fill(0),
    collected: [],
    discoveries: [],
    tokens: Array.from({ length: ctx.numPlayers * 3 }, (_, i) => ({
      id: `${Math.floor(i / 3)}-${i % 3}`,
      player: Math.floor(i / 3),
      index: i % 3,
      position: -1,
      shield: false,
    })),
    deck: random.Shuffle(DECK),
    deckVersion: 2,
    discard: [],
    card: null,
    stage: "draw",
    mechanism: 0,
    holes: [...TRAP_PATTERNS[0]],
    action: { id: 0, kind: "start", player: 0 },
    history: [],
  }),
  turn: {
    onBegin: ({ G, ctx }) => {
      G.turns[Number(ctx.currentPlayer)]++;
    },
    onEnd: ({ G, ctx }) => {
      const player = Number(ctx.currentPlayer);
      const recovered = G.tokens.filter(
        (token) =>
          token.player === player &&
          token.stunnedUntil &&
          token.stunnedUntil <= G.turns[player],
      );
      G.action.recovered = recovered
        .filter((token) => token.position >= -1)
        .map((token) => token.id);
      recovered.forEach((token) => {
        delete token.stunnedUntil;
      });
    },
    order: {
      first: () => 0,
      next: ({ G, ctx }) => {
        for (let i = 1; i <= ctx.numPlayers; i++) {
          const next = (ctx.playOrderPos + i) % ctx.numPlayers;
          if (
            G.tokens.some(
              (t) =>
                t.player === Number(ctx.playOrder[next]) && t.position >= -1,
            )
          )
            return next;
        }
        return undefined;
      },
    },
  },
  moves: {
    weatherAdvance: {
      noLimit: true,
      move: ({ G, ctx, random }, elapsed: number, canStrike = true) => {
        if (
          !G.weather.enabled ||
          !Number.isFinite(elapsed) ||
          elapsed <= 0 ||
          elapsed > 60 ||
          typeof canStrike !== "boolean"
        )
          return INVALID_MOVE;
        const point = advanceCloud(
          G.weather,
          elapsed,
          G.tokens.map((token) => token.position),
          random,
          canStrike,
        );
        if (!point) return;
        let nearest = -1;
        let distance = 0.66;
        PATH.forEach(([x, z], index) => {
          const separation = Math.hypot(point[0] - x, point[1] - z);
          if (separation < distance) {
            distance = separation;
            nearest = index;
          }
        });
        const hit = G.tokens.filter(
          (token) => nearest >= 0 && token.position === nearest,
        );
        const blocked: string[] = [];
        hit.forEach((token) => {
          if (token.shield) {
            token.shield = false;
            blocked.push(token.id);
          } else if (!isStunned(G, token))
            token.stunnedUntil =
              G.turns[token.player] +
              (Number(ctx.currentPlayer) === token.player ? 0 : 1);
        });
        const strike: WeatherStrike = {
          id: G.weather.strikes,
          point,
          hits: hit.map((token) => token.id),
          blocked,
        };
        G.weather.lastStrike = strike;
        G.history.unshift({
          id: -strike.id,
          text: weatherText(G, strike),
          player: hit[0]?.player ?? Number(ctx.currentPlayer),
        });
        G.history = G.history.slice(0, 30);
      },
    },
    configureWeather: {
      noLimit: true,
      move: ({ G }, enabled: boolean) => {
        if (G.action.id !== 0 || typeof enabled !== "boolean")
          return INVALID_MOVE;
        G.weather.enabled = enabled;
      },
    },
    draw: ({ G, ctx, random }) => {
      if (
        G.stage !== "draw" ||
        !movableTokens(G, Number(ctx.currentPlayer)).length
      )
        return INVALID_MOVE;
      if (G.deckVersion !== 2) {
        G.deck = random.Shuffle(DECK);
        G.discard = [];
        G.deckVersion = 2;
      }
      if (!G.deck.length) {
        G.deck = random.Shuffle(G.discard);
        G.discard = [];
      }
      G.card = G.deck.pop()!;
      G.stage = G.card === "carrot" ? "rotate" : "select";
      const player = Number(ctx.currentPlayer);
      G.action = { id: G.action.id + 1, kind: "draw", player, card: G.card };
      record(
        G,
        G.card === "carrot" ? "抽到了胡萝卜机关" : `抽到了前进 ${G.card} 格`,
        player,
      );
    },
    hop: ({ G, ctx, events }, id: string) => {
      if (G.stage !== "select" || typeof G.card !== "number")
        return INVALID_MOVE;
      const token = G.tokens.find(
        (t) =>
          t.id === id &&
          t.player === Number(ctx.currentPlayer) &&
          t.position >= -1 &&
          !isStunned(G, t),
      );
      if (!token) return INVALID_MOVE;
      const route = routeFor(token, G.card);
      const landing = resolveLanding(G, token, route[route.length - 1]);
      const destination = landing.position;
      const fallen = destination === -2;
      const collected =
        !fallen &&
        STAR_TILES.includes(destination) &&
        !G.collected.includes(destination);
      if (collected) {
        G.collected.push(destination);
        G.stars[token.player]++;
      }
      token.position = fallen ? -2 : destination;
      token.shield = landing.shield;
      G.action = {
        id: G.action.id + 1,
        kind: "move",
        player: token.player,
        token: id,
        route,
        fallen: fallen ? [id] : [],
        effects: landing.effects,
        ...(collected ? { collected: destination } : {}),
      };
      record(
        G,
        landing.effects.length
          ? `${token.index + 1} 号兔${landing.effects.map(effectText).join("，")}${destination >= FINISH ? "，成功登顶！" : ""}`
          : fallen
            ? `${token.index + 1} 号兔掉进了陷阱`
            : destination >= FINISH
              ? "率先到达了胡萝卜山顶！"
              : `${token.index + 1} 号兔到达第 ${destination + 1} 格${collected ? "，收集了一颗星星" : ""}`,
        token.player,
      );
      G.discard.push(G.card);
      G.card = null;
      G.stage = "draw";
      events.endTurn();
    },
    rotate: ({ G, ctx, events }) => {
      if (G.stage !== "rotate" || G.card !== "carrot") return INVALID_MOVE;
      G.mechanism++;
      G.holes = [...TRAP_PATTERNS[G.mechanism % TRAP_PATTERNS.length]];
      const affected = G.tokens.filter((t) => G.holes.includes(t.position));
      const effects: TileEffect[] = [];
      const collections: { token: string; index: number }[] = [];
      affected.forEach((t) => {
        const landing = resolveLanding(G, t, t.position, false);
        t.position = landing.position;
        t.shield = landing.shield;
        effects.push(...landing.effects);
        if (
          t.position >= 0 &&
          STAR_TILES.includes(t.position) &&
          !G.collected.includes(t.position)
        ) {
          G.collected.push(t.position);
          G.stars[t.player]++;
          collections.push({ token: t.id, index: t.position });
        }
      });
      const fallen = affected.filter((t) => t.position === -2);
      const player = Number(ctx.currentPlayer);
      G.action = {
        id: G.action.id + 1,
        kind: "rotate",
        player,
        fallen: fallen.map((t) => t.id),
        effects,
        collections,
      };
      record(
        G,
        fallen.length
          ? `转动机关，${fallen.length} 只兔子掉入陷阱`
          : "转动机关，大家都安全过关",
        player,
      );
      G.discard.push(G.card);
      G.card = null;
      G.stage = "draw";
      events.endTurn();
    },
    rest: ({ G, ctx, events }) => {
      const player = Number(ctx.currentPlayer);
      if (
        G.stage === "rotate" ||
        movableTokens(G, player).length ||
        !G.tokens.some(
          (token) => token.player === player && token.position >= -1,
        )
      )
        return INVALID_MOVE;
      if (G.card !== null) G.discard.push(G.card);
      G.card = null;
      G.stage = "draw";
      G.action = { id: G.action.id + 1, kind: "rest", player };
      record(G, "小队休息一回合，解除眩晕", player);
      events.endTurn();
    },
    discover: {
      noLimit: true,
      move: ({ G }, discovery: Discovery) => {
        if (
          !DISCOVERIES.includes(discovery) ||
          G.discoveries.includes(discovery)
        )
          return INVALID_MOVE;
        G.discoveries.push(discovery);
      },
    },
  },
  endIf: ({ G }) => {
    const winner = G.tokens.find((t) => t.position >= FINISH);
    if (winner) return { winner: String(winner.player), reason: "summit" };
    const surviving = [
      ...new Set(G.tokens.filter((t) => t.position >= -1).map((t) => t.player)),
    ];
    if (surviving.length === 1)
      return { winner: String(surviving[0]), reason: "survivor" };
    if (!surviving.length) return { draw: true };
  },
};
