export const DIFFICULTIES = ['easy', 'normal', 'hard', 'perfect'] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export const BOT_LEVELS: Record<Difficulty, { label: string; description: string; capacity: number; attention: number; mistake: number }> = {
  easy: { label: '轻松', description: '记得少，容易漏看和忘记，轻松练一练。', capacity: 6, attention: 0.6, mistake: 0.2 },
  normal: { label: '普通', description: '记忆有限，偶尔会漏看或想错。', capacity: 12, attention: 0.8, mistake: 0.12 },
  hard: { label: '困难', description: '记得更多、更仔细，仍会遗忘和失误。', capacity: 20, attention: 0.95, mistake: 0.04 },
  perfect: { label: '完美记忆', description: '记住所有公开翻过的位置，不会记忆失误。', capacity: 48, attention: 1, mistake: 0 },
};
export type Settings = { count: number; pairs: 12 | 24; bots: boolean[]; difficulty: Difficulty };
export type BotMemory = { id: number; face: number }[];
export type Actor = 'human' | 'bot';
export type Action = { type: 'flip'; id: number; actor: Actor } | { type: 'settle' };
export type MatchState = {
  settings: Settings; seed: number; rng: number; deck: number[]; owners: number[];
  memory: (number | null)[]; botMemories: BotMemory[]; open: number[]; current: number; scores: number[];
  phase: 'first' | 'second' | 'settling' | 'finished'; attempts: number;
  last: 'start' | 'match' | 'miss'; actions: Action[];
};

export const TEAMS = [
  { name: '薄荷队', color: '#79ac87', ink: '#426e51', pale: '#edf4e9', symbol: 'sprout' },
  { name: '蜜桃队', color: '#df9789', ink: '#a25d50', pale: '#fcf0e8', symbol: 'flower-2' },
  { name: '蓝莓队', color: '#8da8cf', ink: '#5b759c', pale: '#edf2fa', symbol: 'cloud' },
  { name: '柠檬队', color: '#d6b44f', ink: '#9b7b29', pale: '#faf4dc', symbol: 'sun' },
] as const;

export function parseSettings(value: unknown): Settings {
  const input = value && typeof value === 'object' ? value as Partial<Settings> : {};
  const count = [2, 3, 4].includes(input.count!) ? input.count! : 2;
  return { count, pairs: input.pairs === 12 ? 12 : 24, bots: Array.from({ length: count }, (_, i) => Array.isArray(input.bots) ? input.bots[i] === true : i === 1), difficulty: DIFFICULTIES.includes(input.difficulty!) ? input.difficulty! : 'normal' };
}

export function nextRandom(state: number) { return (Math.imul(state, 1664525) + 1013904223) >>> 0; }

function botRandom(rng: number, seat: number, salt: number) {
  // Independent, reproducible rolls without consuming the deck/exploration stream.
  // Re-reading a decision (or refreshing/pausing) cannot reroll a memory mistake.
  let value = rng ^ Math.imul(seat + 1, 0x9e3779b9) ^ salt;
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  value = Math.imul(value ^ value >>> 15, 0x735a2d97);
  return ((value ^ value >>> 15) >>> 0) / 0x100000000;
}

function remember(G: MatchState, id: number) {
  const level = BOT_LEVELS[G.settings.difficulty];
  G.settings.bots.forEach((bot, seat) => {
    if (!bot || botRandom(G.rng, seat, 0xa511e9b3) >= level.attention) return;
    const memory = G.botMemories[seat];
    const old = memory.findIndex(item => item.id === id);
    if (old >= 0) memory.splice(old, 1);
    memory.push({ id, face: G.memory[id]! });
    if (memory.length > level.capacity) memory.shift();
  });
}

