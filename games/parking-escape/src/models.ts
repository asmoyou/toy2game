import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { appearance, type Vehicle } from './rules';

export class ToyModels {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Set<THREE.Texture>();

  material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.02 }));
    return this.materials.get(color)!;
  }

  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: number[]) {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent: THREE.Object3D, size: number[], position: number[], color: string, radius = 0.04) {
    return this.mesh(parent, new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(radius, ...size.map(n => n / 2))), this.material(color), position);
  }

  label(parent: THREE.Object3D, text: string, width: number, depth: number, position: number[], color = '#34494e', background = 'transparent') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, 256, 128); }
    ctx.fillStyle = color; ctx.font = 'bold 68px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 68, 245);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6, depthWrite: false });
    this.materials.set(`label-${this.materials.size}`, material);
    const mesh = this.mesh(parent, new THREE.PlaneGeometry(width, depth), material, position);
    mesh.rotation.x = -Math.PI / 2; mesh.castShadow = false;
    return mesh;
  }

  board() {
    const group = new THREE.Group();
    this.box(group, [7.65, 0.44, 7.65], [0, -0.29, 0], '#fafcfb', 0.20);
    this.box(group, [6.18, 0.11, 6.18], [0, -0.015, 0], '#bdcccf', 0.10);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      const x = col - 2.5, z = row - 2.5;
      this.box(group, [0.976, 0.10, 0.976], [x, 0.005, z], (row + col) % 2 ? '#eaf0ef' : '#f3f5f3', 0.045);
      for (const dx of [-0.35, 0.35]) this.box(group, [0.035, 0.023, 0.28], [x + dx, 0.062, z], '#dce4e3', 0.01);
    }
    for (const z of [-3.43, 3.43]) this.box(group, [7.5, 0.17, 0.64], [0, 0.065, z], '#8fcc22', 0.065);
    this.box(group, [0.64, 0.17, 6.4], [-3.43, 0.065, 0], '#8fcc22', 0.065);
    this.box(group, [0.64, 0.17, 2.1], [3.43, 0.065, -2.13], '#8fcc22', 0.065);
    this.box(group, [0.64, 0.17, 3.1], [3.43, 0.065, 1.63], '#8fcc22', 0.065);
    for (const z of [-3.07, 3.07]) this.box(group, [6.2, 0.21, 0.09], [0, 0.04, z], '#fbfcfa', 0.035);
    this.box(group, [0.09, 0.21, 6.2], [-3.07, 0.04, 0], '#fbfcfa', 0.035);
    this.box(group, [0.09, 0.21, 2.06], [3.07, 0.04, -2.07], '#fbfcfa', 0.035);
    this.box(group, [0.09, 0.21, 3.06], [3.07, 0.04, 1.57], '#fbfcfa', 0.035);
    for (const z of [-3.43, 3.43]) {
      for (const center of [-1.65, 1.65]) for (let i = -2; i <= 2; i++) this.box(group, [0.09, 0.008, 0.45], [center + i * 0.17, 0.156, z], '#ffffff', 0.003);
      this.box(group, [0.64, 0.012, 0.50], [0, 0.16, z], '#5db4d6', 0.035);
      this.label(group, 'P', 0.4, 0.37, [0, 0.174, z], '#ffffff');
    }
    for (const x of [-3.43, 3.43]) for (const z of [-2.82, 2.85]) {
      this.box(group, [0.48, 0.02, 0.18], [x, 0.165, z], '#315656', 0.07);
      ['#f27a67', '#f6d25f', '#4fbc90'].forEach((color, i) => {
        const light = this.mesh(group, new THREE.CylinderGeometry(0.062, 0.062, 0.012, 16), this.material(color), [x + (i - 1) * 0.14, 0.182, z]);
        light.castShadow = false;
      });
    }
    for (const x of [-3.43, 3.43]) for (const z of [-1.68, 1.65]) this.box(group, [0.09, 0.009, 0.9], [x, 0.157, z], '#5bb278', 0.02);
    this.box(group, [1.75, 0.22, 1.12], [3.83, -0.10, -0.5], '#fafcfb', 0.10);
    this.box(group, [1.72, 0.013, 0.94], [3.84, 0.02, -0.5], '#c7d8d6', 0.04);
    for (const z of [-0.9, -0.1]) this.box(group, [1.54, 0.008, 0.025], [3.84, 0.03, z], '#fbfdf9', 0.005);
    for (const x of [3.57, 4.03]) {
      for (const sign of [-1, 1]) {
        const arrow = this.box(group, [0.28, 0.01, 0.055], [x, 0.039, -0.5 + sign * 0.086], '#42877d', 0.01);
        arrow.rotation.y = sign * Math.PI / 4;
      }
    }
    return group;
  }

  vehicle(car: Vehicle, index: number) {
    const group = new THREE.Group(), info = appearance(car.id), length = car.size - 0.18;
    const color = info.color, glass = '#354951';
    this.box(group, [length, 0.17, 0.88], [0, 0.155, 0], '#fafcf9', 0.13);
    for (const x of [-length / 2 + 0.31, length / 2 - 0.31]) for (const z of [-0.35, 0.35]) {
      const tire = this.mesh(group, new THREE.CylinderGeometry(0.14, 0.14, 0.08, 14), this.material('#43545a'), [x, 0.23, z]);
      tire.rotation.x = Math.PI / 2;
      const hub = this.mesh(group, new THREE.CylinderGeometry(0.064, 0.064, 0.085, 12), this.material('#d9e1df'), [x, 0.23, z]);
      hub.rotation.x = Math.PI / 2;
    }
    this.box(group, [length - 0.13, 0.24, 0.71], [0, 0.34, 0], color, 0.11);
    const truck = info.kind === 'truck', bus = info.kind === 'bus', utility = info.kind === 'fire' || info.kind === 'ambulance';
    if (truck) {
      this.box(group, [0.55, 0.22, 0.62], [length / 2 - 0.4, 0.53, 0], glass, 0.07);
      this.box(group, [0.32, 0.03, 0.64], [length / 2 - 0.46, 0.65, 0], color, 0.02);
      this.box(group, [length - 0.9, 0.24, 0.64], [-0.34, 0.51, 0], '#e1e5dc', 0.04);
      for (let i = 0; i < 11; i++) this.box(group, [0.035, 0.032, 0.57], [-length / 2 + 0.21 + i * (length - 1) / 10, 0.65, 0], '#9eae9d', 0.008);
    } else if (bus || utility) {
      this.box(group, [length - 0.40, 0.23, 0.62], [-0.02, 0.54, 0], glass, 0.07);
      this.box(group, [length - 0.48, 0.07, 0.64], [-0.05, 0.68, 0], color, 0.045);
      for (let i = 0; i < (bus ? 7 : 3); i++) for (const z of [-0.32, 0.32]) this.box(group, [0.045, 0.20, 0.03], [-length / 2 + 0.28 + i * 0.29, 0.55, z], color, 0.01);
      if (info.kind === 'fire') {
        for (const z of [-0.17, 0.17]) this.box(group, [1.1, 0.045, 0.04], [-0.11, 0.76, z], '#e1e5dd', 0.01);
        for (let i = 0; i < 6; i++) this.box(group, [0.035, 0.04, 0.34], [-0.62 + i * 0.2, 0.76, 0], '#e1e5dd', 0.01);
      }
      if (info.kind === 'ambulance') {
        this.box(group, [0.39, 0.013, 0.13], [-0.07, 0.724, 0], '#e96363', 0.005);
        this.box(group, [0.13, 0.014, 0.39], [-0.07, 0.725, 0], '#e96363', 0.005);
      }
    } else {
      this.box(group, [0.93, 0.23, 0.61], [-0.10, 0.52, 0], glass, 0.105);
      this.box(group, [0.40, 0.028, 0.58], [-0.15, 0.646, 0], info.kind === 'police' ? '#f7faf6' : color, 0.025);
      for (const z of [-0.316, 0.316]) this.box(group, [0.04, 0.18, 0.035], [-0.13, 0.51, z], color, 0.01);
      if (info.kind === 'police') {
        for (const x of [-0.70, 0.64]) this.box(group, [0.28, 0.015, 0.54], [x, 0.465, 0], '#354348', 0.035);
        this.box(group, [0.16, 0.04, 0.57], [-0.12, 0.685, 0], '#eff7f4', 0.02);
        this.box(group, [0.15, 0.095, 0.24], [-0.12, 0.731, -0.15], '#408edd', 0.025);
        this.box(group, [0.15, 0.095, 0.24], [-0.12, 0.731, 0.15], '#f15b5d', 0.025);
        this.label(group, 'POLICE', 0.45, 0.22, [0.52, 0.478, 0], '#ffffff');
      }
      if (info.kind === 'taxi') {
        this.box(group, [0.23, 0.10, 0.32], [-0.1, 0.705, 0], '#fff8db', 0.025);
        this.label(group, 'TAXI', 0.21, 0.21, [-0.1, 0.761, 0]);
      }
      if (info.kind === 'jeep') for (const z of [-0.22, 0.22]) this.box(group, [0.65, 0.045, 0.034], [-0.12, 0.685, z], '#e6e9df', 0.01);
    }
    for (const z of [-0.23, 0.23]) {
      this.box(group, [0.047, 0.08, 0.16], [length / 2 - 0.073, 0.35, z], '#fffbd8', 0.016);
      this.box(group, [0.035, 0.065, 0.12], [-length / 2 + 0.062, 0.34, z], '#c84342', 0.01);
    }
    if (index !== 0) this.label(group, String(index).padStart(2, '0'), 0.30, 0.22, [length / 2 - 0.30, 0.466, 0], '#283c43');
    group.rotation.y = car.axis === 'x' ? 0 : -Math.PI / 2;
    group.traverse(object => { object.userData.car = index; });
    return group;
  }

  dispose() {
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
    this.geometries.clear(); this.materials.clear(); this.textures.clear();
  }
}
