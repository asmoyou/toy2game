import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PenguinMood } from './penguin-mood';

const HEAD_Y = 1.08;
const POSES: Record<PenguinMood, { eyes: number; brow: number; open: number; wings: number }> = {
  happy: { eyes: 1, brow: 0, open: 0, wings: 0.25 },
  alert: { eyes: 1.1, brow: 0.3, open: 0.2, wings: 0.5 },
  surprised: { eyes: 1.6, brow: 0, open: 1, wings: 1.1 },
  scared: { eyes: 1.35, brow: 0.5, open: 0.75, wings: 1.2 },
  falling: { eyes: 0.5, brow: 0.5, open: 1, wings: 1.4 },
  swimming: { eyes: 1, brow: 0, open: 0.15, wings: 0.95 },
};

export class PenguinActor extends THREE.Group {
  private head = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private smilingEyes: THREE.Mesh[] = [];
  private dizzyEyes: THREE.Group[] = [];
  private eyebrows: THREE.Mesh[] = [];
  private wingLeft!: THREE.Mesh;
  private wingRight!: THREE.Mesh;
  private lowerBeak!: THREE.Mesh;
  private mouth!: THREE.Mesh;
  private sweat = new THREE.Group();
  private mood: PenguinMood = 'happy';
  private expression = { ...POSES.happy };

