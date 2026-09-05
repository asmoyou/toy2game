import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressionFactor } from '../src/compression.ts';

const direction = (angle: number) => ({ x: Math.cos(angle), z: Math.sin(angle) });

test('empty space or one wall cannot create clamping pressure', () => {
  assert.equal(compressionFactor([], 0.55), 0);
  assert.equal(compressionFactor([direction(0)], 0.55), 0);
});

test('contacts confined to one side cannot wedge a block in place', () => {
  assert.equal(compressionFactor([0, Math.PI / 3, Math.PI * 2 / 3].map(direction), 0.55), 0);
});

test('opposite or surrounding contacts supply finite compression', () => {
  const opposite = compressionFactor([0, Math.PI].map(direction), 0.55);
  const surrounding = compressionFactor([0, Math.PI * 2 / 3, Math.PI * 4 / 3].map(direction), 0.55);
  const complete = compressionFactor(Array.from({ length: 6 }, (_, i) => direction(i * Math.PI / 3)), 0.55);
  assert.ok(opposite > 0 && opposite < surrounding && surrounding < complete);
});
