import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createGame, LEVELS } from '../src/game';
import { bounds, EXIT, GARAGE, legalMove, movesFrom, nextPositions, starsFor, validLayout } from '../src/rules';
import { solve } from '../src/solver';
import { parseSave } from '../src/storage';

describe('verified parking challenges', () => {
  it('has 120 distinct, legal challenges using only the fifteen toy vehicles', () => {
    expect(LEVELS).toHaveLength(120);
    expect(LEVELS.map(level => level.id)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(new Set(LEVELS.map(level => level.name)).size).toBe(120);
    const layouts = LEVELS.map(level => level.cars.map((car, i) => [i === 0 ? 'police' : 'car', car.axis, car.lane, car.size, level.positions[i]].join(':')).sort().join('|'));
    expect(new Set(layouts).size).toBe(120);
    for (const level of LEVELS) {
      expect(validLayout(level.cars, level.positions)).toBe(true);
      expect(level.cars.every(car => GARAGE.some(model => model.id === car.id))).toBe(true);
      expect(new Set(level.cars.map(car => car.id)).size).toBe(level.cars.length);
      expect(level.cars.every(car => car.size === (GARAGE.findIndex(model => model.id === car.id) > 10 ? 3 : 2))).toBe(true);
      expect(bounds(level.cars, level.positions, 0).max).not.toBe(EXIT);
    }
  });

  it('preserves every released level so saved paths and best scores still refer to the same puzzles', () => {
    // Fingerprint of the original 24 published records, including IDs, names, geometry and minima.
    expect(createHash('sha256').update(JSON.stringify(LEVELS.slice(0, 24))).digest('hex')).toBe('ce67df18e81b124c649753070edccf44b96878f0c6a8068856ef9506e4152826');
  });

  it('offers thirty levels per difficulty and a progressively harder expansion', () => {
    for (const [difficulty, min, max] of [[0, 4, 6], [1, 7, 10], [2, 11, 16], [3, 17, Infinity]]) {
      const group = LEVELS.filter(level => level.difficulty === difficulty);
      expect(group).toHaveLength(30);
      expect(group.every(level => level.minimum >= min && level.minimum <= max)).toBe(true);
      const added = group.filter(level => level.id > 24);
      expect(added).toHaveLength(24);
      expect(new Set(added.map(level => level.minimum)).size).toBeGreaterThanOrEqual(3);
    }
    const minima = LEVELS.slice(24).map(level => level.minimum);
    expect(minima).toEqual([...minima].sort((a, b) => a - b));
    expect(LEVELS.at(-1)!.minimum).toBeGreaterThan(LEVELS[23].minimum);
  });

  for (const level of LEVELS) it(`level ${level.id} reaches the exit in exactly its advertised ${level.minimum} moves`, () => {
    const solution = solve(level.cars, level.positions);
    expect(solution.status).toBe('solved');
    if (solution.status !== 'solved') return;
    expect(solution.moves).toHaveLength(level.minimum);
    let positions = [...level.positions];
    for (const move of solution.moves) {
      expect(legalMove(level.cars, positions, move)).toBe(true);
      positions = nextPositions(positions, move);
      expect(validLayout(level.cars, positions)).toBe(true);
    }
    expect(positions[0]).toBe(EXIT);
    expect(movesFrom(level.cars, positions)).toEqual([]);
  });

  it('returns identical hints for the same state and respects its work budget', () => {
    const level = LEVELS.at(-1)!;
    expect(solve(level.cars, level.positions)).toEqual(solve(level.cars, level.positions));
    expect(solve(level.cars, level.positions, 1).status).toBe('limit');
  });
});

describe('legal moves and single-player engine', () => {
  const level = LEVELS[0];
  it('rejects crossing cars, out-of-bounds, fractional and invalid car moves without altering state', () => {
    const client = createGame(level);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const move of [{ car: 0, to: EXIT }, { car: 0, to: 5 }, { car: -1, to: 0 }, { car: 0, to: -1 }, { car: 20, to: 0 }, { car: 0, to: 2.5 }, { car: 1, to: 6 }]) {
        client.moves.slide(move);
        expect(client.getState()!.G.positions).toEqual(level.positions);
        expect(client.getState()!.G.past).toEqual([]);
      }
    } finally { errors.mockRestore(); }
  });

  it('treats a long slide as one move, supports undo/redo, and drops an abandoned redo branch', () => {
    const client = createGame(level);
    const first = movesFrom(level.cars, level.positions).find(move => Math.abs(move.to - level.positions[move.car]) >= 2)!;
    expect(first).toBeDefined();
    client.moves.slide(first);
    expect(client.getState()!.G.past).toHaveLength(1);
    const positions = client.getState()!.G.positions;
    client.moves.back(); expect(client.getState()!.G.positions).toEqual(level.positions);
    client.moves.forward(); expect(client.getState()!.G.positions).toEqual(positions);
    client.moves.back();
    client.moves.slide(movesFrom(level.cars, level.positions).find(move => JSON.stringify(move) !== JSON.stringify(first))!);
    expect(client.getState()!.G.future).toEqual([]);
  });

  it.each([1, 25, 49, 73, 120])('level %i finishes only after the police car has completely left and refuses later actions', id => {
    const level = LEVELS[id - 1];
    const solution = solve(level.cars, level.positions);
    if (solution.status !== 'solved') throw new Error('Missing solution');
    const client = createGame(level);
    for (const move of solution.moves.slice(0, -1)) client.moves.slide(move);
    expect(client.getState()!.ctx.gameover).toBeUndefined();
    client.moves.slide(solution.moves.at(-1));
    expect(client.getState()!.ctx.gameover).toEqual({ winner: '0' });
    const snapshot = client.getState()!.G;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { client.moves.back(); expect(client.getState()!.G).toEqual(snapshot); } finally { error.mockRestore(); }
  });

  it('scores exact minimum, five extra moves, and completion', () => {
    expect(starsFor(4, 4)).toBe(3); expect(starsFor(9, 4)).toBe(2); expect(starsFor(10, 4)).toBe(1);
  });
});