  constructor() {
    super();
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const body = mat(0x263c49), white = mat(0xfffdfa), coral = mat(0xf28476), orange = mat(0xffbd54), black = mat(0x172c36);
    const sphere = new THREE.SphereGeometry(1, 28, 20);
    const part = (material: THREE.Material, position: number[], scale: number[], head = false) => {
      const mesh = this.mesh(sphere, material, head ? this.head : this, [position[0], position[1] - (head ? HEAD_Y : 0), position[2]]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      return mesh;
    };
    this.head.position.y = HEAD_Y;
    this.add(this.head);
    part(body, [0, 0.76, 0], [0.64, 0.82, 0.53]);
    part(white, [0, 0.68, 0.38], [0.5, 0.61, 0.24]);
    part(body, [0, 1.45, 0.03], [0.57, 0.54, 0.5], true);
    for (const x of [-0.23, 0.23]) {
      part(white, [x * 0.91, 1.41, 0.409], [0.28, 0.29, 0.12], true);
      const eye = part(black, [x, 1.46, 0.526], [0.054, 0.073, 0.035], true);
      this.eyes.push(eye);
      const glint = this.mesh(sphere, white, eye, [-0.22, 0.3, 0.86]);
      glint.scale.set(0.26, 0.26, 0.26);
      const smileCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.065, 0, 0), new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0.065, 0, 0));
      this.smilingEyes.push(this.mesh(new THREE.TubeGeometry(smileCurve, 10, 0.017, 6, false), black, this.head, [x, 1.43 - HEAD_Y, 0.55]));
      const dizzy = new THREE.Group();
      dizzy.position.set(x, 1.46 - HEAD_Y, 0.55);
      for (const angle of [-Math.PI / 4, Math.PI / 4]) {
        const stroke = this.mesh(new RoundedBoxGeometry(0.14, 0.025, 0.025, 1, 0.01), black, dizzy);
        stroke.rotation.z = angle;
      }
      this.head.add(dizzy);
      this.dizzyEyes.push(dizzy);
      this.eyebrows.push(this.mesh(new RoundedBoxGeometry(0.15, 0.026, 0.024, 1, 0.01), black, this.head, [x, 1.61 - HEAD_Y, 0.51]));
      part(mat(0xf7af9d), [x * 1.5, 1.3, 0.48], [0.1, 0.042, 0.025], true);
      part(orange, [x * 1.35, 0.08, 0.23], [0.23, 0.1, 0.34]).rotation.y = x * -0.5;
    }
    part(orange, [0, 1.34, 0.59], [0.15, 0.075, 0.19], true);
    this.lowerBeak = part(orange, [0, 1.27, 0.59], [0.125, 0.045, 0.15], true);
    this.mouth = part(black, [0, 1.285, 0.66], [0.09, 0.008, 0.06], true);
    this.wingLeft = part(body, [-0.61, 0.82, 0], [0.15, 0.46, 0.22]);
    this.wingRight = part(body, [0.61, 0.82, 0], [0.15, 0.46, 0.22]);
    const scarf = this.mesh(new THREE.TorusGeometry(0.44, 0.115, 10, 36), coral, this, [0, 1.075, 0.045]);
    scarf.rotation.x = Math.PI / 2;
    this.mesh(new RoundedBoxGeometry(0.22, 0.52, 0.11, 2, 0.035), coral, this, [0.3, 0.87, 0.48]).rotation.z = -0.18;
    part(coral, [0, 1.84, 0.035], [0.54, 0.35, 0.49], true);
    const hatEdge = this.mesh(new THREE.TorusGeometry(0.48, 0.09, 10, 36), coral, this.head, [0, 1.8 - HEAD_Y, 0.04]);
    hatEdge.rotation.x = Math.PI / 2;
    part(white, [0.055, 2.17, 0.03], [0.135, 0.14, 0.135], true);
    const thread = mat(0xffac99);
    for (let i = 0; i < 14; i++) {
      const angle = i * Math.PI * 2 / 14;
      this.mesh(new THREE.CapsuleGeometry(0.012, 0.09, 2, 4), thread, this.head, [Math.cos(angle) * 0.55, 1.8 - HEAD_Y, 0.04 + Math.sin(angle) * 0.5]).rotation.z = -0.1;
    }
    const water = mat(0x52c1dc);
    const drop = this.mesh(sphere, water, this.sweat);
    drop.scale.set(0.055, 0.08, 0.035);
    this.mesh(new THREE.ConeGeometry(0.05, 0.1, 10), water, this.sweat, [0, 0.085, 0]);
    this.head.add(this.sweat);
    this.update('happy', 0, 1, 0);
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  update(mood: PenguinMood, time: number, delta: number, imbalance: number) {
    this.mood = mood;
    const target = POSES[mood], blend = 1 - Math.exp(-delta * 10);
    for (const key of Object.keys(target) as Array<keyof typeof target>) this.expression[key] = THREE.MathUtils.lerp(this.expression[key], target[key], blend);
    const happy = mood === 'happy' || mood === 'swimming';
    const grin = happy && time % 5.5 > 3.3;
    const blink = time % 4.7 > 4.53;
    for (let i = 0; i < 2; i++) {
      this.eyes[i].visible = !grin && mood !== 'falling';
      this.eyes[i].scale.set(0.054 * Math.sqrt(this.expression.eyes), blink && happy ? 0.01 : 0.073 * this.expression.eyes, 0.035);
      this.smilingEyes[i].visible = grin;
      this.dizzyEyes[i].visible = mood === 'falling';
      this.eyebrows[i].rotation.z = (i === 0 ? 1 : -1) * this.expression.brow;
      this.eyebrows[i].position.y = 1.61 - HEAD_Y + (this.expression.eyes - 1) * 0.06;
    }
    this.lowerBeak.position.y = 1.27 - HEAD_Y - this.expression.open * 0.095;
    this.mouth.position.y = 1.285 - HEAD_Y - this.expression.open * 0.025;
    this.mouth.scale.y = 0.008 + this.expression.open * 0.055;
    const trembling = mood === 'scared' || mood === 'falling';
    this.rotation.z = trembling ? Math.sin(time * 25) * 0.035 : Math.sin(time * 1.8) * 0.018;
    this.rotation.x = mood === 'swimming' ? Math.sin(time * 5) * 0.035 : 0;
    this.scale.y = 1 + Math.sin(time * 2.4) * 0.01 - (mood === 'surprised' ? 0.025 : 0);
    this.head.rotation.y = Math.sin(time * (mood === 'alert' ? 2 : 0.9)) * (mood === 'alert' ? 0.3 : 0.08);
    this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, mood === 'surprised' || mood === 'falling' ? -0.13 : mood === 'alert' ? 0.08 : 0, blend);
    const wave = mood === 'happy' ? Math.pow(Math.max(0, Math.sin(time * 1.5)), 5) * 0.45 : 0;
    const flap = trembling ? Math.sin(time * 28) * 0.2 : 0;
    const spread = this.expression.wings + Math.min(0.25, imbalance * 0.25);
    this.wingLeft.rotation.z = -spread - wave + flap;
    this.wingRight.rotation.z = spread - flap;
    this.wingLeft.rotation.x = mood === 'swimming' ? Math.sin(time * 9) * 0.7 : 0;
    this.wingRight.rotation.x = mood === 'swimming' ? -Math.sin(time * 9) * 0.7 : 0;
    this.sweat.visible = mood === 'scared';
    this.sweat.position.set(0.51, 0.48 - (time * 0.8 % 1) * 0.18, 0.42);
    this.sweat.scale.setScalar(0.8 + Math.sin(time * 6) * 0.1);
  }

  getExpression() { return { mood: this.mood, ...this.expression, grin: this.smilingEyes[0].visible, sweat: this.sweat.visible }; }
}
