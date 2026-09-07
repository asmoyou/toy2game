import { bounds, EXIT, occupancy, validLayout, type Move, type Vehicle } from './rules.ts';

export type Solution = { status: 'solved'; moves: Move[]; visited: number } | { status: 'limit' | 'impossible'; visited: number };

export function solve(cars: Vehicle[], initial: number[], limit = 250000): Solution {
  if (!validLayout(cars, initial)) return { status: 'impossible', visited: 0 };
  if (initial[0] === EXIT) return { status: 'solved', moves: [], visited: 1 };
  // Base-six positions fit exactly in a JS integer for all fifteen vehicles.
  const factors = cars.map((_, i) => 6 ** i);
  const encode = (positions: number[]) => positions.reduce((key, p, i) => key + p * factors[i], 0);
  const keys = [encode(initial)], parents = [-1], actions: Move[] = [{ car: -1, to: -1 }];
  const seen = new Set(keys);
  for (let head = 0; head < keys.length; head++) {
    const key = keys[head];
    const positions = factors.map(factor => Math.floor(key / factor) % 6);
    const grid = occupancy(cars, positions);
    if (bounds(cars, positions, 0, grid).max === EXIT) {
      const moves: Move[] = [{ car: 0, to: EXIT }];
      for (let i = head; parents[i] !== -1; i = parents[i]) moves.push(actions[i]);
      return { status: 'solved', moves: moves.reverse(), visited: seen.size };
    }
    for (let car = 0; car < cars.length; car++) {
      if (actions[head].car === car) continue;
      const range = bounds(cars, positions, car, grid);
      for (let to = range.min; to <= range.max; to++) {
        if (to === positions[car]) continue;
        const next = key + (to - positions[car]) * factors[car];
        if (seen.has(next)) continue;
        if (seen.size >= limit) return { status: 'limit', visited: seen.size };
        seen.add(next); keys.push(next); parents.push(head); actions.push({ car, to });
      }
    }
  }
  return { status: 'impossible', visited: seen.size };
}
