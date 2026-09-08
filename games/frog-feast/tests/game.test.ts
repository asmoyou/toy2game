import test from 'node:test';
import assert from 'node:assert/strict';
import { FrogGame } from '../src/game.ts';
import { BEAN_COUNT, BEAN_RADIUS, CYCLE, DECK_Y, STEP, TEAMS, parseSettings } from '../src/config.ts';

function advance(game: FrogGame, seconds: number) { for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.update(STEP); }
function setup(count = 4, bots = [false, false, false, false], seed = 31) { return new FrogGame(parseSettings({ version: 1, count, bots }), seed); }

test('settings reject corrupt and future versions; only enabled seats are saved', () => {
  for (const value of [null, [], '{bad', { version: 2, count: 2 }, { version: 1, count: 99, bots: 'true' }]) {
    const settings = parseSettings(value);
    assert.equal(settings.count, 4); assert.equal(settings.bots.length, 4);
  }
  assert.deepEqual(parseSettings({ version: 1, count: 2, bots: [false, true, true, true], sound: false }), { version: 1, count: 2, bots: [false, true, false, false], sound: false });
});

test('fixed seeds reproduce the initial layout and the complete physical match', () => {
  const games = [setup(4, [true, true, true, true], 191), setup(4, [true, true, true, true], 191)];
  for (const game of games) { game.start(); advance(game, 90); }
  assert.equal(games[0].phase, 'finished');
  assert.deepEqual(games[0].frogs, games[1].frogs);
  assert.deepEqual(games[0].physics.beans.map(bean => [bean.owner, bean.caughtAt]), games[1].physics.beans.map(bean => [bean.owner, bean.caughtAt]));
  games.forEach(game => game.dispose());
});

test('input respects preparation, countdown, seat ownership, cooldown, pause, and disposal', () => {
  const game = setup(2, [false, true]);
  assert.equal(game.bite(0), false); assert.equal(game.start(), true); assert.equal(game.start(), false);
  assert.equal(game.bite(0), false); advance(game, 3.01);
  assert.equal(game.bite(-1), false); assert.equal(game.bite(0.5), false); assert.equal(game.bite(2), false);
  assert.equal(game.bite(1, 'human'), false); assert.equal(game.hold(1, true), false);
  assert.equal(game.bite(0, 'bot'), false); assert.equal(game.bite(0), true); assert.equal(game.bite(0), false);
  const bites = game.frogs[0].bites; advance(game, CYCLE + STEP);
  assert.equal(game.bite(0), true); assert.equal(game.frogs[0].bites, bites + 1);
  game.paused = true; assert.equal(game.bite(0), false); assert.equal(game.bite(1, 'bot'), false);
  game.dispose(); game.paused = false; assert.equal(game.hold(0, true), false); assert.equal(game.bite(0), false);
});

test('mouth collision captures only nearby beans and never counts a bean twice', () => {
  const game = setup();
  const bean = game.physics.beans[0], angle = TEAMS[0].angle;
  bean.body.position.set(Math.cos(angle) * 1.8, DECK_Y + BEAN_RADIUS, Math.sin(angle) * 1.8);
  assert.equal(game.physics.inMouth(bean, 0, 0.3), true);
  assert.equal(game.physics.inMouth(bean, 1, 0.3), false);
  assert.equal(game.physics.inMouth(bean, 0, -1), false);
  const ids = game.physics.capture(0, 0.3, 1, 3).map(item => item.id);
  assert.ok(ids.includes(bean.id)); assert.ok(ids.length <= 3);
  assert.equal(game.physics.inMouth(bean, 0, 0.3), false);
  assert.ok(game.physics.capture(0, 0.3, 1.1, 3).every(item => !ids.includes(item.id)));
  game.dispose();
});

test('simultaneous held inputs are independent and release prevents repeat actions', () => {
  const game = setup(2);
  game.hold(0, true); game.hold(1, true); advance(game, 5);
  assert.equal(game.phase, 'playing'); assert.ok(game.frogs[0].bites >= 3); assert.equal(game.frogs[0].bites, game.frogs[1].bites);
  game.hold(0, false); const count = game.frogs[0].bites; advance(game, 1.5);
  assert.equal(game.frogs[0].bites, count); assert.ok(game.frogs[1].bites > count);
  game.releaseAll(); const other = game.frogs[1].bites; advance(game, 1.5); assert.equal(game.frogs[1].bites, other);
  game.dispose();
});

test('pause freezes countdown, physics, and bot timing; background catch-up is bounded', () => {
  const game = setup(4, [true, true, true, true]); game.start(); advance(game, 1);
  game.paused = true; const countdown = game.countdown; advance(game, 5); assert.equal(game.countdown, countdown);
  game.paused = false; advance(game, 3); game.paused = true;
  const snapshot = JSON.stringify({ time: game.time, frogs: game.frogs, beans: game.physics.beans.map(bean => bean.body.position) });
  advance(game, 10);
  assert.equal(JSON.stringify({ time: game.time, frogs: game.frogs, beans: game.physics.beans.map(bean => bean.body.position) }), snapshot);
  game.paused = false; const time = game.time; game.update(30); assert.ok(game.time - time <= 0.051);
  game.update(NaN); game.update(Infinity); assert.ok(Number.isFinite(game.time)); game.dispose();
});

test('bean contacts and the bowl contain every free ball during unattended play', () => {
  const game = setup(); game.start();
  for (let i = 0; i < 120 * 30; i++) {
    game.update(STEP);
    for (const bean of game.physics.beans) {
      assert.ok(Math.hypot(bean.body.position.x, bean.body.position.z) < 5.3);
      assert.ok(Math.abs(bean.body.position.y - (DECK_Y + BEAN_RADIUS)) < 1e-8);
    }
  }
  assert.equal(game.remaining, BEAN_COUNT); game.dispose();
});

test('all supported seat counts finish, conserve points, identify ties and reject finished inputs', () => {
  for (const count of [2, 3, 4]) for (const seed of [1, 13, 402]) {
    const game = setup(count, [true, true, true, true], seed); game.start(); advance(game, 120);
    assert.equal(game.phase, 'finished', `${count} seats, seed ${seed}`);
    assert.equal(game.remaining, 0); assert.equal(game.frogs.reduce((sum, frog) => sum + frog.score, 0), BEAN_COUNT);
    assert.equal(game.physics.beans.filter(bean => bean.owner === null).length, 0);
    assert.ok(game.physics.beans.every(bean => bean.owner! < count));
    const max = Math.max(...game.frogs.map(frog => frog.score));
    assert.deepEqual(game.winners, game.frogs.flatMap((frog, i) => i < count && frog.score === max ? [i] : []));
    if (count === 2 && seed === 1) assert.deepEqual(game.winners, [0, 1]);
    assert.equal(game.bite(0, 'bot'), false); const time = game.time; advance(game, 10); assert.equal(game.time, time);
    game.dispose(); assert.equal(game.physics.world.bodies.length, 0);
  }
});
