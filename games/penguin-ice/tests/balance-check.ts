import assert from 'node:assert/strict';
import { IcePhysics, FIXED_STEP } from '../src/physics.ts';

export function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function playMatch(radius: number, seed: number) {
  const physics = new IcePhysics(radius);
  const random = seededRandom(seed);
  let turns = 0, beforeFinalHit = physics.remaining, largestExtraDrop = 0;
  while (!physics.lost && turns < physics.cells.length) {
    const id = physics.chooseBotMove(random);
    assert.ok(id, 'An unfinished match must still have a legal move');
    beforeFinalHit = physics.remaining;
    assert.equal(physics.strike(id), true);
    turns++;
    let frames = 0;
    for (; frames < 600; frames++) {
      physics.step(FIXED_STEP);
      if (frames >= 100 && (physics.stable || physics.lost)) break;
    }
    assert.ok(frames < 600, 'A move must settle or end the game');
    largestExtraDrop = Math.max(largestExtraDrop, beforeFinalHit - physics.remaining - 1);
  }
  assert.equal(physics.lost, true, 'Physical support must eventually fail');
  return { radius, seed, turns, beforeFinalHit, remaining: physics.remaining, largestExtraDrop };
}

if (process.argv[1]?.endsWith('balance-check.ts')) {
  for (const radius of [3, 4]) for (const seed of [17, 73, 211]) console.log(JSON.stringify(playMatch(radius, seed)));
}
