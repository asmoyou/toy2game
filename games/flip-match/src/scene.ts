import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MatchGame } from './game';
import { BOARD_HALF, Models, TILE_Y, collectedPosition, positions } from './models';

type Tile = ReturnType<Models['tile']> & { angle: number; from: number; at: number; owner: number; slot: number; origin: THREE.Vector3 };

export class MatchScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100);
  private world = new THREE.Scene();
  private models = new Models();
  private table = new THREE.Group();
  private tiles: Tile[] = [];
  private slots = [0, 0, 0, 0];
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private environment: THREE.WebGLRenderTarget;
  private ground: THREE.Mesh;
  private shadow: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private v = new THREE.Vector3();
  private aspect = 1;
  private frame = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private pointers = new Set<number>();
  private gesture: { id: number; x: number; y: number; moved: boolean; tile: number | null } | null = null;
  private host: HTMLElement;
  private game: MatchGame;
  private onFrame: () => void;
  private onFlip: (id: number) => void;
  private onLost: () => void;

  constructor(host: HTMLElement, game: MatchGame, onFrame: () => void, onFlip: (id: number) => void, onLost: () => void) {
    this.host = host; this.game = game; this.onFrame = onFrame; this.onFlip = onFlip; this.onLost = onLost;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 0.95;
    const canvas = this.renderer.domElement; canvas.setAttribute('aria-label', '薄荷绿八角棋盘，轻触黄色棋子翻面，也可使用棋子列表'); canvas.setAttribute('role', 'img'); host.append(canvas);
    this.world.background = new THREE.Color('#f7f7ef');
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04); this.world.environment = this.environment.texture; this.world.environmentIntensity = 0.28;
    room.dispose(); pmrem.dispose();
    this.world.add(new THREE.HemisphereLight('#ffffff', '#bfd2b1', 1.6));
    const sun = new THREE.DirectionalLight('#fff7e3', 2.6); sun.position.set(-8, 16, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4; this.world.add(sun);
    const fill = new THREE.DirectionalLight('#dfefff', 0.65); fill.position.set(8, 9, -8); this.world.add(fill);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: '#f7f7ef', toneMapped: false }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.79; this.world.add(this.ground);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.12 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -0.788; this.shadow.receiveShadow = true; this.world.add(this.shadow);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enablePan = false; this.controls.enableDamping = false;
    this.controls.rotateSpeed = 0.6; this.controls.minZoom = 0.8; this.controls.maxZoom = 2;
    this.controls.minPolarAngle = 0.05; this.controls.maxPolarAngle = Math.PI * 0.32;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE; this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.view('reset'); this.setGame(game);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    canvas.addEventListener('pointerdown', this.pointerDown, true); canvas.addEventListener('pointermove', this.pointerMove, true);
    canvas.addEventListener('pointerup', this.pointerUp, true); canvas.addEventListener('pointercancel', this.pointerCancel, true);
    canvas.addEventListener('lostpointercapture', this.pointerCancel); canvas.addEventListener('webglcontextlost', this.contextLost);
    this.resize(); this.frame = requestAnimationFrame(this.animate);
  }

  setGame(game: MatchGame) {
    this.game = game; this.time = 0; this.last = 0; this.slots.fill(0); this.cancelGesture();
    this.world.remove(this.table); this.models.dispose(); this.models = new Models(); this.table = this.models.board(game.state.settings.pairs);
    const pos = positions(game.state.settings.pairs);
    this.tiles = game.state.deck.map((face, id) => {
      const tile = this.models.tile(id, face), owner = game.state.owners[id], angle = game.state.open.includes(id) || owner >= 0 ? 0 : Math.PI;
      const slot = owner >= 0 ? this.slots[owner]++ : -1;
      tile.group.position.copy(owner >= 0 ? collectedPosition(owner, slot) : pos[id]); tile.group.rotation.x = angle; tile.group.scale.setScalar(owner >= 0 ? 0.62 : 1);
      this.table.add(tile.group); return { ...tile, angle, from: angle, at: -1, owner, slot, origin: pos[id] };
    });
    this.world.add(this.table);
  }
  view(action: string) {
    this.cancelGesture();
    if (action === 'reset' || action === 'top') {
      this.controls.target.set(0, 0, 0); this.camera.position.set(0, action === 'top' ? 22 : 18, action === 'top' ? 0.1 : 12.5); this.camera.zoom = 1;
    } else {
      this.v.copy(this.camera.position).sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -Math.PI / 6 : Math.PI / 6);
      this.camera.position.copy(this.controls.target).add(this.v);
    }
    this.controls.update(); this.camera.updateProjectionMatrix();
  }
  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return; this.aspect = width / height; this.fitView(); this.renderer.setSize(width, height);
  }
  private fitView() {
    this.camera.updateMatrixWorld();
    let half = 4.7;
    // Fit the complete octagon for any angle/aspect without changing the user's zoom.
    for (const x of [-BOARD_HALF, -3.8, 3.8, BOARD_HALF]) for (const z of [-BOARD_HALF, -3.8, 3.8, BOARD_HALF]) {
      if (Math.abs(x) + Math.abs(z) > 9.6) continue;
      for (const y of [-0.6, 0.8]) { this.v.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse); half = Math.max(half, Math.abs(this.v.y) + 0.45, (Math.abs(this.v.x) + 0.4) / this.aspect); }
    }
    if (Math.abs(this.camera.top - half) < 1e-6 && Math.abs(this.camera.right - half * this.aspect) < 1e-6) return;
    this.camera.left = -half * this.aspect; this.camera.right = half * this.aspect; this.camera.top = half; this.camera.bottom = -half; this.camera.updateProjectionMatrix();
  }
  private pick(event: PointerEvent) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.camera.updateMatrixWorld(); this.ray.setFromCamera(this.pointer, this.camera);
    const available = (id: number) => this.game.state.owners[id] < 0 && !this.game.state.open.includes(id);
    const hit = this.ray.intersectObjects(this.tiles.map(tile => tile.target))[0];
    if (hit) { const id = hit.object.userData.id as number; return available(id) ? id : null; }
    let nearest: number | null = null, distance = 19;
    // Retain occupied/empty slot centers when expanding hit areas: tapping a revealed
    // tile or a cleared well must not fall through to a nearby hidden tile on phones.
    for (const tile of this.tiles) {
      this.v.copy(tile.origin).project(this.camera);
      const d = Math.hypot(bounds.x + (this.v.x + 1) * bounds.width / 2 - event.clientX, bounds.y + (1 - this.v.y) * bounds.height / 2 - event.clientY);
      if (d < distance) { distance = d; nearest = tile.group.userData.id as number; }
    }
    return nearest !== null && available(nearest) ? nearest : null;
  }
  cancelGesture() { this.gesture = null; this.pointers.clear(); }
  private pointerDown = (event: PointerEvent) => {
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) { if (this.gesture) this.gesture.moved = true; return; }
    this.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: event.button !== 0, tile: this.pick(event) };
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.gesture && Math.hypot(event.clientX - this.gesture.x, event.clientY - this.gesture.y) > 7) this.gesture.moved = true;
    if (!this.pointers.size && event.pointerType === 'mouse') this.renderer.domElement.style.cursor = this.game.ready && !this.game.isBot && this.pick(event) !== null ? 'pointer' : 'grab';
  };
  private pointerUp = (event: PointerEvent) => {
    const start = this.gesture;
    if (start?.id === event.pointerId && !start.moved && this.pointers.size === 1 && start.tile !== null && this.pick(event) === start.tile) this.onFlip(start.tile);
    this.pointers.delete(event.pointerId); if (!this.pointers.size) this.gesture = null;
  };
  private pointerCancel = (event: PointerEvent) => { this.pointers.delete(event.pointerId); if (this.gesture) this.gesture.moved = true; if (!this.pointers.size) this.gesture = null; };
  private contextLost = (event: Event) => { event.preventDefault(); this.onLost(); };
  private animate = (now: number) => {
    if (this.disposed) return;
    const delta = this.last ? Math.min((now - this.last) / 1000, 0.05) : 0; this.last = now;
    this.game.update(delta); if (!this.game.paused) this.time += delta;
    const G = this.game.state;
    for (const [id, tile] of this.tiles.entries()) {
      const angle = G.open.includes(id) || G.owners[id] >= 0 ? 0 : Math.PI;
      if (angle !== tile.angle) { tile.from = tile.group.rotation.x; tile.angle = angle; tile.at = this.time; }
      if (tile.owner !== G.owners[id]) { tile.owner = G.owners[id]; tile.slot = this.slots[tile.owner]++; tile.at = this.time; }
      const t = this.motion.matches ? 1 : Math.min(1, (this.time - tile.at) / (tile.owner >= 0 ? 0.55 : 0.34)), ease = t * t * (3 - 2 * t);
      tile.group.rotation.x = THREE.MathUtils.lerp(tile.from, tile.angle, ease);
      if (tile.owner >= 0) {
        tile.group.position.copy(tile.origin).lerp(collectedPosition(tile.owner, tile.slot), ease); tile.group.position.y += Math.sin(Math.PI * t) * 1.8;
        tile.group.scale.setScalar(THREE.MathUtils.lerp(1, 0.62, ease));
      } else { tile.group.position.copy(tile.origin); tile.group.position.y = TILE_Y + Math.sin(Math.PI * t) * 0.58; }
    }
    this.controls.enabled = !this.game.paused; this.controls.update(); this.fitView(); this.renderer.render(this.world, this.camera);
    this.onFrame(); this.frame = requestAnimationFrame(this.animate);
  };
  diagnostics() {
    this.camera.updateMatrixWorld(); const bounds = this.renderer.domElement.getBoundingClientRect();
    return { camera: { position: this.camera.position.toArray(), zoom: this.camera.zoom }, drawCalls: this.renderer.info.render.calls,
      tiles: this.tiles.map((tile, id) => { this.v.copy(tile.origin).project(this.camera); return { id, x: bounds.x + (this.v.x + 1) * bounds.width / 2, y: bounds.y + (1 - this.v.y) * bounds.height / 2 }; }),
    };
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown, true); canvas.removeEventListener('pointermove', this.pointerMove, true); canvas.removeEventListener('pointerup', this.pointerUp, true);
    canvas.removeEventListener('pointercancel', this.pointerCancel, true); canvas.removeEventListener('lostpointercapture', this.pointerCancel); canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.models.dispose(); this.environment.dispose();
    for (const mesh of [this.ground, this.shadow]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.world.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.dispose(); }); this.renderer.dispose(); canvas.remove();
  }
}
