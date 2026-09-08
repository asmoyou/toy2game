import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceCanvas } from './art';
import { TEAMS } from './rules';

export const TILE_Y = 0.34;
export const BOARD_HALF = 5.7;
export function positions(pairs: number) {
  const rows = pairs === 12 ? [4, 5, 6, 5, 4] : [4, 6, 7, 7, 7, 7, 6, 4];
  const spacing = pairs === 12 ? 1.32 : 1.07;
  return rows.flatMap((count, row) => Array.from({ length: count }, (_, col) => new THREE.Vector3((col - (count - 1) / 2) * spacing, TILE_Y, (row - (rows.length - 1) / 2) * (pairs === 12 ? 1.4 : 1.04))));
}
export const trayPose = (owner: number) => {
  const a = [Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4][owner];
  return { x: Math.sin(a) * 5.65, z: Math.cos(a) * 5.65, angle: a + Math.PI / 2 };
};
export function collectedPosition(owner: number, slot: number) {
  const tray = trayPose(owner), offset = (slot % 6 - 2.5) * 0.43;
  return new THREE.Vector3(tray.x + Math.sin(tray.angle) * offset, 0.33 + Math.floor(slot / 6) * 0.11, tray.z + Math.cos(tray.angle) * offset);
}

export class Models {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures: THREE.Texture[] = [];
  private gold = this.material('#ebc44f');
  private faceMaterials = new Map<number, THREE.MeshStandardMaterial>();
  private cylinder = new THREE.CylinderGeometry(0.465, 0.465, 0.16, 40);
  private circle = new THREE.CircleGeometry(0.406, 40);
  private rim = new THREE.TorusGeometry(0.427, 0.034, 8, 40);

