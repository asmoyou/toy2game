import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BEAN_RADIUS, DECK_Y, FROG_RADIUS, TEAMS } from './config';

export type FrogModel = { root: THREE.Group; head: THREE.Group; jaw: THREE.Group; lever: THREE.Group; label: THREE.Mesh; target: THREE.Mesh };

export class ToyModels {
  private materials = new Map<string, THREE.MeshPhysicalMaterial>();
  private geometries = new Set<THREE.BufferGeometry>();
  private textures = new Set<THREE.Texture>();
  readonly sphere = new THREE.SphereGeometry(1, 28, 18);

  material(color: string, roughness = 0.3) {
    const key = `${color}:${roughness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: roughness < 0.5 ? 0.4 : 0, clearcoatRoughness: 0.3 }));
    return this.materials.get(key)!;
  }

  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }

  ball(parent: THREE.Object3D, color: string, at: number[], scale: number[]) {
    const mesh = this.mesh(parent, this.sphere, this.material(color), at[0], at[1], at[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]); return mesh;
  }

  box(parent: THREE.Object3D, color: string, at: number[], size: number[], radius = 0.08) {
    return this.mesh(parent, new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), this.material(color), at[0], at[1], at[2]);
  }

  ring(parent: THREE.Object3D, color: string, radius: number, tube: number, y: number) {
    const mesh = this.mesh(parent, new THREE.TorusGeometry(radius, tube, 10, 100), this.material(color), 0, y, 0);
    mesh.rotation.x = Math.PI / 2; return mesh;
  }

  private mergeParts(parent: THREE.Group, recursive: boolean, skip: THREE.Object3D[] = []) {
    parent.updateMatrixWorld(true);
    const inverse = parent.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    const collect = (object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh) || skip.includes(object) || Array.isArray(object.material)) return;
      const batch = batches.get(object.material) ?? []; batch.push(object); batches.set(object.material, batch);
    };
    if (recursive) parent.traverse(collect); else parent.children.forEach(collect);
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        return geometry;
      });
      const merged = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      if (!merged) continue;
      meshes.forEach(mesh => mesh.removeFromParent());
      this.mesh(parent, merged, material);
    }
  }

  board() {
    const group = new THREE.Group();
    this.mesh(group, new THREE.CylinderGeometry(5.28, 5.12, 0.55, 100), this.material('#0672c7'), 0, 0.06, 0);
    this.mesh(group, new THREE.CylinderGeometry(5.12, 5.12, 0.1, 100), this.material('#098de4'), 0, DECK_Y - 0.05, 0);
    const wall = this.mesh(group, new THREE.CylinderGeometry(5.21, 5.21, 0.53, 100, 1, true), this.material('#087bd0'), 0, DECK_Y + 0.17, 0);
    wall.material.side = THREE.DoubleSide;
    this.ring(group, '#159ded', 5.22, 0.16, DECK_Y + 0.44);
    this.ring(group, '#0766b7', 5.15, 0.055, -0.13);
    this.ring(group, '#41a9eb', 4.92, 0.024, DECK_Y + 0.008);
    // Moulded rings and recesses remain subtle so the moving beans are easy to see.
    this.ring(group, '#0786d9', 2.94, 0.018, DECK_Y + 0.008);
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      const rib = this.box(group, '#0877c9', [Math.cos(a) * 5.22, 0.1, Math.sin(a) * 5.22], [0.035, 0.23, 0.06], 0.012);
      rib.rotation.y = -a;
    }
    for (const team of TEAMS) {
      const tray = new THREE.Group();
      tray.position.set(Math.cos(team.angle) * 5.7, 0, Math.sin(team.angle) * 5.7);
      tray.rotation.y = -team.angle - Math.PI / 2;
      group.add(tray);
      this.box(tray, '#ffd045', [0, -0.08, -0.18], [1.92, 0.18, 1.8], 0.16);
      this.box(tray, '#f9bb21', [0, 0.12, -0.98], [1.92, 0.35, 0.15]);
      for (const side of [-1, 1]) this.box(tray, '#ffd045', [side * 0.88, 0.12, -0.18], [0.15, 0.35, 1.7]);
      this.box(tray, '#ffdc58', [0, 0.1, 0.63], [1.92, 0.3, 0.15]);
      this.box(tray, '#e7a617', [0, -0.19, -0.4], [1.45, 0.13, 0.9]);
      this.box(tray, '#0977c5', [0, 0.08, 0.67], [0.95, 0.4, 0.22]);
    }
    this.mergeParts(group, true);
    return group;
  }

  frog(owner: number): FrogModel {
    const { color, angle } = TEAMS[owner];
    const root = new THREE.Group();
    root.position.set(Math.cos(angle) * FROG_RADIUS, DECK_Y, Math.sin(angle) * FROG_RADIUS);
    root.rotation.y = -angle - Math.PI / 2;
    this.ball(root, color, [0, 0.39, -0.36], [0.91, 0.56, 0.98]);
    const belly = this.ball(root, color, [0, 0.16, 0.28], [1.04, 0.22, 1.06]);
    belly.receiveShadow = true;
    for (const side of [-1, 1]) {
      this.ball(root, color, [side * 0.98, 0.24, -0.47], [0.49, 0.26, 0.6]).rotation.y = side * -0.4;
      const foot = this.ball(root, color, [side * 1.13, 0.1, 0.04], [0.43, 0.14, 0.58]);
      foot.rotation.y = side * -0.35;
      for (let toe = 0; toe < 3; toe++) {
        this.ball(root, color, [side * (0.89 + toe * 0.21), 0.09, 0.46 - Math.abs(toe - 1) * 0.09], [0.13, 0.1, 0.25]);
        this.ball(root, '#ffffff', [side * (1.01 + toe * 0.12), 0.227, -0.01], [0.016, 0.009, 0.2]).material = this.material(color);
      }
    }
    const jaw = new THREE.Group(); root.add(jaw);
    this.ball(jaw, color, [0, 0.18, 0.42], [1.02, 0.2, 1.04]);
    this.ball(jaw, '#5e3030', [0, 0.31, 0.47], [0.87, 0.1, 0.91]);
    this.ball(jaw, '#ee8d82', [0, 0.35, 0.84], [0.46, 0.04, 0.49]);
    const head = new THREE.Group(); head.position.set(0, 0.36, -0.56); root.add(head);
    const shell = this.mesh(head, new THREE.SphereGeometry(1, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2), this.material(color), 0, 0, 0.7);
    shell.scale.set(1.07, 0.86, 1.13);
    const lip = this.ring(head, color, 1, 0.055, 0.02); lip.position.z = 0.7; lip.scale.set(1.04, 1.11, 1);
    for (const side of [-1, 1]) {
      this.ball(head, color, [side * 0.52, 0.71, 0.57], [0.4, 0.42, 0.39]);
      this.ball(head, '#fffef1', [side * 0.52, 0.88, 0.68], [0.285, 0.29, 0.26]);
      this.ball(head, '#233c38', [side * 0.5, 1.12, 0.79], [0.125, 0.065, 0.135]);
      this.ball(head, '#ffffff', [side * 0.5 - 0.035, 1.177, 0.75], [0.045, 0.018, 0.043]);
      this.ball(head, '#ffffff', [side * 0.5 + 0.038, 1.168, 0.85], [0.018, 0.012, 0.019]);
      this.ball(head, '#344d29', [side * 0.26, 0.355, 1.69], [0.052, 0.047, 0.025]);
      this.ball(head, '#ffd2a0', [side * 0.8, 0.27, 1.4], [0.14, 0.075, 0.035]);
    }
    this.box(root, '#0877c9', [0, 0.15, -1.44], [1.61, 0.62, 1.07], 0.12);
    this.box(root, color, [0, 0.52, -1.48], [1.72, 0.23, 1.25], 0.12);
    const label = this.sticker(root, owner);
    label.position.set(0, 0.645, -1.48);
    const lever = new THREE.Group(); lever.position.set(0, 0.51, -1.85); root.add(lever);
    this.box(lever, color, [0, 0.04, -0.53], [1.58, 0.17, 1.14], 0.1);
    for (let i = 0; i < 6; i++) this.box(lever, color, [0, 0.14, -0.12 - i * 0.16], [1.38, 0.055, 0.038], 0.015);
    const target = this.mesh(root, new THREE.BoxGeometry(2.55, 2, 4.2), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.6, -0.3);
    target.userData.owner = owner;
    this.mergeParts(root, false, [label, target]);
    this.mergeParts(head, true); this.mergeParts(jaw, true); this.mergeParts(lever, true);
    return { root, head, jaw, lever, label, target };
  }

  private sticker(parent: THREE.Object3D, owner: number) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff9df'; ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#dceaaf';
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc((i * 71) % 256, (i * 53) % 160, 11, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#405e35'; ctx.font = 'bold 58px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${owner + 1}`, 128, 72);
    ctx.font = 'bold 23px sans-serif'; ctx.fillText('FROG FEAST', 128, 121);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
    const material = this.material(`#fefef${owner}`, 0.55).clone(); material.color.set('#ffffff'); material.map = texture;
    this.materials.set(`sticker-${owner}`, material);
    const mesh = this.mesh(parent, new THREE.PlaneGeometry(1.31, 0.86), material);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = false; return mesh;
  }

  bean(parent: THREE.Object3D, color: string) { return this.ball(parent, color, [0, 0, 0], [BEAN_RADIUS, BEAN_RADIUS, BEAN_RADIUS]); }

  dispose() {
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
  }
}
