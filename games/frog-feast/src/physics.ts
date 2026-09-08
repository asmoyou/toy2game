import * as CANNON from 'cannon-es';
import { BEAN_COUNT, BEAN_RADIUS, DECK_Y, FROG_RADIUS, STEP, TEAMS, mouthPose } from './config.ts';

export type Bean = { id: number; color: number; body: CANNON.Body; owner: number | null; caughtAt: number };

export class PondPhysics {
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0), allowSleep: false });
  readonly beans: Bean[] = [];
  private material = new CANNON.Material('bean');

  constructor(random: () => number) {
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = 0.78;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    // The toy's shallow bowl is approximated on a horizontal plane. Its inward slope and
    // gentle automatic rocking are accelerations; sphere contacts still determine motion.
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.28, 0.5, 0.12)), position: new CANNON.Vec3(Math.cos(angle) * 5.06, DECK_Y, Math.sin(angle) * 5.06) });
      wall.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2 - angle);
      this.world.addBody(wall);
    }
    for (const team of TEAMS) {
      this.world.addBody(new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(0.88), position: new CANNON.Vec3(Math.cos(team.angle) * (FROG_RADIUS + 0.2), DECK_Y + BEAN_RADIUS, Math.sin(team.angle) * (FROG_RADIUS + 0.2)) }));
    }
    const rotation = random() * Math.PI * 2;
    for (let id = 0; id < BEAN_COUNT; id++) {
      const angle = id * 2.399963229728653 + rotation;
      const radius = Math.sqrt((id + 0.5) / BEAN_COUNT) * 2.65;
      const body = new CANNON.Body({ mass: 0.025, shape: new CANNON.Sphere(BEAN_RADIUS), material: this.material, position: new CANNON.Vec3(Math.cos(angle) * radius, DECK_Y + BEAN_RADIUS, Math.sin(angle) * radius), linearDamping: 0.12 });
      body.linearFactor.set(1, 0, 1);
      body.angularFactor.set(0, 0, 0);
      body.velocity.set((random() - 0.5) * 4, 0, (random() - 0.5) * 4);
      this.world.addBody(body);
      this.beans.push({ id, color: id % 4, body, owner: null, caughtAt: -1 });
    }
  }

  step(time: number) {
    for (const bean of this.beans) {
      if (bean.owner !== null) continue;
      const b = bean.body;
      b.force.set((Math.cos(time * 1.31) * 2.7 - b.position.x * 0.85) * b.mass, 0, (Math.sin(time * 1.73) * 2.7 - b.position.z * 0.85) * b.mass);
    }
    this.world.step(STEP);
  }

  inMouth(bean: Bean, owner: number, age: number) {
    if (bean.owner !== null || !TEAMS[owner]) return false;
    const { angle } = TEAMS[owner], p = bean.body.position;
    const radial = p.x * Math.cos(angle) + p.z * Math.sin(angle);
    const side = p.x * -Math.sin(angle) + p.z * Math.cos(angle);
    const center = FROG_RADIUS - mouthPose(age).reach - 0.68;
    return (side / 0.86) ** 2 + ((radial - center) / 0.92) ** 2 <= 1;
  }

  capture(owner: number, age: number, time: number, limit: number) {
    const caught = this.beans.filter(bean => this.inMouth(bean, owner, age)).slice(0, limit);
    for (const bean of caught) {
      bean.owner = owner; bean.caughtAt = time;
      this.world.removeBody(bean.body);
    }
    return caught;
  }

  dispose() { for (const body of [...this.world.bodies]) this.world.removeBody(body); }
}