  material(color: string, roughness = 0.4) {
    const key = `${color}:${roughness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
    return this.materials.get(key)!;
  }
  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  texture(canvas: HTMLCanvasElement) {
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; this.textures.push(texture); return texture;
  }
  private face(id: number) {
    if (!this.faceMaterials.has(id)) this.faceMaterials.set(id, new THREE.MeshStandardMaterial({ map: this.texture(faceCanvas(id)), roughness: 0.52, metalness: 0 }));
    return this.faceMaterials.get(id)!;
  }
  private octagon(half: number, cut: number) {
    const shape = new THREE.Shape();
    [[-half + cut, -half], [half - cut, -half], [half, -half + cut], [half, half - cut], [half - cut, half], [-half + cut, half], [-half, half - cut], [-half, -half + cut]].forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath(); return shape;
  }
  private slab(parent: THREE.Object3D, shape: THREE.Shape, depth: number, bevel: number, mat: THREE.Material, y: number) {
    const mesh = this.mesh(parent, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 24 }), mat, 0, y, 0);
    mesh.rotation.x = -Math.PI / 2; return mesh;
  }
  board(pairs: number) {
    const board = new THREE.Group(), pos = positions(pairs);
    this.slab(board, this.octagon(BOARD_HALF - 0.12, 1.9), 0.65, 0.14, this.material('#87ad91'), -0.63);
    const deck = this.octagon(BOARD_HALF - 0.12, 1.9);
    for (const p of pos) { const hole = new THREE.Path(); hole.absarc(p.x, -p.z, 0.505, 0, Math.PI * 2, true); deck.holes.push(hole); }
    this.slab(board, deck, 0.13, 0.055, this.material('#a4c8ab'), 0.07);
    const well = new THREE.CylinderGeometry(0.495, 0.48, 0.06, 32);
    for (const p of pos) this.mesh(board, well, this.material('#749c7d'), p.x, 0.045, p.z).castShadow = false;
    const labels = document.createElement('canvas'); labels.width = 512; labels.height = 384;
    const labelContext = labels.getContext('2d')!; labelContext.fillStyle = '#718c60'; labelContext.font = '500 34px system-ui'; labelContext.textAlign = 'center'; labelContext.textBaseline = 'middle';
    pos.forEach((_, id) => labelContext.fillText(String(id + 1).padStart(2, '0'), id % 8 * 64 + 32, Math.floor(id / 8) * 64 + 32));
    const labelMaterial = new THREE.MeshStandardMaterial({ map: this.texture(labels), transparent: true, roughness: 1, depthWrite: false }); this.materials.set('numbers', labelMaterial);
    pos.forEach((p, id) => {
      const geometry = new THREE.PlaneGeometry(0.27, 0.22), uv = geometry.getAttribute('uv');
      for (let n = 0; n < uv.count; n++) uv.setXY(n, (id % 8 + uv.getX(n)) / 8, 1 - (Math.floor(id / 8) + 1 - uv.getY(n)) / 6);
      const label = this.mesh(board, geometry, labelMaterial, p.x + 0.39, 0.26, p.z + 0.43); label.rotation.x = -Math.PI / 2; label.castShadow = false;
    });
    for (let i = 0; i < 4; i++) {
      const { x, z, angle } = trayPose(i), tray = new THREE.Group(); board.add(tray); tray.position.set(x, 0.225, z); tray.rotation.y = angle;
      const troughShape = new THREE.Shape(); troughShape.absellipse(0, 0, 0.43, 1.55, 0, Math.PI * 2, false, 0);
      this.slab(tray, troughShape, 0.012, 0.025, this.material('#97bd88'), 0);
      const rib = new THREE.BoxGeometry(0.68, 0.025, 0.025);
      for (let n = 0; n < 16; n++) this.mesh(tray, rib, this.material('#b2cf9d'), 0, 0.045, (n - 7.5) * 0.17).castShadow = false;
      const badge = this.mesh(tray, new THREE.CylinderGeometry(0.18, 0.18, 0.027, 24), this.material(TEAMS[i].color), 0, 0.03, -1.75); badge.castShadow = false;
      const label = document.createElement('canvas'); label.width = label.height = 64; const ctx = label.getContext('2d')!;
      ctx.fillStyle = TEAMS[i].color; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#fffef0'; ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), 32, 34);
      const mat = new THREE.MeshStandardMaterial({ map: this.texture(label), roughness: 0.5 }); this.materials.set(`badge${i}`, mat);
      this.mesh(tray, new THREE.CircleGeometry(0.165, 24), mat, 0, 0.046, -1.75).rotation.x = -Math.PI / 2;
      const rod = new THREE.Group(); board.add(rod); rod.rotation.y = i * Math.PI / 2;
      this.mesh(rod, new THREE.CapsuleGeometry(0.19, 2.95, 4, 16), this.material('#86ac74'), 0, 0.18, 4.94).rotation.z = Math.PI / 2;
      this.mesh(rod, new THREE.CapsuleGeometry(0.125, 2.65, 4, 16), this.gold, -0.02, 0.36, 4.94).rotation.z = Math.PI / 2;
      for (let n = 0; n < 4; n++) { const ring = this.mesh(rod, new THREE.TorusGeometry(0.137, 0.019, 6, 20), this.material('#f8dc7a'), -0.55 - n * 0.12, 0.36, 4.94); ring.rotation.y = Math.PI / 2; }
      const star = new THREE.Shape();
      for (let n = 0; n < 10; n++) { const a = n * Math.PI / 5, r = n % 2 ? 0.25 : 0.4; if (n) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r); } star.closePath();
      const starMesh = this.slab(rod, star, 0.12, 0.045, this.gold, 0.28); starMesh.position.x = -1.55; starMesh.position.z = 4.94;
      for (const dx of [-0.09, 0.09]) this.mesh(rod, new THREE.SphereGeometry(0.027, 8, 6), this.material('#a88530'), -1.55 + dx, 0.455, 4.9).scale.y = 0.5;
    }
    // Molded parts never move. Batch their geometry by material to reduce tablet draw calls.
    board.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    board.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
      geometry.clearGroups(); const material = object.material as THREE.Material;
      if (!batches.has(material)) batches.set(material, []); batches.get(material)!.push(geometry);
    });
    const merged = new THREE.Group();
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries)!;
      this.mesh(merged, geometry, material).castShadow = !material.transparent;
      geometries.forEach(geometry => geometry.dispose());
    }
    return merged;
  }
  tile(id: number, face: number) {
    const group = new THREE.Group(); group.userData.id = id;
    const body = this.mesh(group, this.cylinder, this.gold); body.userData.id = id;
    const front = this.mesh(group, this.circle, this.face(face), 0, 0.083, 0); front.rotation.x = -Math.PI / 2; front.castShadow = false;
    const back = this.mesh(group, this.circle, this.face(-1), 0, -0.083, 0); back.rotation.x = Math.PI / 2; back.castShadow = false;
    for (const side of [-1, 1]) { const edge = this.mesh(group, this.rim, this.material('#ffe69b'), 0, side * 0.077, 0); edge.rotation.x = Math.PI / 2; edge.castShadow = false; }
    return { group, target: body };
  }
  dispose() {
    this.geometries.forEach(item => item.dispose()); this.materials.forEach(item => item.dispose()); this.faceMaterials.forEach(item => item.dispose()); this.textures.forEach(item => item.dispose());
    this.geometries.clear(); this.materials.clear(); this.faceMaterials.clear(); this.textures = [];
  }
}
