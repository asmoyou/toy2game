import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SLOTS, PLAYER_COLORS, RINGS, deckSurface } from './board';
import { CREW_COM } from './physics';
import { BalanceGame } from './game';
import { ToyModels } from './models';

export class BalanceScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-9, 9, 7, -7, 0.1, 100);
  readonly world = new THREE.Scene();
  private models = new ToyModels();
  private plate: THREE.Group;
  private actors = new Map<number, THREE.Group>();
  private templates: THREE.Group[];
  private standby = new THREE.Group();
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ghost: THREE.Group;
  private ghostMaterials: THREE.MeshStandardMaterial[] = [];
  private selection: THREE.Mesh;
  private targets: THREE.Mesh[] = [];
  private frame = 0;
  private last = 0;
  private disposed = false;
  private activePointers = new Set<number>();
  private start: { id: number; x: number; y: number; dragged: boolean; allowed: boolean; turn: number; move: number } | null = null;
  private hovered: number | null = null;
  private v = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private host: HTMLElement;
  private game: BalanceGame;
  private onFrame: () => void;
  private onSelect: (id: number) => void;

  constructor(host: HTMLElement, game: BalanceGame, onFrame: () => void, onSelect: (id: number) => void) {
    this.host = host; this.game = game; this.onFrame = onFrame; this.onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '太空人平衡平台');
    canvas.setAttribute('role', 'img');
    host.append(canvas);
    this.world.background = new THREE.Color('#f1f5f4');
    this.world.fog = new THREE.Fog('#f1f5f4', 30, 65);
    this.world.add(new THREE.HemisphereLight('#ffffff', '#a1b9b4', 2));
    const sun = new THREE.DirectionalLight('#fff5df', 2.5);
    sun.position.set(-7, 13, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.1, far: 40 });
    sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.025;
    this.world.add(sun);
    const fill = new THREE.DirectionalLight('#c4f0ff', 0.7); fill.position.set(6, 6, -6); this.world.add(fill);
    this.models.mesh(new THREE.PlaneGeometry(200, 200), this.models.material('#f1f5f4', 0, 0.96), this.world).rotation.x = -Math.PI / 2;
    for (const radius of [5.6, 5.7, 7.6]) {
      const circle = this.models.mesh(new THREE.RingGeometry(radius, radius + 0.012, 120), this.models.material('#d2dfda'), this.world, 0, 0.003, 0);
      circle.rotation.x = -Math.PI / 2; circle.castShadow = false;
    }
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      const tick = this.models.box(this.world, [0.018, 0.008, i % 4 ? 0.08 : 0.18], [Math.cos(angle) * 5.87, 0.006, Math.sin(angle) * 5.87], '#c4d5cf', 0.001);
      tick.rotation.y = -angle + Math.PI / 2;
    }
    this.world.add(this.models.stand());
    this.plate = this.models.platform();
    this.world.add(this.plate);
    this.templates = PLAYER_COLORS.map((_, owner) => this.models.astronaut(owner));
    this.world.add(this.standby);
    this.updateStandby();
    this.ghost = this.templates[0].clone();
    this.ghost.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const material = (child.material as THREE.MeshStandardMaterial).clone();
        material.transparent = true; material.opacity = 0.35; material.depthWrite = false;
        material.userData.teamColor = material.color.getHex() === 0x257bc1;
        child.material = material; child.castShadow = false;
        this.ghostMaterials.push(material);
      }
    });
    this.plate.add(this.ghost);
    this.selection = this.models.mesh(new THREE.RingGeometry(0.34, 0.41, 40), this.models.material('#f4d574'), this.plate);
    this.selection.rotation.x = -Math.PI / 2;
    this.selection.castShadow = false;
    const targetMaterial = new THREE.MeshBasicMaterial({ visible: false });
    for (const slot of SLOTS) {
      const target = this.models.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), targetMaterial, this.plate, slot.x, deckSurface(slot) + 0.04, slot.z);
      target.userData.slot = slot.id;
      this.targets.push(target);
    }
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.enablePan = false; this.controls.rotateSpeed = 0.65;
    this.controls.minPolarAngle = 0.08; this.controls.maxPolarAngle = Math.PI * 0.43;
    this.controls.minZoom = 0.75; this.controls.maxZoom = 1.6;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.resetView();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    this.resize();
    this.animate(0);
  }

  setGame(game: BalanceGame) {
    this.game = game;
    this.actors.forEach(actor => this.world.remove(actor));
    this.actors.clear();
    this.hovered = null;
    this.last = 0;
    this.updateStandby();
    this.resetView();
  }

  private updateStandby() {
    this.standby.clear();
    for (let owner = 0; owner < this.game.settings.count; owner++) {
      const actor = this.templates[owner].clone();
      actor.position.set(2.5 + owner * 0.68, 0.02, 2.7 + owner * 0.4);
      actor.rotation.y = -0.25;
      actor.userData.owner = owner;
      actor.userData.color = PLAYER_COLORS[owner];
      this.standby.add(actor);
    }
  }

  resetView() {
    this.camera.position.set(9.5, 11.4, 18);
    this.controls.target.set(0, 2.85, 0);
    this.camera.zoom = 1;
    this.controls.update();
    this.camera.updateProjectionMatrix();
  }

  view(action: string) {
    if (action === 'reset') this.resetView();
    else if (action === 'top') {
      this.camera.position.set(0.01, 24, 0.1);
      this.controls.update();
    } else {
      this.offset.copy(this.camera.position).sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -Math.PI / 7 : Math.PI / 7);
      this.camera.position.copy(this.controls.target).add(this.offset);
      this.controls.update();
    }
  }

  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = Math.max(6.05, 6.65 / aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private pick(event: PointerEvent) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.pointer, this.camera);
    const target = this.ray.intersectObjects(this.targets, false)[0];
    return target && !this.game.physics.crew.has(target.object.userData.slot) ? target.object.userData.slot as number : null;
  }

  private pointerDown = (event: PointerEvent) => {
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) { if (this.start) this.start.dragged = true; return; }
    this.start = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: event.button !== 0, allowed: this.game.canPlace && !this.game.isBot, turn: this.game.turn, move: this.game.moves };
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.start && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 7) this.start.dragged = true;
    this.hovered = event.pointerType === 'mouse' && this.activePointers.size === 0 ? this.pick(event) : null;
    this.renderer.domElement.style.cursor = this.hovered !== null && !this.game.isBot && this.game.phase === 'place' ? 'pointer' : 'grab';
  };
  private pointerUp = (event: PointerEvent) => {
    if (this.start?.id === event.pointerId && this.start.allowed && this.start.turn === this.game.turn && this.start.move === this.game.moves && !this.start.dragged && this.activePointers.size === 1) {
      const id = this.pick(event);
      if (id !== null) this.onSelect(id);
    }
    this.activePointers.delete(event.pointerId);
    if (!this.activePointers.size) this.start = null;
  };
  private pointerCancel = (event: PointerEvent) => { this.activePointers.delete(event.pointerId); if (this.start) this.start.dragged = true; };
  private pointerLeave = () => { this.hovered = null; };

  private animate = (timestamp: number) => {
    if (this.disposed) return;
    const delta = this.last ? (timestamp - this.last) / 1000 : 0;
    this.last = timestamp;
    this.game.update(delta);
    this.controls.update();
    const { position, quaternion } = this.game.physics.plate;
    this.plate.position.set(position.x, position.y, position.z);
    this.plate.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    for (const crew of this.game.physics.crew.values()) {
      let actor = this.actors.get(crew.slot);
      if (!actor) {
        actor = this.templates[crew.owner].clone();
        this.actors.set(crew.slot, actor); this.world.add(actor);
      }
      actor.quaternion.set(crew.body.quaternion.x, crew.body.quaternion.y, crew.body.quaternion.z, crew.body.quaternion.w);
      this.offset.set(0, -CREW_COM, 0).applyQuaternion(actor.quaternion);
      actor.position.set(crew.body.position.x, crew.body.position.y, crew.body.position.z).add(this.offset);
    }
    const selected = this.game.selected ?? this.hovered;
    const selecting = !this.game.paused && this.game.phase === 'place' && selected !== null && !this.game.physics.crew.has(selected);
    this.selection.visible = this.ghost.visible = selecting;
    if (selecting) {
      const slot = SLOTS[selected!];
      this.selection.position.set(slot.x, deckSurface(slot) + 0.04, slot.z);
      this.ghost.position.set(slot.x, deckSurface(slot) + 0.025 + (this.reduced ? 0 : Math.sin(timestamp / 380) * 0.02), slot.z);
      this.selection.material = this.models.material(PLAYER_COLORS[this.game.turn]);
      this.ghostMaterials.forEach(material => { if (material.userData.teamColor) material.color.set(PLAYER_COLORS[this.game.turn]); });
    }
    this.renderer.render(this.world, this.camera);
    this.onFrame();
    this.frame = requestAnimationFrame(this.animate);
  };

  diagnostics() {
    this.plate.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      crew: this.actors.size,
      rings: RINGS.map(ring => ({ radius: ring.radius, height: ring.height, count: ring.count })),
      standby: this.standby.children.map(actor => ({ owner: actor.userData.owner, color: actor.userData.color })),
      camera: this.camera.position.toArray(),
      slots: SLOTS.map(slot => {
        this.v.set(slot.x, deckSurface(slot) + 0.1, slot.z);
        this.plate.localToWorld(this.v); this.v.project(this.camera);
        return { id: slot.id, occupied: this.game.physics.crew.has(slot.id), x: rect.left + (this.v.x + 1) / 2 * rect.width, y: rect.top + (1 - this.v.y) / 2 * rect.height };
      }),
    };
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame);
    this.observer.disconnect(); this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointercancel', this.pointerCancel);
    canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.ghostMaterials.forEach(material => material.dispose());
    (this.targets[0].material as THREE.Material).dispose();
    this.world.traverse(object => { if (object instanceof THREE.Light && 'shadow' in object) (object as THREE.DirectionalLight).shadow?.dispose(); });
    this.models.dispose(); this.renderer.dispose(); canvas.remove();
  }
}