export function initialState(settings: Settings, seed: number): MatchState {
  settings = parseSettings(settings);
  let rng = seed >>> 0;
  const deck = Array.from({ length: settings.pairs * 2 }, (_, i) => Math.floor(i / 2));
  for (let i = deck.length - 1; i > 0; i--) {
    rng = nextRandom(rng);
    const j = Math.floor(rng / 0x100000000 * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    settings, seed: seed >>> 0, rng, deck, owners: deck.map(() => -1), memory: deck.map(() => null), botMemories: Array.from({ length: settings.count }, () => []),
    open: [], current: 0, scores: Array(settings.count).fill(0), phase: 'first', attempts: 0, last: 'start', actions: [],
  };
}

export function canFlip(G: MatchState, id: number, actor: Actor) {
  return ['human', 'bot'].includes(actor) && (G.phase === 'first' || G.phase === 'second') && Number.isInteger(id) && id >= 0 && id < G.deck.length
    && G.owners[id] === -1 && !G.open.includes(id) && (actor === 'bot') === G.settings.bots[G.current];
}

export function flip(G: MatchState, id: number, actor: Actor) {
  if (!canFlip(G, id, actor)) return false;
  G.open.push(id); G.memory[id] = G.deck[id]; G.rng = nextRandom(G.rng);
  remember(G, id);
  G.phase = G.open.length === 2 ? 'settling' : 'second';
  if (G.open.length === 2) G.attempts++;
  G.actions.push({ type: 'flip', id, actor });
  return true;
}

export function settle(G: MatchState) {
  if (G.phase !== 'settling' || G.open.length !== 2) return false;
  const [a, b] = G.open;
  if (G.deck[a] === G.deck[b]) {
    G.owners[a] = G.owners[b] = G.current; G.scores[G.current]++; G.last = 'match';
    G.botMemories = G.botMemories.map(memory => memory.filter(item => item.id !== a && item.id !== b));
  } else { G.current = (G.current + 1) % G.settings.count; G.last = 'miss'; }
  G.open = [];
  G.phase = G.owners.every(owner => owner >= 0) ? 'finished' : 'first';
  G.actions.push({ type: 'settle' });
  return true;
}

export function winners(G: MatchState) {
  if (G.phase !== 'finished') return [];
  const best = Math.max(...G.scores);
  return G.scores.flatMap((score, i) => score === best ? [i] : []);
}

// This is the complete input to bot decisions; it contains no unrevealed faces.
export function observation(G: MatchState) {
  const memory: (number | null)[] = G.memory.map(() => null);
  for (const item of G.botMemories[G.current]) memory[item.id] = item.face;
  return { memory, available: G.owners.map((owner, id) => owner < 0 && !G.open.includes(id)), first: G.open.length ? G.memory[G.open[0]] : null, rng: G.rng, mistake: botRandom(G.rng, G.current, 0x63d83595) < BOT_LEVELS[G.settings.difficulty].mistake };
}

export function chooseBot(view: ReturnType<typeof observation>): number | null {
  const available = view.available.flatMap((ok, i) => ok ? [i] : []);
  if (!available.length) return null;
  if (!view.mistake && view.first !== null) {
    const mate = available.find(id => view.memory[id] === view.first);
    if (mate !== undefined) return mate;
  } else if (!view.mistake) {
    const seen = new Map<number, number>();
    for (const id of available) {
      const face = view.memory[id];
      if (face === null) continue;
      if (seen.has(face)) return seen.get(face)!;
      seen.set(face, id);
    }
  }
  const unknown = available.filter(id => view.memory[id] === null);
  const pool = !view.mistake && unknown.length ? unknown : available;
  return pool[Math.floor(view.rng / 0x100000000 * pool.length)];
}

export type Save = { version: 2; settings: Settings; seed: number; actions: Action[] };
export function replaySave(value: unknown): MatchState | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<Omit<Save, 'version'>> & { version?: number }, config = saved.settings;
  if (![1, 2].includes(saved.version!) || !config || ![2, 3, 4].includes(config.count) || ![12, 24].includes(config.pairs)
    || !Array.isArray(config.bots) || config.bots.length !== config.count || !config.bots.every(bot => typeof bot === 'boolean')
    || (config.difficulty !== undefined || saved.version === 2) && !DIFFICULTIES.includes(config.difficulty)
    || !Number.isInteger(saved.seed) || saved.seed! < 0 || saved.seed! > 0xffffffff
    || !Array.isArray(saved.actions) || saved.actions.length > 20000) return null;
  // Version 1 had no difficulty. Keep its legal history, layout and scores, and
  // rebuild bounded normal memories from that same public history for future play.
  const G = initialState(parseSettings(config), saved.seed!);
  for (const action of saved.actions) {
    if (!action || typeof action !== 'object') return null;
    if (action.type === 'flip') {
      if (!['human', 'bot'].includes(action.actor) || !flip(G, action.id, action.actor)) return null;
    } else if (action.type === 'settle') { if (!settle(G)) return null; }
    else return null;
  }
  return G;
}

export const saveFor = (G: MatchState): Save => ({ version: 2, settings: G.settings, seed: G.seed, actions: G.actions });
