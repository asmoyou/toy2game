import { describe, expect, test } from 'vitest';
import { BOT_LEVELS, DIFFICULTIES, canFlip, chooseBot, flip, initialState, nextRandom, observation, parseSettings, replaySave, saveFor, settle, winners, type Actor } from '../src/rules';
import { MatchGame } from '../src/game';

const human = { count: 2, pairs: 12 as const, bots: [false, false], difficulty: 'normal' as const };
const tick = (game: MatchGame, seconds = 2) => { for (let n = 0; n < Math.ceil(seconds * 20); n++) game.update(0.05); };

describe('memory pairing rules', () => {
  test('deck has exactly two of each face and its seed reproduces the shuffle', () => {
    for (const pairs of [12, 24] as const) {
      const G = initialState({ ...human, pairs }, 20260908);
      expect(G.deck).toHaveLength(pairs * 2);
      for (let face = 0; face < pairs; face++) expect(G.deck.filter(id => id === face)).toHaveLength(2);
      expect(initialState({ ...human, pairs }, 20260908)).toEqual(G);
      expect(initialState({ ...human, pairs }, 42).deck).not.toEqual(G.deck);
      expect(G.memory.every(face => face === null)).toBe(true);
    }
  });
  test('invalid positions, duplicate flips, wrong actors and actions during settlement are rejected', () => {
    const G = initialState({ ...human, bots: [false, true] }, 12);
    for (const id of [-1, 24, 0.5, NaN]) expect(flip(G, id, 'human')).toBe(false);
    expect(flip(G, 0, 'bot')).toBe(false); expect(flip(G, 0, 'alien' as Actor)).toBe(false);
    expect(settle(G)).toBe(false); expect(flip(G, 0, 'human')).toBe(true);
    expect(flip(G, 0, 'human')).toBe(false); expect(settle(G)).toBe(false);
    const second = G.deck.findIndex(face => face !== G.deck[0]);
    expect(flip(G, second, 'human')).toBe(true); expect(flip(G, 2, 'human')).toBe(false);
    expect(settle(G)).toBe(true); expect(G.current).toBe(1); expect(flip(G, 0, 'human')).toBe(false);
    expect(G.memory[0]).toBe(G.deck[0]); expect(G.open).toEqual([]);
  });
  test('a match scores once and grants another turn; a miss advances all configured players', () => {
    const G = initialState({ count: 4, pairs: 12, bots: [false, false, false, false], difficulty: 'normal' }, 80);
    const mate = G.deck.findIndex((face, i) => i > 0 && face === G.deck[0]);
    flip(G, 0, 'human'); flip(G, mate, 'human'); settle(G);
    expect(G.scores).toEqual([1, 0, 0, 0]); expect(G.current).toBe(0); expect(settle(G)).toBe(false);
    expect(canFlip(G, 0, 'human')).toBe(false);
    const a = G.owners.findIndex(owner => owner < 0), b = G.deck.findIndex((face, i) => G.owners[i] < 0 && face !== G.deck[a]);
    for (let i = 1; i <= 4; i++) { flip(G, a, 'human'); flip(G, b, 'human'); settle(G); expect(G.current).toBe(i % 4); }
    expect(G.attempts).toBe(5); expect(G.scores.reduce((a, b) => a + b)).toBe(1);
  });
  test('all pairs complete, reject further input and calculate tied winners from scores', () => {
    const G = initialState(human, 10);
    for (let face = 0; face < 12; face++) {
      const pair = G.deck.flatMap((id, i) => id === face ? [i] : []);
      flip(G, pair[0], 'human'); flip(G, pair[1], 'human'); settle(G);
      // Alternate scoring ownership by deliberately missing between successful pairs.
      if (face < 10) {
        const a = G.owners.findIndex(owner => owner < 0), b = G.deck.findIndex((id, i) => G.owners[i] < 0 && id !== G.deck[a]);
        flip(G, a, 'human'); flip(G, b, 'human'); settle(G);
      }
    }
    expect(G.phase).toBe('finished'); expect(G.scores).toEqual([7, 5]); expect(winners(G)).toEqual([0]);
    expect(flip(G, 0, 'human')).toBe(false); expect(settle(G)).toBe(false);
    // End-state scoring also supports ties among any subset of seats.
    expect(winners({ ...G, scores: [6, 6] })).toEqual([0, 1]);
    expect(winners({ ...G, scores: [3, 5, 5, 2] })).toEqual([1, 2]);
  });
});

