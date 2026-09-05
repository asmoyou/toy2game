import * as CANNON from 'cannon-es';
import { createCells, NEIGHBORS, TILE_RADIUS, type Cell } from './board.ts';
import type { PenguinCondition } from './penguin-mood.ts';
import { compressionFactor } from './compression.ts';
import { GROUND_Y, WATER_LEVEL, createHoleOutline } from './terrain.ts';
export { WATER_LEVEL } from './terrain.ts';

export const ICE_Y = 1.1;
export const ICE_HEIGHT = 0.48;
export const PENGUIN_COM_Y = 0.62;
export const FIXED_STEP = 1 / 60;
const ICE_MASS = 0.24;
const ICE_FRICTION = 0.55;
const CLAMP_FORCE = 32;
const GRIP_SLIP_DISTANCE = 0.03;
const GRIP_SLIP_ANGLE = 0.055;
const GRIP_RELEASE_TIME = 0.22;

export type IceBody = { cell: Cell; body: CANNON.Body; removed: boolean; struck: boolean; compression: number };
export type IceBond = {
  a: string; b: string | null; constraint: CANNON.LockConstraint;
  forceLimit: number; torqueLimit: number; stress: number; overloadTime: number; broken: boolean; wobble: number;
  baseForceLimit: number; baseTorqueLimit: number;
};

