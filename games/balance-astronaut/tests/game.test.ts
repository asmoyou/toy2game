import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { BalanceGame } from '../src/game.ts';
import { BalancePhysics, STEP, COM_DEPTH, PIVOT_Y } from '../src/physics.ts';
import { DEFAULT_SETTINGS, parseSettings, SLOTS, RINGS, DECK_CENTER_Y, PIVOT_LOCAL_Y } from '../src/board.ts';

const humans = () => ({ ...DEFAULT_SETTINGS, bots: [false, false, false, false] });
function advance(game: BalanceGame, seconds: number) { for (let i = 0; i < seconds * 60; i++) game.update(1 / 60); }
function settle(game: BalanceGame) {
  for (let i = 0; i < 900 && game.phase === 'settling'; i++) game.update(1 / 60);
  assert.notEqual(game.phase, 'settling', 'the platform must settle or fall within 15 seconds');
}

test('four descending rings provide unique positions and a shell center of mass below the pivot', () => {
  assert.equal(RINGS.length, 4);
  assert.equal(SLOTS.length, 48);
  assert.equal(new Set(SLOTS.map(slot => `${slot.x},${slot.z}`)).size, SLOTS.length);
  for (let i = 1; i < RINGS.length; i++) {
    assert.ok(RINGS[i].radius > RINGS[i - 1].radius);
    assert.ok(RINGS[i].height < RINGS[i - 1].height);
  }
  assert.ok(DECK_CENTER_Y < PIVOT_LOCAL_Y);
});

test('an empty station stays level, and one action places exactly one astronaut', () => {
  const game = new BalanceGame(humans(), 42);
  advance(game, 2);
  assert.equal(game.physics.crew.size, 0);
  assert.equal(game.moves, 0);
  assert.ok(game.physics.tilt < 0.01);
  for (const id of [-1, 0.5, 48]) assert.equal(game.place(id), false);
  assert.equal(game.place(0), true);
  assert.equal(game.physics.crew.size, 1);
  assert.equal(game.place(0), false);
  assert.equal(game.place(1), false);
  assert.equal(game.turn, 0);
  settle(game);
  assert.equal(game.turn, 1);
  assert.equal(game.moves, 1);
  assert.ok(game.physics.tilt > 2);
  game.dispose();
});

test('opposite loading restores balance without delayed falls after the turn ends', () => {
  const game = new BalanceGame(humans(), 42);
  game.place(0); settle(game);
  const tilt = game.physics.tilt;
  advance(game, 5);
  assert.equal(game.phase, 'place');
  game.place(3); settle(game);
  assert.ok(game.physics.tilt < tilt / 3);
  advance(game, 5);
  assert.deepEqual(game.fallen, []);
  assert.equal(game.turn, 0);
  game.dispose();
});

test('outer loads have greater leverage and repeated bias makes an actual body fall on the responsible turn', () => {
  const inner = new BalanceGame(humans(), 42);
  inner.place(0); settle(inner);
  const outer = new BalanceGame(humans(), 42);
  outer.place(30); settle(outer);
  assert.equal(outer.phase, 'place');
  assert.ok(outer.physics.tilt > inner.physics.tilt * 2);
  const responsible = outer.turn;
  outer.place(31);
  for (let i = 0; i < 900 && outer.phase !== 'finished'; i++) {
    outer.update(1 / 60);
    assert.equal(outer.turn, responsible);
  }
  assert.equal(outer.phase, 'finished');
  assert.equal(outer.loser, responsible);
  assert.ok(outer.fallen.length > 0);
  assert.ok(outer.peakTilt < 40);
  assert.equal(outer.place(32), false);
  inner.dispose(); outer.dispose();
});

test('gravity causes imbalance and no artificial spring returns a tilted weightless platform to horizontal', () => {
  const physics = new BalancePhysics({ gravity: 0 });
  physics.plate.quaternion.setFromEuler(0.2, 0, 0);
  const offset = physics.plate.quaternion.vmult(new CANNON.Vec3(0, COM_DEPTH, 0));
  physics.plate.position.set(-offset.x, PIVOT_Y - offset.y, -offset.z);
  const tilt = physics.tilt;
  for (let i = 0; i < 2 / STEP; i++) physics.step();
  assert.ok(Math.abs(physics.tilt - tilt) < 0.05);
  physics.add(30, 0);
  for (let i = 0; i < 2 / STEP; i++) physics.step();
  assert.ok(Math.abs(physics.tilt - tilt) < 0.05);
  physics.dispose();
});

test('a completely occupied and supported platform finishes collectively', () => {
  const game = new BalanceGame(humans(), 42);
  for (let id = 1; id < SLOTS.length; id++) game.physics.add(id, id % 2);
  assert.equal(game.place(0), true);
  settle(game);
  assert.equal(game.phase, 'finished');
  assert.equal(game.loser, null);
  assert.equal(game.physics.crew.size, SLOTS.length);
  game.dispose();
});

test('seeded dice consume their complete quota before advancing the turn', () => {
  const settings = { ...humans(), mode: 'dice' as const };
  const game = new BalanceGame(settings, 81234), other = new BalanceGame(settings, 81234);
  assert.equal(game.place(0), false);
  assert.equal(game.roll(), true);
  assert.equal(game.roll(), false);
  other.roll(); advance(game, 0.8); advance(other, 0.8);
  assert.equal(game.dice, other.dice);
  const quota = game.dice;
  assert.ok(quota >= 1 && quota <= 6);
  for (let i = 0; i < quota; i++) {
    assert.equal(game.turn, 0);
    assert.equal(game.place(game.chooseBotSlot()!), true);
    settle(game);
  }
  assert.equal(game.turn, 1);
  assert.equal(game.phase, 'roll');
  assert.equal(game.moves, quota);
  game.dispose(); other.dispose();
});

test('pausing freezes physics and bot scheduling, and humans cannot act during a bot turn', () => {
  const game = new BalanceGame({ ...DEFAULT_SETTINGS, bots: [true, true, false, false] }, 42);
  game.paused = true;
  advance(game, 5);
  assert.equal(game.time, 0);
  assert.equal(game.moves, 0);
  assert.equal(game.place(0, 'bot'), false);
  game.paused = false;
  assert.equal(game.place(0, 'human'), false);
  advance(game, 20);
  assert.ok(game.moves >= 4);
  game.dispose();
});

test('old preferences drop the obsolete sensitivity setting and a new match has no preset crew', () => {
  const settings = parseSettings({ count: 4, bots: [false, true, false, true], difficulty: 'delicate', mode: 'dice' });
  assert.equal('difficulty' in settings, false);
  assert.deepEqual(settings.bots, [false, true, false, true]);
  for (const value of [null, 'bad', { count: 99, bots: 'yes' }]) assert.equal(parseSettings(value).count, 2);
  const old = new BalanceGame(humans()); old.place(0); old.dispose();
  assert.equal(old.physics.world.bodies.length, 0);
  const game = new BalanceGame(settings);
  assert.equal(game.physics.crew.size, 0);
  assert.equal(game.turn, 0);
  game.dispose();
});