describe('fair computer play and persistence', () => {
  test('bots only receive public memory, use known mates, and explore unknown positions', () => {
    const G = initialState(human, 77), view = observation(G);
    expect(view).not.toHaveProperty('deck'); expect(view.memory.every(face => face === null)).toBe(true);
    const other = structuredClone(G); other.deck.reverse(); expect(chooseBot(observation(other))).toBe(chooseBot(view));
    expect(chooseBot({ memory: [2, null, 2, null], available: [true, true, true, true], first: null, rng: 0, mistake: false })).toBe(0);
    expect(chooseBot({ memory: [2, null, 2, null], available: [false, true, true, true], first: 2, rng: 0, mistake: false })).toBe(2);
    expect(chooseBot({ memory: [2, null, 3, null], available: [true, true, true, true], first: null, rng: 0, mistake: false })).toBe(1);
  });
  test('replay restores both partial flips and settlement, with identical future bot choices', () => {
    const G = initialState(human, 7);
    flip(G, 0, 'human'); expect(replaySave(saveFor(G))).toEqual(G);
    flip(G, 1, 'human'); expect(replaySave(saveFor(G))).toEqual(G);
    settle(G); const copy = replaySave(JSON.parse(JSON.stringify(saveFor(G))))!;
    expect(copy).toEqual(G); expect(chooseBot(observation(copy))).toBe(chooseBot(observation(G)));
    for (const bad of [null, {}, { ...saveFor(G), version: 3 }, { ...saveFor(G), seed: -1 }, { ...saveFor(G), settings: { ...human, bots: [] } }, { ...saveFor(G), actions: [{ type: 'settle' }] }, { ...saveFor(G), actions: [{ type: 'flip', id: 0, actor: 'bot' }] }, { ...saveFor(G), actions: [{ type: 'flip', id: 0, actor: 'human' }, { type: 'flip', id: 0, actor: 'human' }] }]) expect(replaySave(bad)).toBeNull();
  });
  test('new and restored engines lock animation, pause pending work and cancel disposed games', () => {
    const game = new MatchGame(human, 3); expect(game.flip(0)).toBe(true); expect(game.flip(1)).toBe(false);
    tick(game, 0.4); expect(game.flip(1)).toBe(true); const before = structuredClone(game.state), remaining = game.waiting;
    game.paused = true; tick(game, 20); expect(game.state).toEqual(before); expect(game.waiting).toBe(remaining);
    game.paused = false; tick(game); expect(game.state.phase).toBe('first');
    const restored = new MatchGame(human, 3, replaySave(saveFor(before))!); tick(restored); expect(restored.state).toEqual(game.state);
    const final = structuredClone(game.state); game.dispose(); tick(game, 20); expect(game.flip(3)).toBe(false); expect(game.state).toEqual(final); restored.dispose();
  });
  test.each([2, 3, 4])('%i bots finish without hidden knowledge or blocked turns', count => {
    const game = new MatchGame({ count, pairs: 24, bots: Array(count).fill(true), difficulty: 'normal' }, 100 + count);
    for (let step = 0; step < 30000 && game.state.phase !== 'finished'; step++) game.update(0.05);
    expect(game.state.phase).toBe('finished'); expect(game.state.scores.reduce((a, b) => a + b)).toBe(24); expect(winners(game.state).length).toBeGreaterThan(0);
    expect(replaySave(saveFor(game.state))).toEqual(game.state); game.dispose();
  });
  test('settings validate counts and append human seats', () => {
    expect(parseSettings(null)).toEqual({ count: 2, pairs: 24, bots: [false, true], difficulty: 'normal' });
    expect(parseSettings({ count: 4, pairs: 12, bots: [true, true] })).toEqual({ count: 4, pairs: 12, bots: [true, true, false, false], difficulty: 'normal' });
    expect(parseSettings({ count: 9, pairs: 5, bots: 'bad' })).toEqual({ count: 2, pairs: 24, bots: [false, true], difficulty: 'normal' });
    expect(parseSettings({ ...human, difficulty: 'invalid' }).difficulty).toBe('normal');
    for (const difficulty of DIFFICULTIES) expect(parseSettings({ ...human, difficulty }).difficulty).toBe(difficulty);
  });
});

