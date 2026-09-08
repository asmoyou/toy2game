import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BEAN_COLORS, DECK_Y, TEAMS, mouthPose } from './config';
import { FrogGame } from './game';
import { ToyModels, type FrogModel } from './models';

export class FrogScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100);
  private world = new THREE.Scene();
  private models = new ToyModels();
  private frogs: FrogModel[];
  private beans: THREE.Mesh[];
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private environment: THREE.WebGLRenderTarget;
  private groundMaterial = new THREE.MeshBasicMaterial({ color: '#f5f6ed', toneMapped: false });
  private shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.13 });
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private v = new THREE.Vector3();
  private fitPoint = new THREE.Vector3();
  private aspect = 1;
  private frame = 0;
  private last = 0;
  private visualTime = 0;
  private finishTime = 0;
  private disposed = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private gesture: { id: number; x: number; y: number; moved: boolean; owner: number | null } | null = null;
  private pointers = new Set<number>();
  private caught = new Map<number, { slot: number; at: number }>();
  private trayCounts = [0, 0, 0, 0];
  private host: HTMLElement;
  private game: FrogGame;
  private onFrame: (delta: number) => void;
  private onBite: (id: number) => void;
  private onLost: () => void;

  constructor(host: HTMLElement, game: FrogGame, onFrame: (delta: number) => void, onBite: (id: number) => void, onLost: () => void) {
    this.host = host; this.game = game; this.onFrame = onFrame; this.onBite = onBite; this.onLost = onLost;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '蓝色圆盘上的四只青蛙和彩色豆子，轻触青蛙吃豆，拖动空白旋转');
    canvas.setAttribute('role', 'img'); host.append(canvas);
    this.world.background = new THREE.Color('#f5f6ed');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.world.environment = this.environment.texture;
    this.world.environmentIntensity = 0.32;
    room.dispose(); pmrem.dispose();
    this.world.add(new THREE.HemisphereLight('#ffffff', '#b6c8ab', 1.25));
    const sun = new THREE.DirectionalLight('#fff6e0', 2.2);
    sun.position.set(-7, 15, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.normalBias = 0.03; sun.shadow.bias = -0.0002; sun.shadow.radius = 4;
    this.world.add(sun);
    const fill = new THREE.DirectionalLight('#d9f3ff', 0.65); fill.position.set(8, 8, -10); this.world.add(fill);
    const ground = this.models.mesh(this.world, new THREE.PlaneGeometry(200, 200), this.groundMaterial, 0, -0.32, 0);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    const shadow = this.models.mesh(this.world, new THREE.PlaneGeometry(200, 200), this.shadowMaterial, 0, -0.318, 0);
    shadow.rotation.x = -Math.PI / 2; shadow.castShadow = false;
    for (const radius of [7.2, 7.32, 9.25]) {
      const line = this.models.mesh(this.world, new THREE.RingGeometry(radius, radius + 0.018, 120), this.models.material('#dfe6d5', 1), 0, -0.315, 0);
      line.rotation.x = -Math.PI / 2; line.castShadow = false;
    }
    this.world.add(this.models.board());
    this.frogs = TEAMS.map((_, i) => { const frog = this.models.frog(i); this.world.add(frog.root); return frog; });
    this.beans = game.physics.beans.map(bean => this.models.bean(this.world, BEAN_COLORS[bean.color]));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.16;
    this.controls.enablePan = false; this.controls.rotateSpeed = 0.6;
    this.controls.minZoom = 0.78; this.controls.maxZoom = 1.7;
    this.controls.minPolarAngle = 0.12; this.controls.maxPolarAngle = Math.PI * 0.36;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.resetView(); this.setGame(game);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('lostpointercapture', this.pointerCancel);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    this.resize(); this.frame = requestAnimationFrame(this.animate);
  }

  setGame(game: FrogGame) {
    this.game = game; this.last = 0; this.visualTime = 0; this.finishTime = 0;
    this.caught.clear(); this.trayCounts.fill(0); this.cancelGesture();
    this.frogs.forEach((frog, i) => {
      const active = i < game.settings.count;
      this.models.material(TEAMS[i].color).color.set(TEAMS[i].color).lerp(new THREE.Color('#bbc6b4'), active ? 0 : 0.75);
      frog.lever.visible = active;
    });
  }

  resetView() {
    // Consume OrbitControls' remaining drag inertia before assigning the default pose.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false; this.controls.update();
    this.camera.position.set(0, 15.8, 16.5);
    this.controls.target.set(0, 0.15, 0);
    this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.update();
    this.controls.enableDamping = damping;
  }

  view(action: string) {
    this.cancelGesture();
    if (action === 'reset') this.resetView();
    else {
      this.v.copy(this.camera.position).sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -Math.PI / 6 : Math.PI / 6);
      this.camera.position.copy(this.controls.target).add(this.v); this.controls.update();
    }
  }

  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    this.aspect = width / height;
    this.fitView(); this.renderer.setSize(width, height);
  }

  private fitView() {
    this.camera.updateMatrixWorld();
    let half = Math.max(5.05, 6.15 / this.aspect);
    // Raised levers reach farther than the bowl. Keep them in frame as the table rotates;
    // camera zoom stays untouched, including across fullscreen and screen rotation.
    for (const team of TEAMS) for (const side of [-1, 1]) {
      const { angle } = team;
      this.fitPoint.set(Math.cos(angle) * 7.25 - Math.sin(angle) * side, 1.05, Math.sin(angle) * 7.25 + Math.cos(angle) * side).applyMatrix4(this.camera.matrixWorldInverse);
      half = Math.max(half, Math.abs(this.fitPoint.y) + 0.26, (Math.abs(this.fitPoint.x) + 0.26) / this.aspect);
    }
    if (Math.abs(this.camera.top - half) < 1e-6 && Math.abs(this.camera.right - half * this.aspect) < 1e-6) return;
    this.camera.left = -half * this.aspect; this.camera.right = half * this.aspect;
    this.camera.top = half; this.camera.bottom = -half; this.camera.updateProjectionMatrix();
  }

  private pick(event: PointerEvent) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.camera.updateMatrixWorld(); this.ray.setFromCamera(this.pointer, this.camera);
    const target = this.ray.intersectObjects(this.frogs.map(frog => frog.target))[0];
    const owner = target ? target.object.userData.owner as number : null;
    return owner !== null && owner < this.game.settings.count && !this.game.settings.bots[owner] ? owner : null;
  }

  cancelGesture() { this.gesture = null; this.pointers.clear(); }

  private pointerDown = (event: PointerEvent) => {
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) { if (this.gesture) this.gesture.moved = true; return; }
    this.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: event.button !== 0, owner: this.pick(event) };
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.gesture && Math.hypot(event.clientX - this.gesture.x, event.clientY - this.gesture.y) > 7) this.gesture.moved = true;
    if (!this.pointers.size && event.pointerType === 'mouse') this.renderer.domElement.style.cursor = this.pick(event) === null ? 'grab' : 'pointer';
  };
  private pointerUp = (event: PointerEvent) => {
    const start = this.gesture;
    if (start?.id === event.pointerId && !start.moved && this.pointers.size === 1 && start.owner !== null && this.pick(event) === start.owner) this.onBite(start.owner);
    this.pointers.delete(event.pointerId);
    if (!this.pointers.size) this.gesture = null;
  };
  private pointerCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId); if (this.gesture) this.gesture.moved = true;
    if (!this.pointers.size) this.gesture = null;
  };
  private contextLost = (event: Event) => { event.preventDefault(); this.onLost(); };

  private animate = (now: number) => {
    if (this.disposed) return;
    const delta = this.last ? Math.min((now - this.last) / 1000, 0.05) : 0; this.last = now;
    this.game.update(delta);
    if (!this.game.paused) { this.visualTime += delta; if (this.game.phase === 'finished') this.finishTime += delta; }
    this.frogs.forEach((model, i) => {
      const age = this.game.time + this.finishTime - this.game.frogs[i].startedAt;
      const pose = mouthPose(age);
      model.head.position.z = -0.56 + pose.reach;
      model.head.rotation.x = -pose.open;
      model.jaw.position.z = pose.reach;
      model.lever.rotation.x = 0.32 - pose.reach * 0.3;
    });
    this.game.physics.beans.filter(bean => bean.owner !== null && !this.caught.has(bean.id)).sort((a, b) => a.caughtAt - b.caughtAt || a.id - b.id).forEach(bean => {
      this.caught.set(bean.id, { slot: this.trayCounts[bean.owner!]++, at: this.visualTime });
    });
    this.game.physics.beans.forEach(bean => {
      const mesh = this.beans[bean.id], p = bean.body.position;
      if (bean.owner === null) { mesh.position.set(p.x, p.y, p.z); return; }
      const { slot, at } = this.caught.get(bean.id)!;
      const a = TEAMS[bean.owner].angle;
      const side = (slot % 4 - 1.5) * 0.4;
      const radial = 5.61 + Math.floor(slot / 4) % 3 * 0.4;
      this.v.set(Math.cos(a) * radial - Math.sin(a) * side, 0.24 + Math.floor(slot / 12) * 0.33, Math.sin(a) * radial + Math.cos(a) * side);
      const t = this.reduced ? 1 : Math.min(1, (this.visualTime - at) / 0.48);
      mesh.position.set(p.x, p.y, p.z).lerp(this.v, t);
      mesh.position.y += Math.sin(t * Math.PI) * 1.8;
    });
    this.controls.update(); this.fitView(); this.renderer.render(this.world, this.camera);
    this.onFrame(delta); this.frame = requestAnimationFrame(this.animate);
  };

  diagnostics() {
    this.camera.updateMatrixWorld();
    const bounds = this.renderer.domElement.getBoundingClientRect();
    return {
      camera: { position: this.camera.position.toArray(), zoom: this.camera.zoom },
      frogs: this.frogs.map((frog, owner) => {
        frog.root.getWorldPosition(this.v); this.v.y = DECK_Y + 0.65; this.v.project(this.camera);
        return { owner, x: bounds.x + (this.v.x + 1) * bounds.width / 2, y: bounds.y + (1 - this.v.y) * bounds.height / 2 };
      }),
      beans: this.beans.length,
      drawCalls: this.renderer.info.render.calls,
    };
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('pointercancel', this.pointerCancel);
    canvas.removeEventListener('lostpointercapture', this.pointerCancel); canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.frogs.forEach(frog => (frog.target.material as THREE.Material).dispose());
    this.environment.dispose(); this.groundMaterial.dispose(); this.shadowMaterial.dispose();
    this.models.dispose(); this.renderer.dispose(); canvas.remove();
  }
}
