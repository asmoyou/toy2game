import * as CANNON from 'cannon-es';
import { SLOTS, RINGS, BOARD_RADIUS, DECK_THICKNESS, DECK_CENTER_Y, PIVOT_LOCAL_Y, deckSurface } from './board.ts';

export const STEP = 1 / 120;
export const WORLD_METERS = 0.02;
export const PIVOT_Y = 5.4;
export const COM_DEPTH = PIVOT_LOCAL_Y - DECK_CENTER_Y;
export const CREW_COM = 0.48;
export const CREW_MASS = 0.0025;
export const PLATE_MASS = 0.18;
export type CrewBody = { slot: number; owner: number; body: CANNON.Body };

export class BalancePhysics {
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true });
  readonly plate: CANNON.Body;
  readonly crew = new Map<number, CrewBody>();
  private up = new CANNON.Vec3();
  private material = new CANNON.Material('astronaut');
  private floorMaterial = new CANNON.Material('floor');
  private restTime = 0;
  private restOrigins = new Map<CANNON.Body, { position: CANNON.Vec3; quaternion: CANNON.Quaternion }>();

  constructor(options: { gravity?: number } = {}) {
    this.world.gravity.set(0, (options.gravity ?? -9.81) / WORLD_METERS, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.solver as CANNON.GSSolver).iterations = 28;
    (this.world.solver as CANNON.GSSolver).tolerance = 0.0001;
    this.world.defaultContactMaterial.friction = 0.38;
    this.world.defaultContactMaterial.restitution = 0.01;
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.material, this.material, { friction: 0.38, restitution: 0 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.material, this.floorMaterial, { friction: 0.6, restitution: 0.12 }));
    const floor = new CANNON.Body({ mass: 0, material: this.floorMaterial });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);
    const stand = new CANNON.Body({ mass: 0, material: this.floorMaterial });
    stand.addShape(new CANNON.Cylinder(1.2, 1.65, 0.6, 16), new CANNON.Vec3(0, 0.3, 0));
    stand.addShape(new CANNON.Cylinder(0.17, 0.24, PIVOT_Y - 0.75, 12), new CANNON.Vec3(0, (PIVOT_Y + 0.25) / 2, 0));
    this.world.addBody(stand);
    this.plate = new CANNON.Body({ mass: PLATE_MASS, material: this.material, position: new CANNON.Vec3(0, PIVOT_Y - COM_DEPTH, 0), angularDamping: 0.999, linearDamping: 0.2, allowSleep: false });
    this.makeDeck();
    this.world.addBody(this.plate);
    const pivot = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(0, PIVOT_Y, 0) });
    this.world.addBody(pivot);
    const joint = new CANNON.PointToPointConstraint(this.plate, new CANNON.Vec3(0, COM_DEPTH, 0), pivot, new CANNON.Vec3(), 1e5);
    joint.collideConnected = false;
    this.world.addConstraint(joint);
  }

  private makeDeck() {
    let tiltInertia = 0, yawInertia = 0;
    for (const [index, ring] of RINGS.entries()) {
      const inner = RINGS[index - 1]?.edge ?? 0;
      const centerY = ring.height - DECK_THICKNESS / 2 - DECK_CENTER_Y;
      const mass = PLATE_MASS * (ring.edge ** 2 - inner ** 2) / BOARD_RADIUS ** 2;
      tiltInertia += mass * ((ring.edge ** 2 + inner ** 2) / 4 + DECK_THICKNESS ** 2 / 12 + centerY ** 2);
      yawInertia += mass * (ring.edge ** 2 + inner ** 2) / 2;
      if (!index) {
        this.plate.addShape(new CANNON.Cylinder(ring.edge, ring.edge, DECK_THICKNESS, 36), new CANNON.Vec3(0, centerY, 0));
        continue;
      }
      // Annular wedges leave the underside stepped and hollow, matching the visible plate.
      for (let segment = 0; segment < 18; segment++) {
        const a = segment / 18 * Math.PI * 2, b = (segment + 1) / 18 * Math.PI * 2;
        const outline = [[inner, a], [ring.edge, a], [ring.edge, b], [inner, b]].map(([radius, angle]) => ({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }));
        const x = outline.reduce((sum, point) => sum + point.x, 0) / 4;
        const z = outline.reduce((sum, point) => sum + point.z, 0) / 4;
        const vertices = [-DECK_THICKNESS / 2, DECK_THICKNESS / 2].flatMap(y => outline.map(point => new CANNON.Vec3(point.x - x, y, point.z - z)));
        const shape = new CANNON.ConvexPolyhedron({ vertices, faces: [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]] });
        this.plate.addShape(shape, new CANNON.Vec3(x, centerY, z));
      }
    }
    // Use the uniform shell's mass distribution instead of the compound body's bounding box.
    this.plate.inertia.set(tiltInertia, yawInertia, tiltInertia);
    this.plate.invInertia.set(1 / tiltInertia, 1 / yawInertia, 1 / tiltInertia);
    this.plate.updateInertiaWorld(true);
  }

  add(slot: number, owner: number) {
    if (this.crew.has(slot) || !SLOTS[slot]) return false;
    const spot = SLOTS[slot];
    const position = this.plate.pointToWorldFrame(new CANNON.Vec3(spot.x, deckSurface(spot) + CREW_COM + 0.01, spot.z));
    const body = new CANNON.Body({ mass: CREW_MASS, material: this.material, position, quaternion: this.plate.quaternion.clone(), angularDamping: 0.48, linearDamping: 0.28, sleepSpeedLimit: 0.035, sleepTimeLimit: 0.8 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.20, 0.09, 0.18)), new CANNON.Vec3(0, 0.09 - CREW_COM, 0));
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.17, 0.18, 0.13)), new CANNON.Vec3(0, 0.48 - CREW_COM, 0));
    body.addShape(new CANNON.Sphere(0.255), new CANNON.Vec3(0, 0.82 - CREW_COM, 0));
    this.crew.set(slot, { slot, owner, body });
    this.world.addBody(body);
    this.restTime = 0;
    this.restOrigins.clear();
    this.crew.forEach(crew => crew.body.wakeUp());
    return true;
  }

  step() {
    this.world.step(STEP);
    // Measure sustained pose changes: contact-solver velocity spikes can occur on stationary feet.
    const bodies = [this.plate, ...[...this.crew.values()].map(crew => crew.body)];
    const moving = bodies.some(body => {
      const origin = this.restOrigins.get(body);
      if (!origin || body.position.distanceSquared(origin.position) > 0.008 ** 2) return true;
      const a = body.quaternion, b = origin.quaternion;
      return Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) < Math.cos(0.01 / 2);
    });
    if (moving) {
      this.restTime = 0;
      for (const body of bodies) this.restOrigins.set(body, { position: body.position.clone(), quaternion: body.quaternion.clone() });
    } else this.restTime += STEP;
  }

  get tilt() {
    this.plate.quaternion.vmult(new CANNON.Vec3(0, 1, 0), this.up);
    return Math.acos(Math.max(-1, Math.min(1, this.up.y))) * 180 / Math.PI;
  }

  get lean() {
    this.plate.quaternion.vmult(new CANNON.Vec3(0, 1, 0), this.up);
    return { x: this.up.x, z: this.up.z };
  }

  get fallen() {
    const deckUp = this.plate.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    return [...this.crew.values()].filter(({ body }) => {
      const local = this.plate.pointToLocalFrame(body.position);
      const radius = Math.hypot(local.x, local.z);
      const ring = RINGS.find(ring => radius <= ring.edge) ?? RINGS[RINGS.length - 1];
      const bodyUp = body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      return body.position.y < 1.35 || radius > BOARD_RADIUS + 0.4 || local.y < ring.height - DECK_CENTER_Y - 0.15 || bodyUp.dot(deckUp) < 0.5;
    }).map(crew => crew.slot);
  }

  get stable() {
    const moment = this.moment();
    const x = moment.x + this.plate.position.x * PLATE_MASS;
    const z = moment.z + this.plate.position.z * PLATE_MASS;
    return this.restTime >= 0.75 && Math.hypot(x, z) < 0.0003;
  }

  moment() {
    let x = 0, z = 0;
    for (const { body } of this.crew.values()) {
      x += body.position.x * CREW_MASS;
      z += body.position.z * CREW_MASS;
    }
    return { x, z };
  }

  dispose() {
    for (const constraint of [...this.world.constraints]) this.world.removeConstraint(constraint);
    for (const body of [...this.world.bodies]) this.world.removeBody(body);
    this.crew.clear();
    this.restOrigins.clear();
  }
}