export class IcePhysics {
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: false });
  readonly cells: Cell[];
  readonly tiles = new Map<string, IceBody>();
  readonly bonds: IceBond[] = [];
  readonly penguin: CANNON.Body;
  readonly iceMaterial = new CANNON.Material('ice');
  readonly penguinMaterial = new CANNON.Material('penguin');
  readonly frameMaterial = new CANNON.Material('frame');
  time = 0;
  lastFracture = -10;
  private fractureEnabled = false;
  private compressionDirty = true;
  private friction: number;
  private anchor = new CANNON.Body({ mass: 0, material: this.frameMaterial });

  constructor(radius: number, options: { friction?: number; clampForce?: number; penguinMass?: number } = {}) {
    this.cells = createCells(radius);
    const friction = options.friction ?? ICE_FRICTION;
    this.friction = friction;
    const holdingForce = friction * (options.clampForce ?? CLAMP_FORCE);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.broadphase.useBoundingBoxes = true;
    (this.world.solver as CANNON.GSSolver).iterations = 24;
    (this.world.solver as CANNON.GSSolver).tolerance = 0.0001;
    this.world.defaultContactMaterial.friction = friction;
    this.world.defaultContactMaterial.restitution = 0.035;
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.iceMaterial, this.iceMaterial, { friction, restitution: 0.035 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.iceMaterial, this.penguinMaterial, { friction: 0.38, restitution: 0.01 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.iceMaterial, this.frameMaterial, { friction: 0.6, restitution: 0.02 }));
    const innerRadius = Math.sqrt(3) * 0.7 * radius + 0.78;
    for (let side = 0; side < 6; side++) {
      const angle = Math.PI / 6 + side * Math.PI / 3;
      const distance = (innerRadius + 0.235) * Math.cos(Math.PI / 6);
      const orientation = new CANNON.Quaternion().setFromEuler(0, -angle - Math.PI / 2, 0);
      this.anchor.addShape(new CANNON.Box(new CANNON.Vec3((innerRadius + 0.47) / 2, 0.36, 0.235 * Math.cos(Math.PI / 6))), new CANNON.Vec3(Math.cos(angle) * distance, 1.02, Math.sin(angle) * distance), orientation);
    }
    this.world.addBody(this.anchor);
    this.makeGround(radius);
    for (const cell of this.cells) {
      const body = new CANNON.Body({
        mass: ICE_MASS, material: this.iceMaterial,
        shape: new CANNON.Cylinder(TILE_RADIUS - 0.015, TILE_RADIUS - 0.015, ICE_HEIGHT, 6),
        position: new CANNON.Vec3(cell.x, ICE_Y, cell.z), linearDamping: 0.12, angularDamping: 0.2,
        sleepSpeedLimit: 0.025, sleepTimeLimit: 1,
      });
      this.world.addBody(body);
      this.tiles.set(cell.id, { cell, body, removed: false, struck: false, compression: 1 });
    }
    for (const tile of this.tiles.values()) {
      for (const [dq, dr] of NEIGHBORS.slice(0, 3)) {
        const neighbor = this.tiles.get(`${tile.cell.q + dq},${tile.cell.r + dr}`);
        if (neighbor) this.addBond(tile, neighbor, holdingForce, holdingForce * 0.85);
      }
      if (tile.cell.rim) this.addBond(tile, null, holdingForce * 3.5, holdingForce * 2.8);
    }
    this.updateCompression();
    this.penguin = new CANNON.Body({
      mass: options.penguinMass ?? 0.8, material: this.penguinMaterial,
      position: new CANNON.Vec3(0.24, ICE_Y + ICE_HEIGHT / 2 + 0.015 + PENGUIN_COM_Y, 0.13),
      angularDamping: 0.32, linearDamping: 0.12, sleepSpeedLimit: 0.035, sleepTimeLimit: 0.8,
    });
    this.penguin.addShape(new CANNON.Box(new CANNON.Vec3(0.46, 0.09, 0.32)), new CANNON.Vec3(0, 0.1 - PENGUIN_COM_Y, 0.1));
    this.penguin.addShape(new CANNON.Sphere(0.44), new CANNON.Vec3(0, 0.72 - PENGUIN_COM_Y, 0));
    this.world.addBody(this.penguin);
    this.world.addEventListener('postStep', () => this.afterStep());
    // Seat the assembled ice before enabling fracture, without freezing its mass or motion.
    for (let i = 0; i < 100; i++) this.world.step(FIXED_STEP);
    this.fractureEnabled = true;
    this.time = 0;
  }

  private makeGround(radius: number) {
    const outline = createHoleOutline(radius);
    const floor = new CANNON.Body({ mass: 0, material: this.frameMaterial });
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const outerA = new CANNON.Vec3(a.x, 0, a.z), outerB = new CANNON.Vec3(b.x, 0, b.z);
      outerA.normalize(); outerA.scale(35, outerA);
      outerB.normalize(); outerB.scale(35, outerB);
      const quad = [a, { x: outerA.x, z: outerA.z }, { x: outerB.x, z: outerB.z }, b];
      const centerX = quad.reduce((sum, point) => sum + point.x, 0) / 4;
      const centerZ = quad.reduce((sum, point) => sum + point.z, 0) / 4;
      const vertices = [-0.3, 0.3].flatMap(y => quad.map(point => new CANNON.Vec3(point.x - centerX, y, point.z - centerZ)));
      const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
      floor.addShape(new CANNON.ConvexPolyhedron({ vertices, faces }), new CANNON.Vec3(centerX, GROUND_Y - 0.3, centerZ));
    }
    this.world.addBody(floor);
  }

  private addBond(tile: IceBody, neighbor: IceBody | null, forceLimit: number, torqueLimit: number) {
    const constraint = new CANNON.LockConstraint(tile.body, neighbor?.body ?? this.anchor);
    if (!neighbor) {
      const outward = new CANNON.Vec3(tile.cell.x, 0, tile.cell.z);
      outward.normalize();
      outward.scale(0.55, constraint.pivotA);
      tile.body.pointToWorldFrame(constraint.pivotA, constraint.pivotB);
    }
    constraint.collideConnected = false;
    constraint.equations.forEach((equation, i) => {
      // Cannon 0.20 clamps solver impulses, so convert N / N m to per-step limits.
      const limit = (i < 3 ? forceLimit : torqueLimit) * FIXED_STEP;
      equation.minForce = -limit;
      equation.maxForce = limit;
      equation.setSpookParams(i < 3 ? 8e5 : 2e4, 4, FIXED_STEP);
    });
    this.world.addConstraint(constraint);
    this.bonds.push({ a: tile.cell.id, b: neighbor?.cell.id ?? null, constraint, forceLimit, torqueLimit, baseForceLimit: forceLimit, baseTorqueLimit: torqueLimit, stress: 0, overloadTime: 0, broken: false, wobble: 0 });
  }

  private compressionAt(id: string, excluding?: string) {
    const tile = this.tiles.get(id)!;
    const directions: Array<{ x: number; z: number }> = [];
    for (const bond of this.bonds) {
      if (bond.broken || bond.a === excluding || bond.b === excluding) continue;
      if (bond.a !== id && bond.b !== id) continue;
      const other = bond.a === id ? bond.b : bond.a;
      if (other === null) directions.push({ x: tile.cell.x, z: tile.cell.z });
      else {
        const neighbor = this.tiles.get(other)!;
        directions.push({ x: neighbor.body.position.x - tile.body.position.x, z: neighbor.body.position.z - tile.body.position.z });
      }
    }
    return compressionFactor(directions, this.friction);
  }

  private updateCompression() {
    if (!this.compressionDirty) return;
    let released: boolean;
    do {
      released = false;
      for (const tile of this.tiles.values()) {
        if (tile.removed) { tile.compression = 0; continue; }
        tile.compression = this.compressionAt(tile.cell.id);
        if (tile.compression > 0) continue;
        for (const bond of this.bonds) {
          if (!bond.broken && (bond.a === tile.cell.id || bond.b === tile.cell.id)) { this.breakBond(bond); released = true; }
        }
      }
    } while (released);
    for (const bond of this.bonds) {
      if (bond.broken) continue;
      const compression = Math.min(this.tiles.get(bond.a)!.compression, bond.b === null ? 1 : this.tiles.get(bond.b)!.compression);
      bond.forceLimit = bond.baseForceLimit * compression;
      bond.torqueLimit = bond.baseTorqueLimit * compression;
      bond.constraint.equations.forEach((equation, index) => {
        const impulse = (index < 3 ? bond.forceLimit : bond.torqueLimit) * FIXED_STEP;
        equation.maxForce = impulse;
        equation.minForce = -impulse;
      });
    }
    this.compressionDirty = false;
  }

  private flexBond(bond: IceBond) {
    bond.constraint.equations.forEach((equation, i) => {
      const stiffness = i < 3 ? 8e5 / (1 + bond.wobble * 12000) : 2e4 / (1 + bond.wobble * 200);
      equation.setSpookParams(stiffness, 4 - bond.wobble * 2, FIXED_STEP);
    });
  }

  private transmitImpact(source: IceBody, contacts: string[]) {
    const adjacency = new Map<string, string[]>();
    const supports = new Map<string, number>();
    for (const bond of this.bonds) {
      if (bond.broken) continue;
      supports.set(bond.a, (supports.get(bond.a) ?? 0) + (bond.b === null ? 3 : 1));
      if (bond.b === null) continue;
      supports.set(bond.b, (supports.get(bond.b) ?? 0) + 1);
      for (const [a, b] of [[bond.a, bond.b], [bond.b, bond.a]]) {
        if (!adjacency.has(a)) adjacency.set(a, []);
        adjacency.get(a)!.push(b);
      }
    }
    const distance = new Map<string, number>();
    const queue: string[] = [];
    for (const id of contacts) {
      const neighbor = this.tiles.get(id);
      if (!neighbor || neighbor.removed) continue;
      distance.set(id, 0);
      queue.push(id);
      const weakness = Math.max(0, 6 - (supports.get(id) ?? 0)) / 6;
      const contact = source.body.position.vsub(neighbor.body.position);
      contact.y = 0;
      contact.normalize();
      contact.scale(TILE_RADIUS * 0.7, contact);
      contact.y = ICE_HEIGHT / 2;
      neighbor.body.applyImpulse(new CANNON.Vec3(0, -0.035 - weakness * 0.035, 0), contact);
    }
    // Only surviving connections carry the shock, with attenuation across each edge.
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i], depth = distance.get(id)!;
      if (depth >= 4) continue;
      for (const next of adjacency.get(id) ?? []) {
        if (distance.has(next)) continue;
        distance.set(next, depth + 1);
        queue.push(next);
      }
    }
    for (const bond of this.bonds) {
      if (bond.broken) continue;
      const depth = Math.min(distance.get(bond.a) ?? Infinity, bond.b === null ? Infinity : distance.get(bond.b) ?? Infinity);
      if (!Number.isFinite(depth)) continue;
      const grip = Math.min(supports.get(bond.a) ?? 0, bond.b === null ? 6 : supports.get(bond.b) ?? 0);
      const weakness = Math.min(1, Math.max(0, 6 - grip) / 6 + Math.max(0, bond.stress - 0.5) * 0.6);
      const strength = (0.2 + weakness * 0.8) * Math.pow(0.62, depth) * (bond.b === null ? 0.3 : 1);
      bond.wobble = Math.max(bond.wobble, strength);
      this.flexBond(bond);
    }
  }

  private breakBond(bond: IceBond) {
    if (bond.broken) return;
    bond.broken = true;
    this.world.removeConstraint(bond.constraint);
    bond.constraint.bodyA.wakeUp();
    bond.constraint.bodyB.wakeUp();
    this.lastFracture = this.time;
    this.compressionDirty = true;
  }

  private afterStep() {
    this.time += FIXED_STEP;
    if (!this.fractureEnabled) return;
    for (const bond of this.bonds) {
      if (bond.broken) continue;
      const equations = bond.constraint.equations;
      const force = Math.hypot(...equations.slice(0, 3).map(equation => equation.multiplier));
      const torque = Math.hypot(...equations.slice(3).map(equation => equation.multiplier));
      bond.stress = Math.max(force / bond.forceLimit, torque / bond.torqueLimit);
      const a = bond.constraint.bodyA.pointToWorldFrame(bond.constraint.pivotA);
      const b = bond.constraint.bodyB.pointToWorldFrame(bond.constraint.pivotB);
      const separation = a.distanceTo(b);
      const qa = bond.constraint.bodyA.quaternion, qb = bond.constraint.bodyB.quaternion;
      const angle = 2 * Math.acos(Math.min(1, Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w)));
      const slipping = separation > GRIP_SLIP_DISTANCE || angle > GRIP_SLIP_ANGLE;
      // Static grip can carry near-limit loads. Release requires persistent physical slip.
      const losingGrip = bond.stress >= 0.98 && slipping;
      bond.overloadTime = losingGrip ? bond.overloadTime + FIXED_STEP : Math.max(0, bond.overloadTime - FIXED_STEP * 2);
      if (bond.overloadTime > GRIP_RELEASE_TIME || separation > 0.16 || angle > 0.22) this.breakBond(bond);
      if (bond.wobble > 0) {
        bond.wobble *= Math.exp(-FIXED_STEP / 0.16);
        if (bond.wobble < 0.002) bond.wobble = 0;
        this.flexBond(bond);
      }
    }
    for (const tile of this.tiles.values()) {
      if (!tile.removed && tile.body.position.y < ICE_Y - 0.42) {
        tile.removed = true;
        for (const bond of this.bonds) if (bond.a === tile.cell.id || bond.b === tile.cell.id) this.breakBond(bond);
      }
    }
    this.updateCompression();
    this.applyWaterForces();
  }

  private applyWaterForces() {
    const gravity = Math.abs(this.world.gravity.y);
    for (const tile of this.tiles.values()) {
      if (!tile.removed || !tile.body.world) continue;
      const submerged = Math.max(0, Math.min(1, (WATER_LEVEL - tile.body.position.y + ICE_HEIGHT / 2) / ICE_HEIGHT));
      if (!submerged) continue;
      tile.body.force.y += tile.body.mass * gravity * 1.35 * submerged;
      tile.body.velocity.scale(Math.exp(-6 * submerged * FIXED_STEP), tile.body.velocity);
      tile.body.angularVelocity.scale(Math.exp(-5 * submerged * FIXED_STEP), tile.body.angularVelocity);
    }
    if (this.lost) {
      const submerged = Math.max(0, Math.min(1, (WATER_LEVEL - this.penguin.position.y + PENGUIN_COM_Y) / 1.2));
      if (!submerged) return;
      this.penguin.force.y += this.penguin.mass * gravity * 2.5 * submerged;
      this.penguin.velocity.scale(Math.exp(-5 * submerged * FIXED_STEP), this.penguin.velocity);
      this.penguin.angularVelocity.scale(Math.exp(-4 * submerged * FIXED_STEP), this.penguin.angularVelocity);
      const up = this.penguin.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      const righting = up.cross(new CANNON.Vec3(0, 1, 0));
      this.penguin.torque.x += righting.x * submerged * 0.9;
      this.penguin.torque.z += righting.z * submerged * 0.9;
    }
  }

  step(delta: number) {
    this.world.step(FIXED_STEP, delta, 4);
    for (const tile of this.tiles.values()) {
      if (tile.body.position.y < -12 && tile.body.world) this.world.removeBody(tile.body);
    }
  }

  strike(id: string) {
    const tile = this.tiles.get(id);
    if (!tile || tile.removed) return false;
    const contacts = this.bonds.filter(bond => !bond.broken && bond.b !== null && (bond.a === id || bond.b === id)).map(bond => bond.a === id ? bond.b! : bond.a);
    for (const body of this.world.bodies) if (body.mass) body.wakeUp();
    tile.struck = true;
    tile.removed = true;
    for (const bond of this.bonds) if (bond.a === id || bond.b === id) this.breakBond(bond);
    this.updateCompression();
    tile.body.applyImpulse(new CANNON.Vec3(0, -0.55, 0), new CANNON.Vec3(0.07, 0.2, 0.025));
    this.transmitImpact(tile, contacts);
    return true;
  }

  get remaining() { return [...this.tiles.values()].filter(tile => !tile.removed).length; }
  get lost() { return this.penguin.position.y < 0.45 + PENGUIN_COM_Y; }
  get wobble() { return Math.max(0, ...this.bonds.filter(bond => !bond.broken).map(bond => bond.wobble)); }

  getPenguinCondition(): PenguinCondition {
    const beneath = new Set([...this.tiles.values()].filter(tile => !tile.removed && Math.hypot(tile.body.position.x - this.penguin.position.x, tile.body.position.z - this.penguin.position.z) < 0.95).map(tile => tile.cell.id));
    const supportBonds = this.bonds.filter(bond => !bond.broken && (beneath.has(bond.a) || (bond.b !== null && beneath.has(bond.b))));
    const up = this.penguin.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    return {
      remainingRatio: this.remaining / this.cells.length,
      supports: supportBonds.length,
      stress: Math.max(0, ...supportBonds.map(bond => bond.stress)),
      tilt: Math.acos(Math.max(-1, Math.min(1, up.y))),
      fallingSpeed: Math.max(0, -this.penguin.velocity.y),
      wobble: this.wobble,
      lost: this.lost,
      inWater: this.penguin.position.y - PENGUIN_COM_Y < WATER_LEVEL + 0.05,
    };
  }

  get stable() {
    if (this.lost || this.wobble > 0.03 || this.time - this.lastFracture < 0.55) return false;
    if (this.penguin.velocity.length() > 0.055 || this.penguin.angularVelocity.length() > 0.08) return false;
    if (this.bonds.some(bond => !bond.broken && bond.overloadTime > 0)) return false;
    return [...this.tiles.values()].every(tile => tile.removed || (tile.body.velocity.length() < 0.045 && tile.body.angularVelocity.length() < 0.07));
  }

  chooseBotMove(random: () => number = Math.random) {
    const candidates = [...this.tiles.values()].filter(tile => !tile.removed);
    if (!candidates.length) return null;
    const ranked = candidates.map(tile => {
      const distance = Math.hypot(tile.body.position.x - this.penguin.position.x, tile.body.position.z - this.penguin.position.z);
      const bonds = this.bonds.filter(bond => !bond.broken && (bond.a === tile.cell.id || bond.b === tile.cell.id));
      const stress = Math.max(0, ...bonds.map(bond => bond.stress));
      const neighbors = bonds.map(bond => bond.a === tile.cell.id ? bond.b : bond.a).filter((id): id is string => id !== null);
      const unsupported = neighbors.filter(id => this.compressionAt(id, tile.cell.id) === 0).length;
      const risk = 4 / (distance + 0.25) + stress * 1.3 + unsupported * 1.3 + (bonds.length < 3 ? 0.8 : 0) + (tile.cell.rim ? 0.45 : 0);
      return { id: tile.cell.id, score: risk + random() * 1.5 };
    });
    ranked.sort((a, b) => a.score - b.score);
    return ranked[0].id;
  }

  getDiagnostics() {
    return {
      dynamicTiles: [...this.tiles.values()].filter(tile => tile.body.mass > 0).length,
      activeBonds: this.bonds.filter(bond => !bond.broken).length,
      brokenBonds: this.bonds.filter(bond => bond.broken).length,
      maxStress: Math.max(0, ...this.bonds.filter(bond => !bond.broken).map(bond => bond.stress)),
      wobble: this.wobble,
      floatingIce: [...this.tiles.values()].filter(tile => tile.removed && tile.body.position.y < WATER_LEVEL + ICE_HEIGHT).length,
      stable: this.stable,
    };
  }
}