describe('computer difficulty', () => {
  test.each(DIFFICULTIES)('%s observes only public faces and forgets according to its capacity', difficulty => {
    const G = initialState({ count: 4, pairs: 24, bots: [true, true, true, true], difficulty }, 777);
    const unique = Array.from({ length: 24 }, (_, face) => G.deck.indexOf(face));
    let firstRemembered: number | undefined;
    for (const id of unique) {
      expect(flip(G, id, 'bot')).toBe(true);
      firstRemembered ??= G.botMemories[0][0]?.id;
      for (const memory of G.botMemories) {
        expect(memory.length).toBeLessThanOrEqual(BOT_LEVELS[difficulty].capacity);
        for (const item of memory) expect(item.face).toBe(G.memory[item.id]);
      }
      if (G.phase === 'settling') settle(G);
    }
    if (difficulty === 'perfect') {
      expect(G.botMemories[0]).toHaveLength(24);
      expect(G.botMemories[0]).toEqual(G.botMemories[1]);
    } else {
      expect(G.botMemories[0].some(item => item.id === firstRemembered)).toBe(false);
      expect(G.botMemories[0]).not.toEqual(G.botMemories[1]);
      const remembered = new Set(G.botMemories[G.current].map(item => item.id));
      const forgotten = unique.find(id => !remembered.has(id))!;
      expect(G.memory[forgotten]).not.toBeNull(); expect(observation(G).memory[forgotten]).toBeNull();
    }
    const before = observation(G), hiddenChanged = structuredClone(G);
    hiddenChanged.deck = G.deck.map((face, id) => G.memory[id] === null ? (face + 7) % 24 : face);
    expect(observation(hiddenChanged)).toEqual(before); expect(chooseBot(observation(hiddenChanged))).toBe(chooseBot(before));
  });

  test('imperfect levels can miss known mates; perfect memory never makes a recall mistake', () => {
    const misses: number[] = [];
    for (const difficulty of DIFFICULTIES) {
      const G = initialState({ ...human, bots: [true, true], difficulty }, 900);
      const mate = G.deck.findIndex((face, id) => id > 0 && face === G.deck[0]);
      G.open = [0]; G.phase = 'second'; G.memory[0] = G.deck[0]; G.memory[mate] = G.deck[mate];
      G.botMemories[0] = [{ id: mate, face: G.deck[mate] }];
      let errors = 0;
      for (let seed = 0; seed < 1000; seed++) {
        G.rng = nextRandom(Math.imul(seed, 0x9e3779b9));
        const view = observation(G), choice = chooseBot(view);
        expect(choice).not.toBe(0); expect(chooseBot(observation(G))).toBe(choice);
        if (!view.mistake) expect(choice).toBe(mate);
        if (choice !== mate) errors++;
      }
      misses.push(errors);
    }
    expect(misses[0]).toBeGreaterThan(misses[1]); expect(misses[1]).toBeGreaterThan(misses[2]);
    expect(misses[2]).toBeGreaterThan(0); expect(misses[3]).toBe(0);
  });

  test.each(DIFFICULTIES)('%s restores independent memories and the next choice during a bot turn', difficulty => {
    const game = new MatchGame({ ...human, bots: [true, true], difficulty }, 444);
    for (let i = 0; i < 1000 && game.state.actions.length < 28; i++) game.update(0.05);
    const G = structuredClone(game.state); game.paused = true; tick(game, 30);
    expect(game.state).toEqual(G);
    const restored = replaySave(JSON.parse(JSON.stringify(saveFor(G))))!;
    expect(restored).toEqual(G); expect(observation(restored)).toEqual(observation(G));
    expect(chooseBot(observation(restored))).toBe(chooseBot(observation(G))); game.dispose();
  });

  test('version 1 keeps board, scores and partial turns while adopting normal difficulty', () => {
    const G = initialState({ ...human, bots: [true, true], difficulty: 'perfect' }, 111);
    flip(G, 0, 'bot'); flip(G, G.deck.findIndex((face, id) => id > 0 && face === G.deck[0]), 'bot'); settle(G);
    const next = G.owners.findIndex(owner => owner < 0); flip(G, next, 'bot');
    const oldSettings = { count: G.settings.count, pairs: G.settings.pairs, bots: G.settings.bots };
    const restored = replaySave({ version: 1, settings: oldSettings, seed: G.seed, actions: G.actions })!;
    expect(restored.settings.difficulty).toBe('normal');
    for (const field of ['deck', 'owners', 'scores', 'open', 'current', 'rng', 'actions'] as const) expect(restored[field]).toEqual(G[field]);
    expect(replaySave(saveFor(restored))).toEqual(restored);
    expect(replaySave({ version: 2, settings: oldSettings, seed: G.seed, actions: G.actions })).toBeNull();
    expect(replaySave({ ...saveFor(restored), settings: { ...restored.settings, difficulty: 'superhuman' } })).toBeNull();
  });

  test.each([12, 24] as const)('%i pairs: harder levels finish more efficiently across the same 80 boards', pairs => {
    const averages: number[] = [];
    for (const difficulty of DIFFICULTIES) {
      let attempts = 0;
      for (let seed = 0; seed < 80; seed++) {
        const G = initialState({ count: 2, pairs, bots: [true, true], difficulty }, seed);
        for (let i = 0; i < 10000 && G.phase !== 'finished'; i++) {
          if (G.phase === 'settling') expect(settle(G)).toBe(true);
          else expect(flip(G, chooseBot(observation(G))!, 'bot')).toBe(true);
        }
        expect(G.phase).toBe('finished'); expect(G.scores.reduce((a, b) => a + b)).toBe(pairs);
        attempts += G.attempts;
      }
      averages.push(attempts / 80);
    }
    expect(averages[0]).toBeGreaterThan(averages[1] * 1.25);
    expect(averages[1]).toBeGreaterThan(averages[2]); expect(averages[2]).toBeGreaterThan(averages[3]);
    expect(averages[1]).toBeGreaterThan(averages[3] * 1.1);
  });
});
