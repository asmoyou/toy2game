import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TILE_RADIUS, type Cell } from './board';
import { IcePhysics, ICE_Y, ICE_HEIGHT, PENGUIN_COM_Y, WATER_LEVEL } from './physics';
import { selectPenguinMood, type PenguinMood } from './penguin-mood';
import { PenguinActor } from './penguin';
import { GROUND_Y, createHoleOutline } from './terrain';

type Tile = { cell: Cell; mesh: THREE.Mesh; body: CANNON.Body; falling: boolean; splashed: boolean; blue: boolean; impactOrigin: THREE.Vector3; feedbackOffset: THREE.Vector3 };
type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number };
type Callbacks = { onStrike: () => void; onHit: (count: number) => void; onChange: (count: number) => void; onMoodChange: (mood: PenguinMood) => void; onSettled: () => void; onLose: () => void; onReady: () => void };
const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(7.5, 13, 17);

function material(color: number, roughness = 0.65) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

export class IceGame {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  private controls: OrbitControls;
  private physics!: IcePhysics;
  private root = new THREE.Group();
  private penguin = new THREE.Group();
  private penguinOffset = new THREE.Vector3();
  private supportFeedback = new THREE.Vector3();
  private penguinBody!: CANNON.Body;
  private hammer = new THREE.Group();
  private tiles = new Map<string, Tile>();
  private cells: Cell[] = [];
  private particles: Particle[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hovered: Tile | null = null;
  private lastTime = 0;
  private moveStarted = 0;
  private strikeStarted = 0;
  private pendingTile: Tile | null = null;
  private turnBusy = false;
  private humanInput = true;
  private stableSince: number | null = null;
  private remainingCount = 61;
  private paused = false;
  private lost = false;
  private splashed = false;
  private radius = 4;
  private frameRadius = 6;
  private lookTarget = new THREE.Vector3();
  private penguinActor!: PenguinActor;
  private mood: PenguinMood = 'happy';
  private moodChangedAt = 0;
  private reactionUntil = 0;
  private particleGeometry = new THREE.IcosahedronGeometry(0.09, 0);
  private particleMaterial = material(0xe8ffff);
  private resizeObserver: ResizeObserver;
  private pointerStart: { id: number; x: number; y: number; dragged: boolean } | null = null;
  private activePointers = new Set<number>();
  private water!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private shorelineChips: THREE.Mesh[] = [];
  private splashRipples: Array<{ mesh: THREE.Mesh; age: number; size: number }> = [];
  private rippleGeometry = new THREE.RingGeometry(0.94, 1, 40);
  private animationId = 0;

  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '企鹅冰场');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xeaf5f8);
    this.scene.fog = new THREE.Fog(0xeaf5f8, 24, 56);
    this.scene.add(new THREE.HemisphereLight(0xf5ffff, 0x82a9b1, 2));
    const sunlight = new THREE.DirectionalLight(0xfff7e6, 2.7);
    sunlight.position.set(-5, 14, 7);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -11;
    sunlight.shadow.camera.right = 11;
    sunlight.shadow.camera.top = 11;
    sunlight.shadow.camera.bottom = -11;
    sunlight.shadow.normalBias = 0.045;
    sunlight.shadow.bias = -0.0001;
    sunlight.shadow.radius = 4;
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight(0xc3edff, 0.9);
    fill.position.set(6, 6, -8);
    this.scene.add(fill);
    this.scene.add(this.root);
    this.makeEnvironment();
    this.makeHammer();
    this.camera.position.copy(DEFAULT_CAMERA_OFFSET).add(new THREE.Vector3(0, 0.35, 0));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.65;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.39;
    this.controls.minZoom = 0.84;
    this.controls.maxZoom = 1.18;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.controls.addEventListener('change', this.frameCamera);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    host.addEventListener('pointerdown', this.onPointerDown);
    host.addEventListener('pointerup', this.onPointerUp);
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerleave', () => this.setHovered(null));
    host.addEventListener('pointercancel', this.onPointerCancel);
    this.reset(4);
    this.animate(0);
    callbacks.onReady();
  }

  private mesh(geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, position = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private makeEnvironment() {
    const snow = material(0xf5fcff);
    const ice = material(0xafdce7);
    const bergs = [[-10, -0.8, -7, 2.2], [9, -1.2, -10, 2.8], [-11, -1.35, 3, 1], [11, -1.3, 4, 1.3]];
    for (const [x, y, z, size] of bergs) {
      const base = this.mesh(new THREE.CylinderGeometry(size, size * 0.87, 0.5, 6), ice, this.scene, [x, y, z]);
      base.rotation.y = 0.2;
      const cap = this.mesh(new THREE.CylinderGeometry(size * 0.93, size, 0.16, 6), snow, this.scene, [x, y + 0.32, z]);
      cap.rotation.y = 0.2;
      if (size > 2) {
        const peak = this.mesh(new THREE.ConeGeometry(size * 0.65, size * 0.75, 5), snow, this.scene, [x - 0.4, y + 1.1, z]);
        peak.rotation.y = 0.6;
      }
    }
  }

  private ring(outer: number, inner: number, depth: number, mat: THREE.Material, y: number) {
    const shape = new THREE.Shape();
    const hole = new THREE.Path();
    for (let i = 0; i <= 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      const x = Math.cos(angle), z = Math.sin(angle);
      if (i === 0) { shape.moveTo(x * outer, z * outer); hole.moveTo(x * inner, z * inner); }
      else { shape.lineTo(x * outer, z * outer); hole.lineTo(x * inner, z * inner); }
    }
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.07 });
    geometry.rotateX(-Math.PI / 2);
    return this.mesh(geometry, mat, this.root, [0, y, 0]);
  }

  private makeBoard() {
    const innerRadius = Math.sqrt(3) * 0.7 * this.radius + 0.78;
    this.frameRadius = innerRadius + 0.47;
    this.ring(this.frameRadius, innerRadius, 0.62, material(0x4eafb2), 0.65);
    this.ring(this.frameRadius + 0.025, innerRadius - 0.015, 0.1, material(0x8ed8d5), 1.27);
    this.ring(this.frameRadius - 0.1, innerRadius + 0.09, 0.025, material(0xcaf0e8), 1.43);
    const legMaterial = material(0xe2f0ed), footMaterial = material(0x559caa);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const lx = x * this.frameRadius * 0.56, lz = z * this.frameRadius * 0.58;
      this.mesh(new RoundedBoxGeometry(0.6, 2.1, 0.7, 3, 0.13), legMaterial, this.root, [lx, -0.35, lz]).rotation.z = x * -0.09;
      this.mesh(new RoundedBoxGeometry(0.86, 0.3, 0.98, 3, 0.12), footMaterial, this.root, [lx + x * 0.07, -1.42, lz]);
    }
    this.makeGround();
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(angle) * (TILE_RADIUS - 0.04), z = Math.sin(angle) * (TILE_RADIUS - 0.04);
      if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: ICE_HEIGHT - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.025, bevelSegments: 2, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -(ICE_HEIGHT - 0.08) / 2, 0);
    const blue = [0x3fb6d0, 0x56c2d8, 0x64c7dd];
    for (const cell of this.cells) {
      const isBlue = Math.random() > 0.46;
      const mat = material(isBlue ? blue[Math.floor(Math.random() * blue.length)] : 0xf3fbfd, 0.35);
      const mesh = this.mesh(geometry, mat, this.root, [cell.x, ICE_Y, cell.z]);
      mesh.userData.cellId = cell.id;
      const body = this.physics.tiles.get(cell.id)!.body;
      this.tiles.set(cell.id, { cell, mesh, body, falling: false, splashed: false, blue: isBlue, impactOrigin: new THREE.Vector3().copy(body.position), feedbackOffset: new THREE.Vector3() });
      if (Math.random() > 0.58 && Math.abs(cell.q) + Math.abs(cell.r) > 1) {
        const glint = this.mesh(new THREE.CircleGeometry(0.035, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), mesh, [-0.24, ICE_HEIGHT / 2 + 0.008, -0.12]);
        glint.rotation.x = -Math.PI / 2;
        glint.scale.x = 2.3;
      }
    }
  }

  private makeGround() {
    this.shorelineChips = [];
    const outline = createHoleOutline(this.radius);
    const shape = new THREE.Shape();
    shape.moveTo(-100, -100); shape.lineTo(100, -100); shape.lineTo(100, 100); shape.lineTo(-100, 100); shape.closePath();
    const hole = new THREE.Path();
    outline.forEach((point, index) => index === 0 ? hole.moveTo(point.x, point.z) : hole.lineTo(point.x, point.z));
    hole.closePath();
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    this.mesh(geometry, [material(0xdceff3, 0.9), material(0x93c9d7)], this.root, [0, GROUND_Y - 0.6, 0]);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(this.frameRadius * 1.6, this.frameRadius * 1.6, 32, 32), new THREE.MeshStandardMaterial({ color: 0x289fb9, roughness: 0.25, metalness: 0.1 }));
    this.water.position.y = WATER_LEVEL;
    this.water.rotation.x = -Math.PI / 2;
    this.water.receiveShadow = true;
    this.root.add(this.water);
    const crackMaterial = material(0xa1c8d2);
    for (let i = 1; i < outline.length; i += 3) {
      const point = outline[i];
      const direction = new THREE.Vector3(point.x, 0, point.z).normalize();
      const start = new THREE.Vector3(point.x, GROUND_Y + 0.012, point.z);
      const middle = start.clone().addScaledVector(direction, 0.28);
      middle.x += i % 2 ? 0.06 : -0.06;
      const end = start.clone().addScaledVector(direction, 0.55);
      this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, middle, end]), 8, 0.013, 4, false), crackMaterial, this.root);
      const branch = middle.clone().add(new THREE.Vector3(direction.z * 0.2, 0, -direction.x * 0.2));
      this.mesh(new THREE.TubeGeometry(new THREE.LineCurve3(middle, branch), 2, 0.008, 4, false), crackMaterial, this.root);
    }
    const shard = new THREE.Shape();
    shard.moveTo(-0.2, -0.08); shard.lineTo(0.13, -0.16); shard.lineTo(0.26, 0.07); shard.lineTo(-0.11, 0.17); shard.closePath();
    const shardGeometry = new THREE.ExtrudeGeometry(shard, { depth: 0.12, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    shardGeometry.rotateX(-Math.PI / 2);
    const shardMaterials = [material(0xf4fdff), material(0x8ecddb)];
    for (const index of [5, 11, 15]) {
      const point = outline[index];
      const chip = this.mesh(shardGeometry, shardMaterials, this.root, [point.x * 0.72, WATER_LEVEL + 0.015, point.z * 0.72]);
      chip.rotation.y = index;
      this.shorelineChips.push(chip);
    }
  }

  private makePenguin() {
    this.penguin = new THREE.Group();
    this.penguinActor = new PenguinActor();
    this.penguin.add(this.penguinActor);
    this.root.add(this.penguin);
    this.penguinBody = this.physics.penguin;
    this.syncPenguin();
  }

  private syncPenguin() {
    this.penguin.quaternion.copy(this.penguinBody.quaternion);
    this.penguinOffset.set(0, -PENGUIN_COM_Y, 0).applyQuaternion(this.penguin.quaternion);
    this.penguin.position.copy(this.penguinBody.position).add(this.penguinOffset);
  }

  private makeHammer() {
    const handle = this.mesh(new THREE.CylinderGeometry(0.085, 0.105, 1.5, 16), material(0xeac68f), this.hammer, [0, 0.68, 0]);
    handle.rotation.z = -0.3;
    this.mesh(new RoundedBoxGeometry(0.88, 0.47, 0.5, 3, 0.1), material(0xf59882), this.hammer, [0.24, 1.38, 0]);
    this.mesh(new RoundedBoxGeometry(0.14, 0.49, 0.52, 2, 0.05), material(0xffd0b8), this.hammer, [0.65, 1.38, 0]);
    this.hammer.visible = false;
    this.scene.add(this.hammer);
  }

  reset(radius: number) {
    this.setHovered(null);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
      }
    });
    this.root.clear();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(mat => mat.dispose());
    for (const particle of this.particles) this.scene.remove(particle.mesh);
    for (const ripple of this.splashRipples) { this.scene.remove(ripple.mesh); (ripple.mesh.material as THREE.Material).dispose(); }
    this.splashRipples = [];
    this.particles = [];
    this.tiles.clear();
    this.radius = radius;
    this.physics = new IcePhysics(radius);
    this.cells = this.physics.cells;
    this.remainingCount = this.cells.length;
    this.stableSince = null;
    this.turnBusy = false;
    this.lost = false;
    this.splashed = false;
    this.pendingTile = null;
    this.pointerStart = null;
    this.activePointers.clear();
    this.mood = 'happy';
    this.moodChangedAt = 0;
    this.reactionUntil = 0;
    this.hammer.visible = false;
    this.makeBoard();
    this.makePenguin();
    this.resize();
  }

  setPaused(value: boolean) {
    this.paused = value;
    this.controls.enabled = !value;
    this.pointerStart = null;
    this.activePointers.clear();
  }
  setHumanInput(value: boolean) { this.humanInput = value; if (!value) this.setHovered(null); }
  chooseBotMove() { return this.physics.chooseBotMove(); }
  getMood() { return this.mood; }

  adjustView(action: 'left' | 'right' | 'top' | 'reset') {
    if (this.paused) return;
    this.pointerStart = null;
    this.controls.enableDamping = false;
    this.controls.update();
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (action === 'reset') {
      offset.copy(DEFAULT_CAMERA_OFFSET);
      this.camera.zoom = 1;
    } else if (action === 'top') {
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.phi = this.controls.minPolarAngle;
      offset.setFromSpherical(spherical);
      this.camera.zoom = 1;
    } else offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, action === 'left' ? Math.PI / 4 : -Math.PI / 4);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.enableDamping = true;
    this.setHovered(null);
  }

  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const aspect = width / height;
    const isPortrait = aspect < 0.95;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.lookTarget.set(0, isPortrait ? 0.65 : 0.35, 0);
    this.controls.target.copy(this.lookTarget);
    this.camera.position.copy(this.lookTarget).add(offset);
    this.controls.update();
    this.frameCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private frameCamera = () => {
    const aspect = this.host.clientWidth / this.host.clientHeight;
    if (!Number.isFinite(aspect) || !aspect) return;
    const overhead = THREE.MathUtils.clamp((0.75 - this.controls.getPolarAngle()) / 0.67, 0, 1);
    const height = Math.max(12.2, (this.frameRadius * 2 + 3) / aspect) * (this.radius === 3 ? 0.94 : 1) * (1 + overhead * 0.24);
    const sideOffset = aspect > 1.45 ? 0.83 : 0;
    this.camera.left = -height * aspect / 2 - sideOffset;
    this.camera.right = height * aspect / 2 - sideOffset;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  };

  private pick(event: PointerEvent) {
    const rect = this.host.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates = [...this.tiles.values()].filter(tile => !tile.falling);
    const hit = this.raycaster.intersectObjects(candidates.map(tile => tile.mesh), false)[0];
    return hit ? this.tiles.get(hit.object.userData.cellId)! : null;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.paused) return;
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) { this.pointerStart = null; return; }
    this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
  };

  private onPointerUp = (event: PointerEvent) => {
    this.activePointers.delete(event.pointerId);
    const start = this.pointerStart;
    this.pointerStart = null;
    this.setHovered(null);
    if (!start || start.id !== event.pointerId || start.dragged || this.activePointers.size || !this.humanInput || this.turnBusy || this.lost || this.paused || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 8) return;
    const tile = this.pick(event);
    if (tile) this.strike(tile.cell.id);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.pointerStart?.id === event.pointerId && Math.hypot(this.pointerStart.x - event.clientX, this.pointerStart.y - event.clientY) > 8) this.pointerStart.dragged = true;
    if (this.pointerStart?.dragged || this.activePointers.size > 1) { this.setHovered(null); this.host.style.cursor = 'grabbing'; return; }
    if (event.pointerType !== 'mouse' || !this.humanInput || this.turnBusy || this.lost || this.paused) return;
    this.setHovered(this.pick(event));
  };

  private onPointerCancel = (event: PointerEvent) => {
    this.activePointers.delete(event.pointerId);
    this.pointerStart = null;
    this.setHovered(null);
  };

  private setHovered(tile: Tile | null) {
    if (this.hovered) (this.hovered.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0);
    this.hovered = tile;
    if (tile) (tile.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x2b524e);
    this.host.style.cursor = tile ? 'pointer' : 'grab';
  }

  strike(id: string) {
    const tile = this.tiles.get(id);
    if (!tile || tile.falling || this.turnBusy || this.lost || this.paused) return false;
    this.setHovered(null);
    this.turnBusy = true;
    this.pendingTile = tile;
    this.strikeStarted = this.physics.time * 1000;
    this.moveStarted = this.strikeStarted;
    this.stableSince = null;
    this.hammer.visible = true;
    this.hammer.position.set(tile.body.position.x - 0.5, tile.body.position.y + 0.05, tile.body.position.z);
    this.hammer.rotation.set(0, -0.3, -1.5);
    this.callbacks.onStrike();
    return true;
  }

  private impact(tile: Tile) {
    for (const item of this.tiles.values()) item.impactOrigin.copy(item.body.position);
    this.physics.strike(tile.cell.id);
    this.reactionUntil = this.physics.time + 0.65;
    tile.falling = true;
    this.burst(tile.mesh.position, 16, false);
    this.remainingCount = this.physics.remaining;
    this.callbacks.onHit(this.remainingCount);
  }

  private burst(position: THREE.Vector3, count: number, splash: boolean) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 180) break;
      const mesh = new THREE.Mesh(this.particleGeometry, this.particleMaterial);
      mesh.position.copy(position);
      mesh.scale.setScalar(0.5 + Math.random());
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * (splash ? 6 : 3), 1.5 + Math.random() * 3, (Math.random() - 0.5) * (splash ? 6 : 3)), life: 1 });
    }
  }

  private splash(position: THREE.Vector3, size: number) {
    const center = new THREE.Vector3(position.x, WATER_LEVEL + 0.08, position.z);
    this.burst(center, size > 1 ? 35 : 9, true);
    if (this.splashRipples.length >= 12) return;
    const ripple = new THREE.Mesh(this.rippleGeometry, new THREE.MeshBasicMaterial({ color: 0xe5ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.copy(center);
    this.scene.add(ripple);
    this.splashRipples.push({ mesh: ripple, age: 0, size });
  }

  private animatePenguin(delta: number) {
    const condition = this.physics.getPenguinCondition();
    const next = selectPenguinMood(condition, this.physics.time < this.reactionUntil);
    if (next !== this.mood && (next === 'falling' || next === 'swimming' || next === 'surprised' || this.physics.time - this.moodChangedAt > 0.4)) {
      this.mood = next;
      this.moodChangedAt = this.physics.time;
      this.callbacks.onMoodChange(next);
    }
    this.penguinActor.update(this.mood, this.physics.time, delta, condition.wobble + this.penguinBody.angularVelocity.length());
  }

  private animate = (time: number) => {
    this.animationId = requestAnimationFrame(this.animate);
    const delta = Math.min((time - this.lastTime) / 1000 || 0.016, 0.05);
    this.lastTime = time;
    if (!this.paused) {
      this.controls.update(delta);
      this.physics.step(delta);
      const now = this.physics.time * 1000;
      if (this.pendingTile && now - this.strikeStarted > 150) {
        this.impact(this.pendingTile);
        this.pendingTile = null;
      }
      if (this.hammer.visible) {
        const progress = Math.min((now - this.strikeStarted) / 340, 1);
        this.hammer.rotation.z = progress < 0.45 ? -1.5 + progress / 0.45 * 2.7 : 1.2 - (progress - 0.45) / 0.55 * 1.6;
        if (progress >= 1) this.hammer.visible = false;
      }
      const wobble = this.physics.wobble;
      const feedbackGain = Math.min(4, wobble * 16);
      this.supportFeedback.set(0, 0, 0);
      let supportWeight = 0;
      for (const tile of this.tiles.values()) {
        tile.falling = this.physics.tiles.get(tile.cell.id)!.removed;
        tile.mesh.position.copy(tile.body.position);
        tile.mesh.quaternion.copy(tile.body.quaternion);
        tile.feedbackOffset.set(0, 0, 0);
        if (!tile.falling && wobble > 0) {
          // Make actual elastic displacement legible on a tablet, with a bounded visual offset.
          tile.feedbackOffset.copy(tile.body.position).sub(tile.impactOrigin).multiplyScalar(feedbackGain).clampLength(0, 0.045);
          tile.mesh.position.add(tile.feedbackOffset);
          const distance = Math.hypot(tile.body.position.x - this.penguinBody.position.x, tile.body.position.z - this.penguinBody.position.z);
          const weight = Math.max(0, 1 - distance / 1.05);
          this.supportFeedback.addScaledVector(tile.feedbackOffset, weight);
          supportWeight += weight;
        }
        if (tile.falling && !tile.splashed && tile.body.position.y - ICE_HEIGHT / 2 <= WATER_LEVEL) {
          tile.splashed = true;
          this.splash(tile.mesh.position, 0.7);
        }
      }
      if (this.remainingCount !== this.physics.remaining) {
        this.remainingCount = this.physics.remaining;
        this.callbacks.onChange(this.remainingCount);
      }
      this.syncPenguin();
      if (supportWeight > 0 && this.penguin.position.y > ICE_Y - 0.2) this.penguin.position.addScaledVector(this.supportFeedback, 1 / supportWeight);
      this.animatePenguin(delta);
      if (!this.lost && this.physics.lost) {
        this.lost = true;
        this.turnBusy = true;
        this.callbacks.onLose();
      }
      if (this.lost && !this.splashed && this.physics.getPenguinCondition().inWater) {
        this.splashed = true;
        this.splash(this.penguin.position, 1.7);
      }
      if (this.turnBusy && !this.lost && !this.pendingTile && now - this.moveStarted > 1150) {
        if (this.physics.stable) this.stableSince ??= now;
        else this.stableSince = null;
        if (this.stableSince !== null && now - this.stableSince > 500) {
          this.turnBusy = false;
          this.callbacks.onSettled();
        }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const particle = this.particles[i];
        particle.life -= delta * 1.25;
        particle.velocity.y -= delta * 8;
        particle.mesh.position.addScaledVector(particle.velocity, delta);
        particle.mesh.rotation.x += delta * 4;
        particle.mesh.scale.multiplyScalar(1 - delta * 1.3);
        if (particle.life <= 0) { this.scene.remove(particle.mesh); this.particles.splice(i, 1); }
      }
      for (let i = this.splashRipples.length - 1; i >= 0; i--) {
        const ripple = this.splashRipples[i];
        ripple.age += delta;
        ripple.mesh.scale.setScalar((0.25 + ripple.age * 1.8) * ripple.size);
        (ripple.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - ripple.age * 0.5);
        if (ripple.age > 1.5) { this.scene.remove(ripple.mesh); (ripple.mesh.material as THREE.Material).dispose(); this.splashRipples.splice(i, 1); }
      }
      const vertices = this.water.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setZ(i, Math.sin(vertices.getX(i) * 0.65 + this.physics.time) * 0.035 + Math.cos(vertices.getY(i) * 0.7 + this.physics.time * 0.8) * 0.025);
      vertices.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
      this.shorelineChips.forEach((chip, index) => {
        chip.position.y = WATER_LEVEL + 0.015 + Math.sin(this.physics.time * 1.6 + index * 2) * 0.018;
        chip.rotation.z = Math.sin(this.physics.time * 1.2 + index) * 0.025;
      });
    }
    this.renderer.render(this.scene, this.camera);
  };

  // Read-only projected coordinates let browser tests exercise the actual touch targets.
  getState() {
    const rect = this.host.getBoundingClientRect();
    return {
      busy: this.turnBusy, lost: this.lost, paused: this.paused,
      humanInput: this.humanInput, physics: this.physics.getDiagnostics(),
      camera: { azimuth: this.controls.getAzimuthalAngle(), polar: this.controls.getPolarAngle(), zoom: this.camera.zoom },
      mood: this.mood, penguinCondition: this.physics.getPenguinCondition(),
      expression: this.penguinActor.getExpression(), elapsed: this.physics.time,
      water: { level: WATER_LEVEL, splashes: [...this.tiles.values()].filter(tile => tile.splashed).length, penguinSplashed: this.splashed },
      penguinY: this.penguin.position.y,
      tiles: [...this.tiles.values()].filter(tile => !tile.falling).map(tile => {
        const projected = new THREE.Vector3(0, ICE_HEIGHT / 2, 0).applyQuaternion(tile.mesh.quaternion).add(tile.mesh.position).project(this.camera);
        return { id: tile.cell.id, x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2, rim: tile.cell.rim };
      })
    };
  }

  dispose() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.controls.removeEventListener('change', this.frameCamera);
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    this.host.removeEventListener('pointermove', this.onPointerMove);
    this.host.removeEventListener('pointerup', this.onPointerUp);
    this.host.removeEventListener('pointercancel', this.onPointerCancel);
    this.renderer.dispose();
  }
}