describe('validated progress persistence', () => {
  it.each([5, 24, 25, 48, 49, 72, 73, 96, 97, 120])('restores level %i with its redo chain and best scores across both packs', id => {
    const level = LEVELS[id - 1], client = createGame(level), solution = solve(level.cars, level.positions);
    if (solution.status !== 'solved') throw new Error('Missing solution');
    for (const move of solution.moves.slice(0, 3)) client.moves.slide(move);
    client.moves.back();
    const saved = { version: 1, level: level.id, game: client.getState()!.G, seconds: 37, best: { '1': 4, '24': 25, '120': LEVELS[119].minimum } };
    const restored = parseSave(JSON.parse(JSON.stringify(saved)));
    expect(restored).toEqual(saved);
    const next = createGame(level, restored.game); next.moves.forward();
    expect(next.getState()!.G.past).toHaveLength(3);
  });

  it('rejects corrupt, overlapping, unreachable or noncontiguous paths, retaining valid best scores', () => {
    expect(parseSave(null).level).toBe(1);
    expect(parseSave({ version: 99 }).level).toBe(1);
    const level = LEVELS[2];
    const saved = { version: 1, level: level.id, game: { positions: [...level.positions], past: [], future: [] }, seconds: 20, best: { '1': 4, '2': -1, '3': 0 } };
    saved.game.positions[1] = 8;
    expect(parseSave(saved).level).toBe(1);
    expect(parseSave(saved).best).toEqual({ '1': 4 });
    const move = movesFrom(level.cars, level.positions)[0];
    saved.game.positions = nextPositions(level.positions, move);
    expect(parseSave(saved).level).toBe(1);
    saved.game.positions = [...level.positions];
    expect(parseSave({ ...saved, game: { ...saved.game, future: [[...level.positions]] } }).level).toBe(1);
  });
});
