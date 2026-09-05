import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCells } from '../src/board.ts';

test('both ice fields have unique cells and a complete surrounding rim', () => {
  for (const [radius, count] of [[3, 37], [4, 61]]) {
    const cells = createCells(radius);
    assert.equal(cells.length, count);
    assert.equal(new Set(cells.map(cell => cell.id)).size, count);
    assert.equal(cells.filter(cell => cell.rim).length, 6 * radius);
  }
});
