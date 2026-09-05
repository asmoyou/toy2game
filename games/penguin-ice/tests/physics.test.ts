import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IcePhysics, FIXED_STEP, ICE_Y, ICE_HEIGHT, WATER_LEVEL } from '../src/physics.ts';
import { GROUND_Y } from '../src/terrain.ts';
import { playMatch } from './balance-check.ts';

function advance(physics: IcePhysics, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP); i++) physics.step(FIXED_STEP);
}

function narrowBridge(gravity: number) {
  const physics = new IcePhysics(4);
  const keep = new Set(physics.cells.filter(cell => cell.r === 0).map(cell => cell.id));
  for (const tile of physics.tiles.values()) {
    if (keep.has(tile.cell.id)) continue;
    physics.strike(tile.cell.id);
    physics.world.removeBody(tile.body);
  }
  // Remove the setup's hammer impulses so only gravity and the connections are tested.
  for (const body of physics.world.bodies) { body.velocity.setZero(); body.angularVelocity.setZero(); }
  physics.world.gravity.y = gravity;
  return physics;
}

test('assembled fields carry their weight without unprompted collapse', () => {
  for (const [radius, count] of [[3, 37], [4, 61]]) {
    const physics = new IcePhysics(radius);
    advance(physics, 8);
    assert.equal(physics.remaining, count);
    assert.equal(physics.lost, false);
    assert.equal(physics.stable, true);
    assert.equal(physics.getDiagnostics().brokenBonds, 0);
    for (const tile of physics.tiles.values()) assert.ok(tile.body.mass > 0, 'Every ice block is dynamic');
    assert.ok(physics.tiles.get('0,0')!.body.position.y < ICE_Y, 'The loaded ice actually sags');
  }
});

test('an ordinary rim strike preserves the field and does not disable collisions', () => {
  const physics = new IcePhysics(4);
  const tile = physics.tiles.get('-4,0')!;
  assert.equal(physics.strike('-4,0'), true);
  assert.equal(physics.strike('-4,0'), false);
  assert.equal(tile.body.collisionFilterMask & physics.penguin.collisionFilterGroup, 1);
  advance(physics, 4);
  assert.equal(physics.remaining, 60);
  assert.equal(physics.stable, true);
  assert.equal(physics.lost, false);
});

test('impact sways the connected ice, decays, and is stronger with fewer supports', () => {
  function measure(weakened: boolean) {
    const physics = new IcePhysics(4);
    if (weakened) for (const id of ['-2,0', '-2,-1']) { physics.strike(id); advance(physics, 2.5); }
    const neighbor = physics.tiles.get('-3,0')!;
    const origin = neighbor.body.position.clone();
    physics.strike('-4,0');
    const initialWobble = physics.wobble;
    assert.ok(initialWobble > 0);
    assert.equal(physics.stable, false, 'Do not hand off a turn during the impact response');
    let peakDisplacement = 0;
    for (let i = 0; i < 180; i++) {
      physics.step(FIXED_STEP);
      peakDisplacement = Math.max(peakDisplacement, neighbor.body.position.distanceTo(origin));
    }
    assert.equal(physics.wobble, 0, 'Elastic response must stop');
    assert.equal(physics.stable, true);
    assert.equal(physics.lost, false);
    assert.equal(physics.remaining, weakened ? 58 : 60);
    assert.ok(peakDisplacement > 0.005, 'Remaining ice must physically move, not only the struck block');
    return { initialWobble, peakDisplacement };
  }
  const solid = measure(false), weak = measure(true);
  assert.ok(weak.initialWobble > solid.initialWobble * 1.5);
  assert.ok(weak.peakDisplacement > solid.peakDisplacement * 1.3);
});

test('gravity breaks a narrow connected bridge, while zero gravity preserves it', () => {
  const gravity = narrowBridge(-9.81);
  const weightless = narrowBridge(0);
  assert.equal(gravity.remaining, 9);
  for (const [a, b] of [['1,0', '2,0'], ['2,0', '3,0'], ['3,0', '4,0']]) {
    assert.ok(gravity.bonds.some(bond => !bond.broken && bond.a === a && bond.b === b), 'Bridge still connects to the rim');
  }
  const initialBonds = gravity.getDiagnostics().activeBonds;
  advance(gravity, 3);
  advance(weightless, 3);
  assert.equal(gravity.lost, true);
  assert.ok(gravity.getDiagnostics().activeBonds < initialBonds);
  assert.ok(gravity.tiles.get('0,0')!.body.position.y < -1);
  assert.equal(weightless.remaining, 9);
  assert.equal(weightless.lost, false);
});

test('insufficient friction cannot carry the assembled ice and penguin', () => {
  // Total rim grip is below the assembled weight at this coefficient.
  const slippery = new IcePhysics(4, { friction: 0.05 });
  advance(slippery, 4);
  assert.equal(slippery.lost, true);
  assert.ok(slippery.remaining < 61);
});

test('distributed holes preserve the field while multiple supports remain', () => {
  const physics = new IcePhysics(4);
  const moves = physics.cells.filter(cell => ((cell.q - cell.r) % 3 + 3) % 3 === 1).map(cell => cell.id);
  assert.equal(moves.length, 21);
  for (const [index, id] of moves.entries()) {
    assert.equal(physics.strike(id), true);
    advance(physics, 2.2);
    assert.equal(physics.lost, false, `Distributed hit ${index + 1} must not drop the penguin`);
    assert.equal(physics.remaining, 60 - index, 'Healthy supports must prevent unstruck ice from cascading');
    assert.equal(physics.stable, true);
  }
});

test('an isolated rim block loses pressure and falls onto the solid ground', () => {
  const physics = new IcePhysics(4);
  for (const id of ['3,0', '3,1', '4,-1']) { physics.strike(id); advance(physics, 2.2); }
  const isolated = physics.tiles.get('4,0')!;
  assert.equal(isolated.struck, false);
  assert.equal(isolated.compression, 0);
  assert.equal(isolated.removed, true);
  assert.ok(Math.abs(isolated.body.position.y - (GROUND_Y + ICE_HEIGHT / 2)) < 0.15);
});

test('ice entering the central water hole floats instead of vanishing', () => {
  const physics = new IcePhysics(4);
  physics.strike('0,0');
  advance(physics, 7);
  const ice = physics.tiles.get('0,0')!;
  assert.equal(ice.removed, true);
  assert.ok(ice.body.world);
  assert.ok(Math.abs(ice.body.position.y - WATER_LEVEL) < 0.5);
});

test('seeded bot matches allow a competitive middle game and still end', () => {
  const physics = new IcePhysics(4);
  assert.notEqual(physics.chooseBotMove(() => 0.5), '0,0', 'Bot should not open by hitting under the penguin');
  for (const radius of [3, 4]) for (const seed of [17, 73, 211]) {
    const result = playMatch(radius, seed);
    assert.ok(result.turns >= (radius === 4 ? 20 : 14), `Premature collapse: ${JSON.stringify(result)}`);
    assert.ok(result.turns < (radius === 4 ? 61 : 37), 'Removing key support must eventually end the match');
  }
});
