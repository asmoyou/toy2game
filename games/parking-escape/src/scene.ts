import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ToyModels } from './models';
import { bounds, EXIT, type Level, type Move } from './rules';

type Drag = { pointer: number; car: number; start: THREE.Vector3; from: number; to: number; x: number; y: number; moved: boolean };
type SceneCallbacks = { select: (index: number) => void; move: (move: Move) => void; frame: (dt: number) => void; error: () => void };

export class ParkingScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
  readonly world = new THREE.Scene();
  private controls: OrbitControls;
  private boardModels = new ToyModels();
  private carModels = new ToyModels();
  private actors: THREE.Group[] = [];
  private level!: Level;
  private positions: number[] = [];
  private targets: THREE.Vector3[] = [];
  private selector: THREE.Mesh;
  private hintMarker: THREE.Mesh;
  private selected = 0;
  private hint: Move | null = null;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
  private observer: ResizeObserver;
  private frameId = 0;
  private last = 0;
  private drag: Drag | null = null;
  private pointers = new Set<number>();
  private multi = false;
  private touchPoints = new Map<number, THREE.Vector2>();
  private pinch: { distance: number; zoom: number } | null = null;
  private floorMaterials: THREE.Material[] = [];
  private abort = new AbortController();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;
  paused = false;
  inputLocked = false;
  animating = false;

  constructor(private host: HTMLElement, private callbacks: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.world.background = new THREE.Color('#edf3f5');
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '益智移车出库三维停车场');
    canvas.setAttribute('role', 'img');
    host.append(canvas);
    this.world.add(new THREE.HemisphereLight('#ffffff', '#acbcc0', 1.7));
    const light = new THREE.DirectionalLight('#fffaf0', 2.4);
    light.position.set(-3, 12, 5); light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.1, far: 30 });
    light.shadow.normalBias = 0.035; light.shadow.bias = -0.0002;
    this.world.add(light);
    const fill = new THREE.DirectionalLight('#d8f6ff', 0.7); fill.position.set(5, 5, -8); this.world.add(fill);
    this.world.add(this.boardModels.board());
    const floorMaterial = new THREE.MeshBasicMaterial({ color: '#edf3f5', toneMapped: false });
    const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.17 });
    this.floorMaterials.push(floorMaterial, shadowMaterial);
    const floor = this.boardModels.mesh(this.world, new THREE.PlaneGeometry(200, 200), floorMaterial, [0, -0.52, 0]);
    floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    const shadow = this.boardModels.mesh(this.world, new THREE.PlaneGeometry(200, 200), shadowMaterial, [0, -0.518, 0]);
    shadow.rotation.x = -Math.PI / 2; shadow.castShadow = false;
    const marker = (color: string, opacity: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.075;
      this.world.add(mesh); return mesh;
    };
    this.selector = marker('#218d9c', 0.62);
    this.hintMarker = marker('#ffcc45', 0.75); this.hintMarker.visible = false;
    // Register before OrbitControls so a vehicle drag can claim the pointer first.
    canvas.addEventListener('pointerdown', this.pointerDown, { signal: this.abort.signal });
    canvas.addEventListener('pointermove', this.pointerMove, { signal: this.abort.signal });
    canvas.addEventListener('pointerup', this.pointerUp, { signal: this.abort.signal });
    canvas.addEventListener('pointercancel', this.pointerCancel, { signal: this.abort.signal });
    canvas.addEventListener('lostpointercapture', this.lostCapture, { signal: this.abort.signal });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.setPaused(true); callbacks.error(); }, { signal: this.abort.signal });
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.35, 0, 0);
    this.controls.enablePan = false; this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.02; this.controls.maxPolarAngle = Math.PI / 3.2;
    this.controls.minZoom = 0.75; this.controls.maxZoom = 1.65;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.resetView();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize(); this.frameId = requestAnimationFrame(this.frame);
  }

  setLevel(level: Level, positions: number[]) {
    this.cancelDrag();
    this.actors.forEach(actor => this.world.remove(actor)); this.carModels.dispose(); this.carModels = new ToyModels();
    this.level = level;
    this.actors = level.cars.map((car, i) => { const actor = this.carModels.vehicle(car, i); this.world.add(actor); return actor; });
    this.sync(positions, true); this.select(0); this.showHint(null);
  }

  point(index: number, position: number) {
    const car = this.level.cars[index], along = position - 3 + car.size / 2;
    return new THREE.Vector3(car.axis === 'x' ? along : car.lane - 2.5, 0, car.axis === 'z' ? along : car.lane - 2.5);
  }

  sync(positions: number[], immediate = false) {
    this.positions = [...positions]; this.targets = positions.map((position, i) => this.point(i, position));
    if (immediate || this.reduced) this.actors.forEach((actor, i) => actor.position.copy(this.targets[i]));
    this.animating = this.actors.some((actor, i) => actor.position.distanceToSquared(this.targets[i]) > 0.00001);
    this.updateMarkers();
  }

  select(index: number) { this.selected = index; this.updateMarkers(); }
  showHint(move: Move | null) { this.hint = move; this.updateMarkers(); }

  private updateMarkers() {
    if (!this.level) return;
    const mark = (mesh: THREE.Mesh, index: number, to: number) => {
      const car = this.level.cars[index], point = this.point(index, to);
      mesh.position.set(point.x, 0.079, point.z);
      mesh.scale.set(car.axis === 'x' ? car.size - 0.035 : 0.98, car.axis === 'z' ? car.size - 0.035 : 0.98, 1);
    };
    this.selector.visible = this.positions[0] !== EXIT;
    mark(this.selector, this.selected, this.positions[this.selected]);
    this.hintMarker.visible = !!this.hint;
    if (this.hint) mark(this.hintMarker, this.hint.car, Math.min(this.hint.to, 4));
  }

  private cast(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), this.camera);
  }

  private ground(x: number, y: number) {
    this.cast(x, y);
    return this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pointers.add(event.pointerId);
    this.touchPoints.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    if (this.pointers.size > 1) {
      this.multi = true; this.cancelDrag();
      const points = [...this.touchPoints.values()];
      this.pinch = { distance: points[0].distanceTo(points[1]), zoom: this.camera.zoom };
      this.controls.enabled = false;
      return;
    }
    this.multi = false;
    if (this.paused || this.inputLocked || this.animating || this.positions[0] === EXIT) return;
    this.cast(event.clientX, event.clientY);
    const hit = this.ray.intersectObjects(this.actors, true)[0];
    if (!hit) return;
    const car = hit.object.userData.car as number, start = this.ground(event.clientX, event.clientY);
    if (!start) return;
    this.callbacks.select(car);
    this.controls.enabled = false;
    this.drag = { pointer: event.pointerId, car, start, from: this.positions[car], to: this.positions[car], x: event.clientX, y: event.clientY, moved: false };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private pointerMove = (event: PointerEvent) => {
    if (this.touchPoints.has(event.pointerId)) this.touchPoints.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    if (this.multi && this.pinch && this.touchPoints.size >= 2 && !this.paused) {
      const points = [...this.touchPoints.values()];
      this.camera.zoom = THREE.MathUtils.clamp(this.pinch.zoom * points[0].distanceTo(points[1]) / Math.max(1, this.pinch.distance), 0.75, 1.65);
      this.camera.updateProjectionMatrix();
      return;
    }
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId || this.multi || this.paused) return;
    const point = this.ground(event.clientX, event.clientY);
    if (!point) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moved = true;
    if (!drag.moved) return;
    const axis = this.level.cars[drag.car].axis, range = bounds(this.level.cars, this.positions, drag.car);
    const to = THREE.MathUtils.clamp(drag.from + point[axis] - drag.start[axis], range.min, range.max);
    drag.to = to;
    this.actors[drag.car].position.copy(this.point(drag.car, to));
  };

  private pointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    this.pointers.delete(event.pointerId);
    this.touchPoints.delete(event.pointerId);
    if (drag?.pointer === event.pointerId) {
      let to = Math.round(drag.to);
      if (drag.car === 0 && to >= 5) to = EXIT;
      this.drag = null;
      if (!this.multi && !this.paused && !this.inputLocked && drag.moved && to !== drag.from) this.callbacks.move({ car: drag.car, to });
      this.sync(this.positions);
      // Keep controls disabled until its pointerup handler has consumed this vehicle gesture.
      queueMicrotask(() => { if (!this.disposed) this.controls.enabled = !this.paused; });
    }
    if (!this.pointers.size) {
      this.multi = false; this.pinch = null;
      queueMicrotask(() => { if (!this.disposed) this.controls.enabled = !this.paused; });
    }
  };

  private pointerCancel = (event: PointerEvent) => { this.pointers.delete(event.pointerId); this.touchPoints.delete(event.pointerId); this.cancelDrag(); if (!this.pointers.size) { this.multi = false; this.pinch = null; } };
  private lostCapture = (event: PointerEvent) => { if (this.drag?.pointer === event.pointerId) this.pointerCancel(event); };

  cancelDrag() {
    if (this.drag) { this.actors[this.drag.car].position.copy(this.targets[this.drag.car]); this.drag = null; }
    if (this.controls) this.controls.enabled = !this.paused;
  }

  setPaused(paused: boolean) { this.paused = paused; this.cancelDrag(); this.pointers.clear(); this.touchPoints.clear(); this.pinch = null; this.multi = false; this.controls.enabled = !paused; }

  resetView() {
    this.camera.position.set(5.4, 14, 10); this.controls.target.set(0.35, 0, 0);
    this.camera.zoom = 1; this.controls.update(); this.resize();
  }

  rotate(direction: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 12);
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update(); this.resize();
  }

  topView() { this.camera.position.set(0.35, 18, 0.01); this.camera.zoom = 1; this.controls.update(); this.resize(); }

  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight), aspect = width / height;
    this.renderer.setSize(width, height);
    this.camera.updateMatrixWorld();
    const points: THREE.Vector3[] = [];
    for (const x of [-3.9, 4.8]) for (const y of [-0.52, 0.9]) for (const z of [-3.9, 3.9]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    const half = Math.max((maxX - minX) / aspect, maxY - minY) / 2 + 0.30;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this.camera.left = cx - half * aspect; this.camera.right = cx + half * aspect;
    this.camera.top = cy + half; this.camera.bottom = cy - half;
    this.camera.updateProjectionMatrix();
  }

  screenPoint(index: number, position = this.positions[index]) {
    const point = this.point(index, position); point.y = 0.5; point.project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }

  private frame = (time: number) => {
    if (this.disposed) return;
    const dt = Math.min((time - (this.last || time)) / 1000, 0.05); this.last = time;
    if (!this.paused) {
      let moving = false;
      this.actors.forEach((actor, i) => {
        if (this.drag?.car === i) return;
        if (actor.position.distanceToSquared(this.targets[i]) > 0.00001) { actor.position.lerp(this.targets[i], 1 - Math.exp(-22 * dt)); moving = true; }
        else actor.position.copy(this.targets[i]);
      });
      this.animating = moving;
    }
    this.callbacks.frame(this.paused ? 0 : dt);
    if (!document.hidden) this.renderer.render(this.world, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frameId); this.abort.abort(); this.observer.disconnect(); this.controls.dispose();
    for (const marker of [this.selector, this.hintMarker]) { marker.geometry.dispose(); (marker.material as THREE.Material).dispose(); }
    this.world.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.dispose(); });
    this.boardModels.dispose(); this.carModels.dispose(); this.floorMaterials.forEach(material => material.dispose()); this.renderer.dispose(); this.renderer.domElement.remove(); this.world.clear();
  }
}
