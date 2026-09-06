import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SLOTS, PLAYER_COLORS, RINGS, DECK_THICKNESS, DECK_CENTER_Y, deckSurface } from './board';
import { PIVOT_Y } from './physics';

export class ToyModels {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Set<THREE.Texture>();

  material(color: string | number, metalness = 0, roughness = 0.4) {
    const key = `${color}-${metalness}-${roughness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
    return this.materials.get(key)!;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent: THREE.Object3D, size: number[], position: number[], color: string | number, radius = 0.07) {
    return this.mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), this.material(color), parent, position[0], position[1], position[2]);
  }

  sphere(parent: THREE.Object3D, size: number, position: number[], color: string | number) {
    return this.mesh(new THREE.SphereGeometry(size, 24, 16), this.material(color), parent, ...position as [number, number, number]);
  }

  astronaut(owner: number) {
    const group = new THREE.Group();
    const white = '#fafbf7', seam = '#d1ddda';
    const color = owner < 0 ? '#a5b9bd' : PLAYER_COLORS[owner];
    this.box(group, [0.36, 0.34, 0.27], [0, 0.47, 0], white);
    this.box(group, [0.31, 0.3, 0.14], [0, 0.5, -0.18], seam);
    this.box(group, [0.21, 0.14, 0.035], [0, 0.52, 0.153], color, 0.025);
    for (let i = 0; i < 3; i++) this.box(group, [0.025, 0.045, 0.012], [-0.06 + i * 0.06, 0.52, 0.178], white, 0.005);
    const helmet = this.sphere(group, 0.265, [0, 0.84, 0], white);
    helmet.scale.set(1.05, 1, 1);
    const visor = this.mesh(new THREE.SphereGeometry(0.23, 28, 20), this.material(color, 0.52, 0.18), group, 0, 0.85, 0.15);
    visor.scale.set(0.93, 0.83, 0.54);
    const glint = this.sphere(group, 0.041, [-0.09, 0.935, 0.249], '#e4faff');
    glint.scale.set(1.5, 0.45, 0.25);
    const collar = this.mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 24), this.material(seam), group, 0, 0.644, 0);
    collar.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      this.box(group, [0.16, 0.17, 0.24], [side * 0.105, 0.095, 0.035], white, 0.045);
      this.box(group, [0.13, 0.19, 0.16], [side * 0.105, 0.255, 0], white, 0.04);
      this.box(group, [0.13, 0.065, 0.03], [side * 0.105, 0.3, 0.086], color, 0.016);
      const arm = new THREE.Group();
      arm.position.set(side * 0.22, 0.54, 0);
      arm.rotation.z = -side * 0.67;
      this.mesh(new THREE.CapsuleGeometry(0.066, 0.23, 4, 10), this.material(white), arm, 0, 0.18, 0);
      for (let i = 0; i < 4; i++) {
        const band = this.mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 12), this.material(seam), arm, 0, 0.13 + i * 0.045, 0);
        band.rotation.x = Math.PI / 2;
      }
      this.sphere(arm, 0.081, [0, 0.37, 0], white);
      group.add(arm);
    }
    return group;
  }

  platform() {
    const group = new THREE.Group();
    for (const [index, ring] of RINGS.entries()) {
      const shape = new THREE.Shape();
      for (let i = 0; i <= 216; i++) {
        const angle = i / 216 * Math.PI * 2;
        const radius = ring.edge + (index === RINGS.length - 1 ? 0.1 * Math.cos(angle * 18) : 0);
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      if (index) {
        const hole = new THREE.Path();
        hole.absarc(0, 0, RINGS[index - 1].edge, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: DECK_THICKNESS - 0.035, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2, steps: 1, curveSegments: 48 });
      geometry.rotateX(-Math.PI / 2);
      this.mesh(geometry, this.material(['#3dced4', '#29c5ce', '#19bac8', '#12b3c3'][index], 0.08, 0.3), group, 0, ring.height - DECK_CENTER_Y - DECK_THICKNESS + 0.015, 0);
      const rim = this.mesh(new THREE.TorusGeometry(ring.edge - 0.03, 0.025, 8, 120), this.material('#7ce0df'), group, 0, ring.height - DECK_CENTER_Y, 0);
      rim.rotation.x = Math.PI / 2;
    }
    const surface = RINGS[0].height - DECK_CENTER_Y;
    const center = this.mesh(new THREE.CylinderGeometry(0.61, 0.65, 0.035, 48), this.material('#e2f8f4'), group, 0, surface + 0.02, 0);
    center.receiveShadow = true;
    const orbit = this.mesh(new THREE.TorusGeometry(0.39, 0.025, 8, 40), this.material('#1da5b1'), group, 0, surface + 0.05, 0);
    orbit.rotation.x = Math.PI / 2;
    this.sphere(group, 0.11, [0, surface + 0.06, 0], '#eab843').scale.y = 0.35;
    this.sphere(group, 0.063, [0.28, surface + 0.06, -0.27], '#1da5b1').scale.y = 0.4;
    for (const slot of SLOTS) {
      const y = deckSurface(slot);
      this.mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.014, 24), this.material('#16a5b3'), group, slot.x, y + 0.003, slot.z);
      const lip = this.mesh(new THREE.TorusGeometry(0.319, 0.025, 8, 24), this.material('#8be8e5'), group, slot.x, y + 0.015, slot.z);
      lip.rotation.x = Math.PI / 2;
      const label = this.mesh(new THREE.PlaneGeometry(0.32, 0.19), this.labelMaterial(String(slot.id + 1).padStart(2, '0')), group, slot.x, y + 0.013, slot.z + 0.46);
      label.rotation.x = -Math.PI / 2;
      label.castShadow = false;
    }
    return group;
  }

  private labelMaterial(text: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#087c89'; ctx.font = '600 42px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 33);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1 });
    this.materials.set(`label-${text}`, material);
    return material;
  }

  stand() {
    const group = new THREE.Group();
    const base = this.box(group, [3.1, 0.6, 2.7], [0, 0.37, 0], '#17b9c6', 0.23);
    base.rotation.y = 0.08;
    this.mesh(new THREE.CylinderGeometry(0.55, 0.85, 0.2, 40), this.material('#54d6d8'), group, 0, 0.7, 0);
    this.mesh(new THREE.CylinderGeometry(0.2, 0.27, PIVOT_Y - 0.8, 24), this.material('#37ccd1', 0.08), group, 0, (PIVOT_Y + 0.8) / 2, 0);
    this.box(group, [0.12, PIVOT_Y - 1.15, 0.44], [0, (PIVOT_Y + 0.55) / 2, 0], '#a1eeea', 0.015);
    this.sphere(group, 0.27, [0, PIVOT_Y - 0.06, 0], '#e4c156');
    const badge = this.box(group, [0.83, 0.025, 0.57], [0, 0.684, 0.75], '#dff8ef', 0.045);
    badge.rotation.x = 0.15;
    this.box(group, [0.11, 0.03, 0.26], [-0.1, 0.72, 0.76], '#147e93', 0.02);
    this.box(group, [0.11, 0.03, 0.16], [0.1, 0.72, 0.81], '#e9b940', 0.02);
    for (const x of [-1.08, 1.08]) {
      this.mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.08, 16), this.material('#437c81'), group, x, 0.055, 0.88);
      this.mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.08, 16), this.material('#437c81'), group, x, 0.055, -0.88);
    }
    return group;
  }

  dispose() {
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
  }
}
