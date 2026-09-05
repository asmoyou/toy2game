import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPenguinMood, type PenguinCondition } from '../src/penguin-mood.ts';

const calm: PenguinCondition = { remainingRatio: 1, supports: 6, stress: 0.3, tilt: 0, fallingSpeed: 0, wobble: 0, lost: false, inWater: false };

test('stable ice, thinning ice and impact produce different expressions', () => {
  assert.equal(selectPenguinMood(calm), 'happy');
  assert.equal(selectPenguinMood({ ...calm, remainingRatio: 0.65 }), 'alert');
  assert.equal(selectPenguinMood(calm, true), 'surprised');
});

test('local support and tilt can cause fear even on a mostly intact board', () => {
  assert.equal(selectPenguinMood({ ...calm, supports: 2 }), 'scared');
  assert.equal(selectPenguinMood({ ...calm, stress: 0.95 }), 'scared');
  assert.equal(selectPenguinMood({ ...calm, tilt: 0.2 }, true), 'scared');
});

test('falling and swimming override ordinary reactions', () => {
  assert.equal(selectPenguinMood({ ...calm, lost: true }, true), 'falling');
  assert.equal(selectPenguinMood({ ...calm, lost: true, inWater: true }, true), 'swimming');
});
