import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import {
  COLORS,
  FINISH,
  PATH,
  TRAPS,
  type RabbitState,
  type Token,
  type TileEffect,
  isStunned,
} from "./game";
import { playSound } from "./sound";
import {
  BRIDGES,
  DISCOVERIES,
  GROUND_COUNT,
  HILL_PATH,
  STAR_TILES,
  type Discovery,
  FEATURE_TILES,
  FEATURE_INFO,
  featureAt,
  type FeatureTile,
} from "./world";
import {
  cloudPosition,
  type WeatherState,
  type WeatherStrike,
} from "./weather";

const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const materials = new Map<string, THREE.MeshPhysicalMaterial>();
const PREVIEW_GREEN = "#16883e";
const THRONE_SEAT_HEIGHT = 1.82;
type Gameover = { winner?: string; draw?: boolean };

const starShape = new THREE.Shape();
for (let i = 0; i < 10; i++) {
  const angle = Math.PI / 2 + (i * Math.PI) / 5;
  const radius = i % 2 ? 0.46 : 1;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (i === 0) starShape.moveTo(x, y);
  else starShape.lineTo(x, y);
}
starShape.closePath();
const starGeometry = new THREE.ExtrudeGeometry(starShape, {
  depth: 0.12,
  bevelEnabled: true,
  bevelThickness: 0.025,
  bevelSize: 0.025,
  bevelSegments: 2,
  steps: 1,
});
starGeometry.translate(0, 0, -0.06);

function plastic(color: string, roughness = 0.36) {
  const key = `${color}-${roughness}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshPhysicalMaterial({
        color,
        roughness,
        metalness: 0,
        clearcoat: 0.32,
        clearcoatRoughness: 0.3,
      }),
    );
  return materials.get(key)!;
}

function ellipsoid(
  parent: THREE.Object3D,
  color: string,
  position: number[],
  scale: number[],
) {
  const mesh = new THREE.Mesh(sphereGeometry, plastic(color));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedBox(
  parent: THREE.Object3D,
  color: string,
  dimensions: number[],
  position: number[],
  radius = 0.08,
) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(
      dimensions[0],
      dimensions[1],
      dimensions[2],
      3,
      radius,
    ),
    plastic(color),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  color: string,
  top: number,
  bottom: number,
  height: number,
  position: number[],
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(top, bottom, height, 48),
    plastic(color),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function makeRabbit(color: string, number: number) {
  const group = new THREE.Group();
  cylinder(group, color, 0.32, 0.35, 0.1, [0, 0.06, 0]);
  ellipsoid(group, color, [0, 0.4, 0], [0.26, 0.34, 0.23]);
  ellipsoid(group, "#fff8f1", [0, 0.41, 0.195], [0.155, 0.2, 0.045]);
  const numberCanvas = document.createElement("canvas");
  numberCanvas.width = numberCanvas.height = 128;
  const numberContext = numberCanvas.getContext("2d")!;
  numberContext.fillStyle = "#304a3c";
  numberContext.font = "900 112px sans-serif";
  numberContext.textAlign = "center";
  numberContext.textBaseline = "middle";
  numberContext.fillText(String(number), 64, 70);
  const numberTexture = new THREE.CanvasTexture(numberCanvas);
  numberTexture.colorSpace = THREE.SRGBColorSpace;
  const numberBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.265, 0.31),
    new THREE.MeshBasicMaterial({
      map: numberTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  numberBadge.name = "belly-number";
  numberBadge.position.set(0, 0.415, 0.251);
  group.add(numberBadge);
  group.userData.number = number;
  ellipsoid(group, color, [0, 0.82, 0.01], [0.265, 0.255, 0.24]);
  const left = ellipsoid(group, color, [-0.125, 1.16, 0], [0.092, 0.32, 0.083]);
  left.rotation.z = 0.17;
  const right = ellipsoid(group, color, [0.13, 1.16, 0], [0.092, 0.31, 0.083]);
  right.rotation.z = -0.18;
  const innerLeft = ellipsoid(
    group,
    "#f9d3d4",
    [-0.132, 1.19, 0.067],
    [0.045, 0.22, 0.022],
  );
  innerLeft.rotation.z = 0.17;
  const innerRight = ellipsoid(
    group,
    "#f9d3d4",
    [0.14, 1.19, 0.067],
    [0.045, 0.21, 0.022],
  );
  innerRight.rotation.z = -0.18;
  [-1, 1].forEach((side) => {
    ellipsoid(
      group,
      "#343f3a",
      [side * 0.097, 0.85, 0.229],
      [0.026, 0.036, 0.02],
    );
    ellipsoid(
      group,
      "#ffffff",
      [side * 0.093 + 0.006, 0.862, 0.246],
      [0.007, 0.01, 0.006],
    );
    ellipsoid(
      group,
      "#efb6ba",
      [side * 0.17, 0.755, 0.198],
      [0.05, 0.027, 0.017],
    );
    ellipsoid(group, color, [side * 0.19, 0.165, 0.15], [0.14, 0.095, 0.19]);
    const arm = ellipsoid(
      group,
      color,
      [side * 0.235, 0.45, 0.09],
      [0.085, 0.17, 0.095],
    );
    arm.rotation.z = side * 0.32;
  });
  ellipsoid(group, "#b97583", [0, 0.765, 0.253], [0.035, 0.025, 0.02]);
  ellipsoid(group, "#fff8f1", [0, 0.37, -0.23], [0.12, 0.12, 0.12]);
  const bubble = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshPhysicalMaterial({
      color: "#9ddeea",
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      clearcoat: 1,
      depthWrite: false,
    }),
  );
  bubble.name = "bubble-shield";
  bubble.position.y = 0.7;
  bubble.scale.set(0.44, 0.82, 0.43);
  bubble.visible = false;
  bubble.raycast = () => {};
  group.add(bubble);
  const dizzy = new THREE.Group();
  dizzy.name = "stun-halo";
  dizzy.position.y = 1.68;
  dizzy.visible = false;
  for (let i = 0; i < 3; i++) {
    const star = new THREE.Mesh(starGeometry, plastic("#edbd51"));
    const angle = (i * Math.PI * 2) / 3;
    star.position.set(Math.cos(angle) * 0.27, 0, Math.sin(angle) * 0.27);
    star.scale.setScalar(0.065);
    star.raycast = () => {};
    dizzy.add(star);
  }
  group.add(dizzy);
  return group;
}

function rawHeight(x: number, z: number) {
  const r2 = x * x + z * z;
  const knolls =
    0.55 * Math.exp(-((x + 4.1) ** 2 + (z + 2) ** 2) / 1.3) +
    0.7 * Math.exp(-((x - 4.8) ** 2 + (z - 1.3) ** 2) / 1.1) +
    0.45 * Math.exp(-((x + 1.8) ** 2 + (z - 0.2) ** 2) / 1.4);
  const hill =
    0.8 +
    1.4 * Math.exp(-r2 / 24) +
    0.15 * Math.sin(x * 1.7 + z * 0.5) +
    0.13 * Math.cos(z * 2.1 - x * 0.6) +
    knolls;
  const angle = Math.atan2(z / 0.95, x);
  const normalizedRadius = Math.hypot(x, z / 0.95) / boundaryRadius(angle);
  return THREE.MathUtils.lerp(
    hill,
    0.06,
    THREE.MathUtils.smoothstep(normalizedRadius, 0.84, 1),
  );
}

function boundaryRadius(angle: number) {
  return 6.4 + Math.sin(angle * 5) * 0.23 + Math.cos(angle * 8) * 0.12;
}

function heightAt(x: number, z: number) {
  let y = rawHeight(x, z);
  HILL_PATH.forEach(([px, pz]) => {
    const distance = Math.hypot(x - px, z - pz);
    if (distance < 0.76)
      y = THREE.MathUtils.lerp(
        rawHeight(px, pz),
        y,
        THREE.MathUtils.smoothstep(distance, 0.49, 0.76),
      );
  });
  return y;
}

function pathPoint(index: number) {
  if (index >= FINISH)
    return new THREE.Vector3(0, rawHeight(0, 0) + 0.15 + THRONE_SEAT_HEIGHT, 0);
  const [x, z] = PATH[index];
  return new THREE.Vector3(x, rawHeight(x, z) + 0.12, z);
}

function leaf(
  parent: THREE.Object3D,
  color: string,
  length: number,
  width: number,
) {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const w =
      Math.sin(t * Math.PI) * width * (0.85 + 0.15 * Math.sin(t * Math.PI * 5));
    const z = Math.sin(t * Math.PI * 0.7) * length * 0.22;
    positions.push(
      -w,
      t * length,
      z,
      0,
      t * length,
      z + Math.sin(t * Math.PI) * width * 0.45,
      w,
      t * length,
      z,
    );
    if (i < 12) {
      const n = i * 3;
      indices.push(
        n,
        n + 3,
        n + 1,
        n + 1,
        n + 3,
        n + 4,
        n + 1,
        n + 4,
        n + 2,
        n + 2,
        n + 4,
        n + 5,
      );
    }
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = plastic(color).clone();
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function labelTexture(text: string, color: string, background?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 256, 128);
  }
  ctx.fillStyle = color;
  ctx.font = "bold 52px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class RabbitScene {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 100);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private board = new THREE.Group();
  private carrot = new THREE.Group();
  private carrotBody?: THREE.Mesh;
  private rabbits = new Map<string, THREE.Group>();
  private lids = new Map<number, THREE.Group>();
  private highlight: THREE.Mesh;
  private selectionRings = new Map<string, THREE.Mesh>();
  private preview = new THREE.Group();
  private resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private selectable: string[] = [];
  private currentState?: RabbitState;
  private winnerId?: string;
  private places = new Map<Discovery, THREE.Group>();
  private discoveryPins = new Map<Discovery, THREE.Mesh>();
  private starPickups = new Map<number, THREE.Mesh>();
  private featureProps = new Map<number, THREE.Group>();
  private trapRims = new Map<number, THREE.Mesh>();
  private stormCloud = new THREE.Group();
  private rainGeometry = new THREE.BufferGeometry();
  private stormLight = new THREE.PointLight("#fff0ad", 0, 4);
  private ambientLight = new THREE.HemisphereLight("#fff9ed", "#a4bfaa", 1.9);
  private lightningVisible = false;
  private weatherData?: WeatherState;
  private weatherElapsed = 0;
  private weatherPaused = false;
  private ambient: ((time: number, delta: number) => void)[] = [];
  private effects = new Set<gsap.core.Timeline>();
  private cameraTween?: gsap.core.Timeline;
  private following = false;
  private sceneryEnabled = true;
  private windSpeed = { value: 0.35 };
  private mushroomCap = new THREE.Group();
  private fish = new THREE.Group();
  private previousFrame = performance.now();
  private pointerStart = new THREE.Vector2();
  private pointerDown = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private disposed = false;
  private activeTimeline?: gsap.core.Timeline;
  private settleAnimation?: () => void;
  private onSelect: (id: string) => void;
  private autoRotate = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;

  constructor(
    container: HTMLElement,
    onSelect: (id: string) => void,
    private onExplore: (id: Discovery) => void = () => {},
    private featureLayout: readonly FeatureTile[] = FEATURE_TILES,
    private onManualCamera: () => void = () => {},
  ) {
    this.onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2,
      ),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可交互的胡萝卜山三维棋盘",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(9, 22, 24);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.8, 0.5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.16;
    this.controls.minZoom = 0.7;
    this.controls.maxZoom = 2.4;
    this.controls.addEventListener("start", this.cancelCameraTween);
    this.controls.autoRotateSpeed = 0.5;
    this.controls.update();
    this.controls.saveState();

    this.scene.add(this.ambientLight);
    const key = new THREE.DirectionalLight("#fff7df", 2.8);
    key.position.set(-9, 21, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -14,
      right: 14,
      top: 14,
      bottom: -14,
      near: 0.5,
      far: 55,
    });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 5;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#e9f4ff", 1.3);
    fill.position.set(7, 8, -9);
    this.scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: "#527361", opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.scene.add(floor, this.board, this.preview);
    this.createContactShadow();
    this.createMeadow();
    this.createTerrain();
    this.createPath();
    this.createFeatureProps();
    this.createWeather();
    this.createCarrot();
    this.createGarden();
    this.createSign();
    this.createStarPickups();
    this.highlight = new THREE.Mesh(
      new THREE.TorusGeometry(0.39, 0.028, 8, 48),
      new THREE.MeshBasicMaterial({
        color: PREVIEW_GREEN,
        toneMapped: false,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.highlight.rotation.x = Math.PI / 2;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const aspect = width / Math.max(height, 1);
      const viewHeight = Math.max(18.2, 24 / aspect);
      this.camera.left = (-viewHeight * aspect) / 2;
      this.camera.right = (viewHeight * aspect) / 2;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.renderer.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );
    this.renderer.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.renderer.domElement.addEventListener("wheel", this.useManualCamera, {
      passive: true,
    });
    this.render();
  }

  private createContactShadow() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 20, 64, 64, 64);
    gradient.addColorStop(0, "rgba(48,80,49,0.3)");
    gradient.addColorStop(0.65, "rgba(48,80,49,0.15)");
    gradient.addColorStop(1, "rgba(48,80,49,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 26),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.18;
    this.scene.add(shadow);
  }

  private createMeadow() {
    const meadow = cylinder(
      this.board,
      "#bed4a0",
      10.8,
      10.55,
      0.18,
      [0, -0.065, 0],
    );
    meadow.scale.z = 0.97;
    const edging = cylinder(
      this.board,
      "#8fa987",
      10.58,
      10.48,
      0.09,
      [0, -0.14, 0],
    );
    edging.scale.z = 0.97;

    const trees = [
      [-9.1, -3.8],
      [-8.6, -5.4],
      [-7.7, -6.9],
      [-2.6, -9.3],
      [-1, -9.7],
      [0.6, -9.6],
      [3.1, -9.0],
      [5.8, -8.0],
      [8.7, -5.1],
      [9.5, -3.1],
      [-9.5, 2.5],
      [-8.9, 4.8],
    ];
    trees.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0.04, z);
      cylinder(tree, "#9c8069", 0.1, 0.15, 0.7, [0, 0.35, 0]);
      if (i % 3 === 0) {
        ellipsoid(tree, "#e3a8b7", [0, 1.05, 0], [0.54, 0.63, 0.48]);
        ellipsoid(tree, "#f0c4cb", [0.24, 1.27, 0.08], [0.38, 0.43, 0.35]);
      } else {
        for (let n = 0; n < 3; n++) {
          const foliage = new THREE.Mesh(
            new THREE.ConeGeometry(0.62 - n * 0.13, 0.85, 10),
            plastic(i % 2 ? "#6b9b64" : "#90af70"),
          );
          foliage.position.y = 0.74 + n * 0.34;
          foliage.castShadow = true;
          tree.add(foliage);
        }
      }
      this.board.add(tree);
    });

    const camp = new THREE.Group();
    camp.position.set(6.7, 0.04, 7);
    cylinder(camp, "#f5e8d2", 0.25, 0.35, 0.8, [0, 0.4, 0]);
    this.mushroomCap.position.y = 0.95;
    ellipsoid(this.mushroomCap, "#dc7e85", [0, 0, 0], [0.85, 0.44, 0.8]);
    [
      [-0.3, 0.2],
      [0.32, 0.15],
      [0, -0.4],
      [0.15, 0.48],
    ].forEach(([x, z]) => {
      ellipsoid(this.mushroomCap, "#fff3e2", [x, 0.34, z], [0.12, 0.025, 0.12]);
    });
    camp.add(this.mushroomCap);
    [-1, 1].forEach((side) => {
      cylinder(camp, "#eee6cd", 0.08, 0.12, 0.3, [side * 0.72, 0.15, 0.65]);
      ellipsoid(camp, "#e8b770", [side * 0.72, 0.4, 0.65], [0.34, 0.19, 0.31]);
    });
    this.registerPlace("mushroom", camp, 2.15);

    const pond = new THREE.Group();
    pond.position.set(7.25, 0.04, -0.1);
    ellipsoid(pond, "#8db9b0", [0, 0.035, 0], [0.8, 0.08, 1.6]);
    const water = ellipsoid(pond, "#7fcbd3", [0, 0.07, 0], [0.67, 0.045, 1.42]);
    water.material = plastic("#7fcbd3", 0.16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ellipsoid(
        pond,
        i % 2 ? "#a9baa7" : "#d8ded0",
        [Math.sin(a) * 0.78, 0.12, Math.cos(a) * 1.55],
        [0.14, 0.12, 0.19],
      );
    }
    [-0.72, 0.78].forEach((z) => {
      const pad = cylinder(pond, "#74ad76", 0.22, 0.22, 0.025, [0.12, 0.15, z]);
      pad.scale.z = 0.85;
      ellipsoid(pond, "#f4b9d1", [0.12, 0.21, z], [0.09, 0.07, 0.09]);
    });
    ellipsoid(this.fish, "#f0ac52", [0, 0, 0], [0.12, 0.12, 0.25]);
    ellipsoid(this.fish, "#f2d077", [0, 0, -0.25], [0.19, 0.11, 0.08]);
    ellipsoid(
      this.fish,
      "#435754",
      [0.085, 0.035, 0.15],
      [0.025, 0.025, 0.025],
    );
    this.fish.position.set(0, 0.13, 0);
    pond.add(this.fish);
    this.registerPlace("pond", pond, 1.55);

    const mill = new THREE.Group();
    mill.position.set(-5.7, 0.04, -8);
    cylinder(mill, "#f4ede0", 0.45, 0.62, 1.7, [0, 0.85, 0]);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 0.75, 32),
      plastic("#ca8b9c"),
    );
    roof.position.y = 2.05;
    roof.castShadow = true;
    mill.add(roof);
    roundedBox(mill, "#7298ab", [0.25, 0.4, 0.08], [0, 0.44, 0.58], 0.07);
    const rotor = new THREE.Group();
    rotor.position.set(0, 1.55, 0.62);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Group();
      blade.rotation.z = (i * Math.PI) / 2;
      roundedBox(blade, "#e1d4b7", [0.09, 1.4, 0.08], [0, 0.55, 0], 0.03);
      roundedBox(blade, "#fff8e7", [0.29, 0.85, 0.085], [0.1, 0.78, 0], 0.035);
      rotor.add(blade);
    }
    ellipsoid(rotor, "#d6b374", [0, 0, 0.08], [0.15, 0.15, 0.1]);
    mill.add(rotor);
    this.ambient.push((_, delta) => {
      rotor.rotation.z -= delta * this.windSpeed.value;
    });
    this.registerPlace("windmill", mill, 3.25);

    const flowers: { x: number; z: number; color: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const radius = 9.6 + Math.sin(i * 2.7) * 0.35;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.97;
      if (PATH.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.7)) continue;
      flowers.push({ x, z, color: i % 3 });
    }
    // Batch repeated flowers so the larger garden stays light on tablet GPUs.
    const flowerGeometry = new THREE.SphereGeometry(1, 12, 8);
    const petals = ["#f1b5c5", "#fff3d5", "#beb0df"].map(
      (color) =>
        new THREE.InstancedMesh(
          flowerGeometry,
          plastic(color),
          flowers.length * 5,
        ),
    );
    const stems = new THREE.InstancedMesh(
      flowerGeometry,
      plastic("#83a362"),
      flowers.length,
    );
    const centers = new THREE.InstancedMesh(
      flowerGeometry,
      plastic("#e2b45f"),
      flowers.length,
    );
    const counts = [0, 0, 0];
    const transform = new THREE.Object3D();
    flowers.forEach(({ x, z, color }, i) => {
      transform.position.set(x, 0.16, z);
      transform.scale.set(0.025, 0.11, 0.025);
      transform.updateMatrix();
      stems.setMatrixAt(i, transform.matrix);
      transform.position.y = 0.365;
      transform.scale.set(0.06, 0.04, 0.06);
      transform.updateMatrix();
      centers.setMatrixAt(i, transform.matrix);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        transform.position.set(
          x + Math.sin(a) * 0.11,
          0.335,
          z + Math.cos(a) * 0.11,
        );
        transform.scale.set(0.1, 0.04, 0.1);
        transform.updateMatrix();
        petals[color].setMatrixAt(counts[color]++, transform.matrix);
      }
    });
    petals.forEach((mesh, i) => {
      mesh.count = counts[i];
    });
    [...petals, stems, centers].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      this.board.add(mesh);
    });
  }

  private registerPlace(id: Discovery, group: THREE.Group, height: number) {
    group.userData.discovery = id;
    this.places.set(id, group);
    const pin = new THREE.Mesh(starGeometry, plastic("#f2c655"));
    pin.scale.setScalar(0.24);
    pin.position.y = height;
    pin.rotation.y = 0.35;
    group.add(pin);
    this.discoveryPins.set(id, pin);
    this.ambient.push((time) => {
      pin.position.y = height + Math.sin(time * 2) * 0.09;
    });
    this.board.add(group);
  }

  private createStarPickups() {
    STAR_TILES.forEach((index, i) => {
      const star = new THREE.Mesh(starGeometry, plastic("#eebd48"));
      star.scale.setScalar(0.19);
      const position = pathPoint(index);
      star.position.copy(position).add(new THREE.Vector3(0, 0.43, 0));
      star.castShadow = true;
      this.starPickups.set(index, star);
      this.board.add(star);
      this.ambient.push((time) => {
        star.position.y = position.y + 0.43 + Math.sin(time * 2 + i) * 0.07;
        star.rotation.y = time * 0.65 + i;
      });
    });
  }

  private updateStars(G: RabbitState) {
    this.starPickups.forEach((star, index) => {
      star.visible = !G.collected.includes(index);
    });
  }

  setDiscoveries(discoveries: Discovery[]) {
    this.discoveryPins.forEach((pin, id) => {
      pin.visible = !discoveries.includes(id);
    });
  }

  setSceneryEnabled(value: boolean) {
    this.sceneryEnabled = value;
  }

  explore(id: Discovery) {
    if (!this.sceneryEnabled || !this.places.has(id)) return;
    const place = this.places.get(id)!;
    playSound("collect");
    this.onExplore(id);
    if (this.following) this.focusAt(place.position);
    if (this.reducedMotion) return;
    this.burst(place.position.clone().add(new THREE.Vector3(0, 1.15, 0)));
    if (id === "mushroom") {
      gsap.killTweensOf(this.mushroomCap.position);
      const tl = gsap.timeline({ onComplete: () => this.effects.delete(tl) });
      tl.to(this.mushroomCap.position, {
        y: 1.7,
        duration: 0.24,
        ease: "power2.out",
      }).to(this.mushroomCap.position, {
        y: 0.95,
        duration: 0.6,
        ease: "bounce.out",
      });
      this.effects.add(tl);
    } else if (id === "windmill") {
      gsap.killTweensOf(this.windSpeed);
      const tl = gsap.timeline({ onComplete: () => this.effects.delete(tl) });
      tl.to(this.windSpeed, { value: 7, duration: 0.25 }).to(this.windSpeed, {
        value: 0.35,
        duration: 3,
      });
      this.effects.add(tl);
    } else {
      gsap.killTweensOf(this.fish.position);
      const tl = gsap.timeline({ onComplete: () => this.effects.delete(tl) });
      tl.to(this.fish.position, {
        y: 1.15,
        duration: 0.4,
        ease: "power2.out",
      }).to(this.fish.position, { y: 0.13, duration: 0.4, ease: "power2.in" });
      this.effects.add(tl);
      for (let i = 0; i < 3; i++) {
        const ripple = new THREE.Mesh(
          new THREE.TorusGeometry(0.26, 0.02, 6, 36),
          new THREE.MeshBasicMaterial({
            color: "#efffff",
            transparent: true,
            opacity: 0.8,
          }),
        );
        ripple.rotation.x = -Math.PI / 2;
        ripple.position.set(0, 0.17, 0);
        place.add(ripple);
        const animation = gsap.timeline({
          delay: i * 0.18,
          onComplete: () => {
            place.remove(ripple);
            ripple.geometry.dispose();
            (ripple.material as THREE.Material).dispose();
            this.effects.delete(animation);
          },
        });
        animation.to(ripple.scale, { x: 2.3, y: 4, duration: 1.2 });
        animation.to(ripple.material, { opacity: 0, duration: 1.2 }, 0);
        this.effects.add(animation);
      }
    }
  }

  private burst(origin: THREE.Vector3) {
    if (this.reducedMotion) return;
    const group = new THREE.Group();
    group.position.copy(origin);
    this.scene.add(group);
    const tl = gsap.timeline({
      onComplete: () => {
        group.children.forEach((child) =>
          ((child as THREE.Mesh).material as THREE.Material).dispose(),
        );
        this.scene.remove(group);
        this.effects.delete(tl);
      },
    });
    for (let i = 0; i < 7; i++) {
      const star = new THREE.Mesh(
        starGeometry,
        new THREE.MeshBasicMaterial({
          color: ["#edba43", "#e793ad", "#80b9d4"][i % 3],
          transparent: true,
        }),
      );
      star.scale.setScalar(0.09 + (i % 2) * 0.04);
      group.add(star);
      const angle = (i / 7) * Math.PI * 2;
      tl.to(
        star.position,
        {
          x: Math.sin(angle) * 0.8,
          z: Math.cos(angle) * 0.8,
          y: 0.6 + (i % 3) * 0.24,
          duration: 0.75,
          ease: "power2.out",
        },
        0,
      );
      tl.to(star.material, { opacity: 0, duration: 0.45 }, 0.45);
    }
    this.effects.add(tl);
  }

  private createTerrain() {
    const radialSegments = 150;
    const rings = 75;
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let s = 0; s <= radialSegments; s++) {
        const angle = (s / radialSegments) * Math.PI * 2;
        const radius = boundaryRadius(angle);
        const x = Math.cos(angle) * radius * t;
        const z = Math.sin(angle) * radius * t * 0.95;
        const y = heightAt(x, z);
        vertices.push(x, y, z);
        const variation = 0.025 * Math.sin(x * 2.2) * Math.cos(z * 1.6);
        color
          .setHSL(
            0.285 + variation * 0.5,
            0.52,
            0.37 + variation + 0.035 * (1 - t),
          )
          .convertSRGBToLinear();
        colors.push(color.r, color.g, color.b);
        if (r < rings && s < radialSegments) {
          const a = r * (radialSegments + 1) + s;
          const b = a + radialSegments + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.48,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide,
    });
    // Cut the six mechanical sockets out of the hill; the animated lids close them.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 vTerrainPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTerrainPosition = position;",
      );
      shader.fragmentShader =
        "varying vec3 vTerrainPosition;\n" + shader.fragmentShader;
      const holes = TRAPS.map((index) => {
        const [x, z] = PATH[index];
        return `if (distance(vTerrainPosition.xz, vec2(${x.toFixed(3)}, ${z.toFixed(3)})) < 0.435) discard;`;
      }).join("\n");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>\n${holes}`,
      );
    };
    const terrain = new THREE.Mesh(geometry, material);
    terrain.castShadow = true;
    terrain.receiveShadow = true;
    this.board.add(terrain);
  }

  private createPath() {
    PATH.forEach(([x, z], i) => {
      const y = rawHeight(x, z);
      const isTrap = TRAPS.includes(i);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.49, 0.055, 10, 40),
        plastic(isTrap ? "#3c753b" : "#6c943e"),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, y + 0.035, z);
      rim.receiveShadow = true;
      if (isTrap) {
        rim.material = plastic("#3c753b").clone();
        rim.material.emissiveIntensity = 0;
        this.trapRims.set(i, rim);
      }
      this.board.add(rim);
      if (isTrap) {
        const wall = new THREE.Mesh(
          new THREE.CylinderGeometry(0.44, 0.39, 0.85, 40, 1, true),
          new THREE.MeshStandardMaterial({
            color: "#234931",
            side: THREE.DoubleSide,
            roughness: 0.8,
          }),
        );
        wall.position.set(x, y - 0.39, z);
        this.board.add(wall);
        cylinder(this.board, "#183a28", 0.395, 0.395, 0.025, [x, y - 0.82, z]);
      }
      const tile = new THREE.Group();
      tile.position.set(x, y + 0.055, z);
      this.board.add(tile);
      if (BRIDGES.includes(i)) {
        for (let p = 0; p < 4; p++)
          roundedBox(
            tile,
            p % 2 ? "#b88b5b" : "#cda370",
            [0.21, 0.105, 0.88],
            [(p - 1.5) * 0.23, 0, 0],
            0.035,
          );
        [-0.32, 0.32].forEach((p) =>
          roundedBox(tile, "#79583d", [0.98, 0.07, 0.09], [0, -0.06, p], 0.02),
        );
        [-0.34, 0.34].forEach((px) =>
          [-0.32, 0.32].forEach((pz) =>
            ellipsoid(tile, "#8b6746", [px, 0.065, pz], [0.022, 0.013, 0.022]),
          ),
        );
        tile.children.forEach((child) => {
          child.position.z += 0.44;
        });
        tile.position.z -= 0.44;
      } else {
        cylinder(
          tile,
          featureAt(i, this.featureLayout)
            ? FEATURE_INFO[featureAt(i, this.featureLayout)!].fill
            : i < GROUND_COUNT
              ? "#fff0bc"
              : i % 3 === 0
                ? "#f2d88c"
                : "#f4dfa1",
          0.43,
          0.45,
          0.1,
          [0, 0, 0],
        );
        const inner = new THREE.Mesh(
          new THREE.TorusGeometry(0.365, 0.009, 5, 40),
          plastic("#d5bb77"),
        );
        inner.rotation.x = Math.PI / 2;
        inner.position.y = 0.056;
        tile.add(inner);
        const number = new THREE.Mesh(
          new THREE.PlaneGeometry(0.42, 0.21),
          new THREE.MeshBasicMaterial({
            map: labelTexture(String(i + 1).padStart(2, "0"), "#9e8b58"),
            transparent: true,
            depthWrite: false,
            opacity: 0.75,
          }),
        );
        number.rotation.x = -Math.PI / 2;
        number.position.y = 0.059;
        const kind = featureAt(i, this.featureLayout);
        if (kind) {
          number.scale.setScalar(0.65);
          number.position.z = -0.22;
          const symbol = new THREE.Mesh(
            new THREE.PlaneGeometry(0.62, 0.34),
            new THREE.MeshBasicMaterial({
              map: labelTexture(
                FEATURE_INFO[kind].glyph,
                FEATURE_INFO[kind].color,
              ),
              transparent: true,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          symbol.rotation.x = -Math.PI / 2;
          symbol.position.set(0, 0.061, 0.065);
          tile.add(symbol);
        }
        tile.add(number);
      }
      if (isTrap) this.lids.set(i, tile);
    });
  }

  private createFeatureProps() {
    this.featureLayout.forEach(({ index, kind }) => {
      const group = new THREE.Group();
      group.position.copy(pathPoint(index));
      group.scale.setScalar(kind === "slide" ? 1.05 : 1.1);
      if (kind === "spring") {
        cylinder(group, "#79a659", 0.33, 0.36, 0.07, [0, 0.04, 0]);
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.035, 8, 24),
            plastic("#9ba7aa", 0.22),
          );
          coil.rotation.x = Math.PI / 2;
          coil.position.y = 0.12 + i * 0.09;
          group.add(coil);
        }
        cylinder(group, "#bfdb79", 0.33, 0.33, 0.08, [0, 0.47, 0]);
      } else if (kind === "wind") {
        cylinder(group, "#c79965", 0.035, 0.05, 0.48, [0, 0.24, 0]);
        const rotor = new THREE.Group();
        rotor.position.y = 0.48;
        for (let n = 0; n < 4; n++) {
          const blade = roundedBox(
            rotor,
            n % 2 ? "#f0c181" : "#fff1d0",
            [0.15, 0.4, 0.06],
            [0, 0, 0],
            0.035,
          );
          blade.position.set(
            Math.sin((n * Math.PI) / 2) * 0.14,
            Math.cos((n * Math.PI) / 2) * 0.14,
            0,
          );
          blade.rotation.z = (-n * Math.PI) / 2;
        }
        ellipsoid(rotor, "#b8884f", [0, 0, 0.035], [0.06, 0.06, 0.04]);
        group.add(rotor);
        this.ambient.push((_, delta) => {
          rotor.rotation.z -= delta * this.windSpeed.value * 2;
        });
      } else if (kind === "slide") {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.64, -0.16),
          new THREE.Vector3(0, 0.6, 0.04),
          new THREE.Vector3(0, 0.24, 0.28),
          new THREE.Vector3(0, 0.09, 0.5),
        ]);
        const positions: number[] = [];
        const indices: number[] = [];
        for (let n = 0; n <= 16; n++) {
          const point = curve.getPoint(n / 16);
          positions.push(-0.15, point.y, point.z, 0.15, point.y, point.z);
          if (n < 16)
            indices.push(
              n * 2,
              n * 2 + 2,
              n * 2 + 1,
              n * 2 + 1,
              n * 2 + 2,
              n * 2 + 3,
            );
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = plastic("#c897ba").clone();
        material.side = THREE.DoubleSide;
        const slide = new THREE.Mesh(geometry, material);
        slide.castShadow = true;
        group.add(slide);
        [-0.16, 0.16].forEach((side) => {
          const rail = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 16, 0.025, 6, false),
            plastic("#ebd6e3"),
          );
          rail.position.x = side;
          group.add(rail);
        });
        cylinder(group, "#9c7d9b", 0.025, 0.03, 0.6, [0, 0.3, -0.14]);
      } else {
        cylinder(group, "#79b5c1", 0.27, 0.29, 0.07, [0, 0.04, 0]);
        const bubble = ellipsoid(
          group,
          "#a8e2ed",
          [0, 0.36, 0],
          [0.29, 0.3, 0.29],
        );
        bubble.material = new THREE.MeshPhysicalMaterial({
          color: "#91d4e5",
          roughness: 0.1,
          clearcoat: 1,
          transparent: true,
          opacity: 0.65,
        });
        this.ambient.push((time) => {
          bubble.position.y = 0.36 + Math.sin(time * 2) * 0.05;
        });
      }
      if (kind === "slide")
        group.children.forEach((child) => {
          child.position.z -= 0.17;
        });
      this.featureProps.set(index, group);
      this.board.add(group);
    });
  }

  private updateFeatureOccupancy(G: RabbitState) {
    const occupied = new Set(
      G.tokens
        .filter((token) => token.position >= 0)
        .map((token) => token.position),
    );
    this.featureProps.forEach((prop, index) => {
      prop.visible = !occupied.has(index);
    });
  }

  private createWeather() {
    [
      [-0.52, 0, 0, 0.48],
      [0, 0.15, 0, 0.57],
      [0.55, 0, 0, 0.45],
      [-0.18, -0.12, 0.2, 0.45],
      [0.33, -0.1, 0.17, 0.4],
    ].forEach(([x, y, z, radius]) => {
      ellipsoid(
        this.stormCloud,
        "#9cabb3",
        [x, y, z],
        [radius, radius * 0.58, radius * 0.67],
      );
    });
    const rain: number[] = [];
    for (let i = 0; i < 14; i++) {
      const x = Math.sin(i * 2.4) * 0.75;
      const z = Math.cos(i * 2.4) * 0.4;
      const y = -0.4 - (i % 6) * 0.35;
      rain.push(x, y, z, x, y - 0.18, z);
    }
    this.rainGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(rain, 3),
    );
    const rainLines = new THREE.LineSegments(
      this.rainGeometry,
      new THREE.LineBasicMaterial({
        color: "#84aabc",
        transparent: true,
        opacity: 0.48,
      }),
    );
    rainLines.frustumCulled = false;
    this.stormCloud.add(rainLines);
    this.stormLight.position.y = -2.7;
    this.stormCloud.add(this.stormLight);
    this.stormCloud.visible = false;
    this.scene.add(this.stormCloud);
  }

  setWeatherState(weather: WeatherState) {
    const initial = !this.weatherData;
    if (this.weatherData?.revision !== weather.revision)
      this.weatherElapsed = 0;
    this.weatherData = weather;
    this.stormCloud.visible = weather.enabled;
    this.stormCloud.scale.setScalar(1);
    if (initial) {
      const [x, z] = cloudPosition(weather);
      this.stormCloud.position.set(x, heightAt(x, z) + 3.4, z);
    }
    this.ambientLight.intensity = weather.enabled ? 1.8 : 1.9;
  }

  setWeatherPaused(value: boolean) {
    if (value !== this.weatherPaused) this.previousFrame = performance.now();
    this.weatherPaused = value;
  }

  async animateLightning(event: WeatherStrike, G: RabbitState) {
    if (this.disposed) return;
    const [x, z] = event.point;
    const origin = new THREE.Vector3(x, heightAt(x, z) + 0.14, z);
    if (this.following) this.focusAt(origin);
    const start = this.stormCloud.position
      .clone()
      .add(new THREE.Vector3(0, -0.2, 0));
    const firstRabbit = event.hits.length
      ? this.rabbits.get(event.hits[0])
      : undefined;
    const end = firstRabbit
      ? firstRabbit.position
          .clone()
          .add(new THREE.Vector3(0, 1.15 * firstRabbit.scale.y, 0))
      : origin;
    const points = [
      start,
      start
        .clone()
        .lerp(end, 0.3)
        .add(new THREE.Vector3(-0.24, 0, 0)),
      start
        .clone()
        .lerp(end, 0.4)
        .add(new THREE.Vector3(0.18, 0, 0)),
      start
        .clone()
        .lerp(end, 0.7)
        .add(new THREE.Vector3(-0.1, 0, 0)),
      end,
    ];
    const curve = new THREE.CurvePath<THREE.Vector3>();
    points
      .slice(1)
      .forEach((point, i) => curve.add(new THREE.LineCurve3(points[i], point)));
    const bolt = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.037, 6, false),
      new THREE.MeshBasicMaterial({
        color: "#ffeb96",
        transparent: true,
        opacity: 0,
        depthTest: true,
        toneMapped: false,
      }),
    );
    this.scene.add(bolt);
    try {
      await this.timeline((tl) => {
        tl.call(() => {
          this.lightningVisible = true;
          playSound("thunder");
          this.pulseRing(origin, "#e1b24c", 2.5);
          event.hits.forEach((id) => {
            const token = G.tokens.find((token) => token.id === id)!;
            const halo = this.rabbits.get(id)?.getObjectByName("stun-halo");
            if (halo) halo.visible = isStunned(G, token);
          });
          if (!event.hits.length) this.floatingText(origin, "空地", "#ae7e31");
          else if (event.hits.every((id) => event.blocked.includes(id))) {
            const token = G.tokens.find(
              (token) => token.id === event.blocked[0],
            )!;
            this.triggerTileEffect({
              kind: "blocked",
              token: token.id,
              from: token.position,
              to: token.position,
              route: [],
            });
          } else this.floatingText(origin, "晕1回合", "#ae7e31");
        });
        tl.to(bolt.material, { opacity: 1, duration: 0.05 });
        if (!this.reducedMotion)
          tl.to(this.stormLight, { intensity: 5, duration: 0.05 }, "<");
        tl.to(bolt.material, { opacity: 0, duration: 0.3 });
        tl.to(this.stormLight, { intensity: 0, duration: 0.3 }, "<");
        tl.call(() => {
          this.lightningVisible = false;
        });
        tl.to({}, { duration: 0.3 });
      });
    } finally {
      this.lightningVisible = false;
      this.stormLight.intensity = 0;
      this.scene.remove(bolt);
      bolt.geometry.dispose();
      (bolt.material as THREE.Material).dispose();
      if (!this.disposed) this.updateEquipment(G);
    }
  }

  private pulseRing(origin: THREE.Vector3, color: string, expansion = 2.2) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.43, 0.026, 6, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(origin).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(ring);
    const tl = gsap.timeline({
      onComplete: () => {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        this.effects.delete(tl);
      },
    });
    tl.to(ring.scale, {
      x: expansion,
      y: expansion,
      z: expansion,
      duration: this.reducedMotion ? 0.1 : 0.8,
      ease: "power2.out",
    });
    tl.to(ring.material, { opacity: 0, duration: 0.6 }, 0.2);
    this.effects.add(tl);
  }

  private floatingText(origin: THREE.Vector3, text: string, color: string) {
    const texture = labelTexture(text, color);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        toneMapped: false,
      }),
    );
    sprite.position.copy(origin).add(new THREE.Vector3(0, 1.55, 0));
    sprite.scale.set(1.8, 0.9, 1);
    this.scene.add(sprite);
    const tl = gsap.timeline({
      onComplete: () => {
        this.scene.remove(sprite);
        texture.dispose();
        sprite.material.dispose();
        this.effects.delete(tl);
      },
    });
    tl.to(sprite.position, {
      y: sprite.position.y + (this.reducedMotion ? 0 : 0.65),
      duration: 1.2,
      ease: "power2.out",
    });
    tl.to(sprite.material, { opacity: 0, duration: 0.35 }, 0.85);
    this.effects.add(tl);
  }

  private gust(origin: THREE.Vector3) {
    if (this.reducedMotion) return;
    for (let i = 0; i < 3; i++) {
      const wind = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.022, 5, 24, Math.PI * 1.6),
        new THREE.MeshBasicMaterial({
          color: "#f8fcff",
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      wind.position
        .copy(origin)
        .add(new THREE.Vector3(0.5, 0.35 + i * 0.25, i * 0.12));
      wind.quaternion.copy(this.camera.quaternion);
      this.scene.add(wind);
      const tl = gsap.timeline({
        delay: i * 0.1,
        onComplete: () => {
          this.scene.remove(wind);
          wind.geometry.dispose();
          (wind.material as THREE.Material).dispose();
          this.effects.delete(tl);
        },
      });
      tl.to(wind.position, { x: wind.position.x - 1.7, duration: 0.65 });
      tl.to(wind.material, { opacity: 0, duration: 0.65 }, 0);
      this.effects.add(tl);
    }
  }

  private triggerTileEffect(effect: TileEffect) {
    const origin = pathPoint(effect.from);
    const color =
      effect.kind === "blocked"
        ? "#4ba8ba"
        : effect.kind === "pit"
          ? "#d8795f"
          : FEATURE_INFO[effect.kind].color;
    this.pulseRing(origin, color);
    this.floatingText(
      origin,
      effect.kind === "blocked"
        ? "挡住了"
        : effect.kind === "pit"
          ? "掉落"
          : FEATURE_INFO[effect.kind].glyph,
      color,
    );
    if (effect.kind === "spring") {
      playSound("spring");
      const prop = this.featureProps.get(effect.from);
      if (prop && !this.reducedMotion) {
        const scale = prop.scale.x;
        const tl = gsap.timeline({ onComplete: () => this.effects.delete(tl) });
        tl.to(prop.scale, { y: scale * 0.5, duration: 0.12 })
          .to(prop.scale, { y: scale * 1.35, duration: 0.18 })
          .to(prop.scale, {
            y: scale,
            duration: 0.25,
            ease: "elastic.out(1,0.4)",
          });
        this.effects.add(tl);
      }
    } else if (effect.kind === "wind") {
      playSound("wind");
      this.gust(origin);
      const tl = gsap.timeline({ onComplete: () => this.effects.delete(tl) });
      tl.to(this.windSpeed, { value: 6, duration: 0.2 }).to(this.windSpeed, {
        value: 0.35,
        duration: 1.6,
      });
      this.effects.add(tl);
    } else if (effect.kind === "slide") {
      playSound("slide");
    } else if (effect.kind === "shield" || effect.kind === "blocked") {
      playSound("collect");
      this.burst(origin.clone().add(new THREE.Vector3(0, 0.8, 0)));
      const bubble = this.rabbits
        .get(effect.token)!
        .getObjectByName("bubble-shield") as THREE.Mesh;
      bubble.visible = true;
      const material = bubble.material as THREE.MeshPhysicalMaterial;
      const tl = gsap.timeline({
        onComplete: () => {
          if (effect.kind === "blocked") bubble.visible = false;
          this.effects.delete(tl);
        },
      });
      tl.fromTo(
        material,
        { opacity: 0.5 },
        { opacity: effect.kind === "blocked" ? 0 : 0.22, duration: 0.6 },
      );
      this.effects.add(tl);
    }
  }

  private mechanismEffect() {
    playSound("mechanism");
    this.pulseRing(
      new THREE.Vector3(0, rawHeight(0, 0) + 0.18, 0),
      "#eda558",
      9,
    );
    if (this.following) this.focusAt(this.carrot.position);
    const material = this.carrotBody!.material as THREE.MeshPhysicalMaterial;
    material.emissive.set("#df8a3f");
    const tl = gsap.timeline({ onComplete: () => this.effects.delete(tl) });
    tl.to(material, { emissiveIntensity: 0.45, duration: 0.25 }).to(material, {
      emissiveIntensity: 0,
      duration: 0.65,
    });
    this.trapRims.forEach((rim, index) => {
      const mat = rim.material as THREE.MeshPhysicalMaterial;
      mat.emissive.set(
        this.currentState!.holes.includes(index) ? "#df765b" : "#78a947",
      );
      tl.to(mat, { emissiveIntensity: 0.65, duration: 0.2 }, 0.35).to(
        mat,
        { emissiveIntensity: 0, duration: 0.65 },
        0.6,
      );
    });
    this.effects.add(tl);
  }

  private updateEquipment(G: RabbitState) {
    G.tokens.forEach((token) => {
      const bubble = this.rabbits
        .get(token.id)
        ?.getObjectByName("bubble-shield");
      if (bubble)
        bubble.visible = Boolean(token.shield) && token.position >= -1;
      const halo = this.rabbits.get(token.id)?.getObjectByName("stun-halo");
      if (halo) halo.visible = isStunned(G, token);
    });
  }

  private createCarrot() {
    const base = rawHeight(0, 0);
    cylinder(this.board, "#3e7139", 1.12, 1.18, 0.16, [0, base + 0.025, 0]);
    cylinder(this.board, "#75a64e", 1.04, 1.1, 0.12, [0, base + 0.13, 0]);
    this.carrot.position.set(0, base + 0.15, 0);
    this.board.add(this.carrot);
    const profile = [
      [0, 0],
      [0.53, 0],
      [0.7, 0.06],
      [0.84, 0.28],
      [0.88, 0.65],
      [0.82, 1.1],
      [0.81, 1.48],
      [0.8, 1.65],
      [0.7, 1.72],
      [0, 1.72],
    ];
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(
        profile.map((p) => new THREE.Vector2(...(p as [number, number]))),
        64,
      ),
      plastic("#f58b3c", 0.31),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.material = plastic("#f58b3c", 0.31).clone();
    body.material.emissiveIntensity = 0;
    this.carrotBody = body;
    this.carrot.add(body);
    for (let i = 0; i < 6; i++) {
      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.86 - i * 0.028,
          0.016,
          8,
          32,
          0.5 + (i % 2) * 0.4,
        ),
        plastic("#d46c2b"),
      );
      groove.rotation.x = Math.PI / 2;
      groove.rotation.z = i * 2.2;
      groove.position.y = 0.45 + i * 0.18;
      this.carrot.add(groove);
    }
    cylinder(this.carrot, "#345e3d", 0.68, 0.71, 0.1, [0, 1.73, 0]);
    cylinder(this.carrot, "#d1e69c", 0.55, 0.57, 0.08, [
      0,
      THRONE_SEAT_HEIGHT - 0.04,
      0,
    ]);
    const seatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.625, 0.07, 12, 48),
      plastic("#689743"),
    );
    seatRim.rotation.x = Math.PI / 2;
    seatRim.position.y = 1.77;
    seatRim.castShadow = true;
    this.carrot.add(seatRim);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(Math.sin(angle) * 0.74, 1.63, Math.cos(angle) * 0.74);
      holder.rotation.y = angle;
      holder.rotation.x = 0.5;
      leaf(
        holder,
        ["#4e8b39", "#70a746", "#3e7731"][i % 3],
        0.5 + 0.24 * Math.max(0, -Math.cos(angle)),
        0.19,
      );
      this.carrot.add(holder);
    }
  }

  private createGarden() {
    const clumps = [
      [-4.7, -2.5],
      [-2.2, -4.5],
      [1.6, -4.8],
      [4.5, -2.6],
      [5.25, 1.6],
      [3.2, 4.3],
      [-1.8, 3.1],
      [-4.65, 1.2],
      [0.1, -2.75],
      [3.05, 0.0],
      [-2.0, -0.5],
    ];
    clumps.forEach(([x, z], index) => {
      const clump = new THREE.Group();
      clump.position.set(x, heightAt(x, z), z);
      for (let i = 0; i < 5; i++) {
        const blade = leaf(
          clump,
          ["#7da447", "#598a40", "#a3bb5e"][(i + index) % 3],
          0.3 + (i % 3) * 0.13,
          0.07,
        );
        blade.rotation.y = i * 2.4;
        blade.rotation.z = Math.sin(i * 2.4) * 0.5;
      }
      this.board.add(clump);
    });
    const flowers = [
      [-4.35, -3.35],
      [-4.8, -0.2],
      [-2.8, 2.7],
      [2.6, 4.5],
      [5.2, 0.15],
      [3.25, -3.9],
      [-0.4, -4.8],
      [1.1, 2.9],
    ];
    flowers.forEach(([x, z], index) => {
      const flower = new THREE.Group();
      flower.position.set(x, heightAt(x, z), z);
      cylinder(flower, "#5c853e", 0.025, 0.025, 0.24, [0, 0.12, 0]);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        ellipsoid(
          flower,
          index % 3 === 0 ? "#f5bdc0" : "#fff6dc",
          [Math.cos(angle) * 0.12, 0.28, Math.sin(angle) * 0.12],
          [0.105, 0.038, 0.105],
        );
      }
      ellipsoid(flower, "#ebbd54", [0, 0.31, 0], [0.065, 0.04, 0.065]);
      this.board.add(flower);
    });
    [
      [-5.0, -1.8],
      [4.25, 3.4],
      [-2.8, -4.5],
    ].forEach(([x, z], i) => {
      const mushroom = new THREE.Group();
      mushroom.position.set(x, heightAt(x, z), z);
      cylinder(mushroom, "#f7edce", 0.07, 0.095, 0.22, [0, 0.11, 0]);
      ellipsoid(
        mushroom,
        i === 1 ? "#e4ba62" : "#d98c78",
        [0, 0.28, 0],
        [0.25, 0.15, 0.25],
      );
      [
        [-0.1, 0.07],
        [0.09, 0.07],
        [0, -0.1],
      ].forEach(([dx, dz]) =>
        ellipsoid(mushroom, "#fff3d8", [dx, 0.412, dz], [0.04, 0.012, 0.04]),
      );
      this.board.add(mushroom);
    });
    [
      [-5.4, 0.3],
      [5.05, -1.4],
      [0.2, 5.05],
      [-3.5, -3.85],
    ].forEach(([x, z], i) => {
      const rock = ellipsoid(
        this.board,
        i % 2 ? "#77966a" : "#97aa7e",
        [x, heightAt(x, z) + 0.08, z],
        [0.3, 0.2, 0.23],
      );
      rock.rotation.y = i;
    });
    for (let i = 0; i < 4; i++) {
      roundedBox(
        this.board,
        "#73a354",
        [1.18, 0.16, 0.32],
        [-5.5 - i * 0.06, 0.57 - i * 0.12, 3.1 + i * 0.29],
        0.065,
      );
    }
  }

  private createSign() {
    const sign = new THREE.Group();
    sign.position.set(-5.8, 0.12, 7.4);
    sign.rotation.y = 0.22;
    cylinder(sign, "#a98151", 0.05, 0.05, 0.65, [0, 0.325, 0]);
    roundedBox(sign, "#f6e6bc", [0.88, 0.34, 0.1], [0, 0.68, 0], 0.04);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.31),
      new THREE.MeshBasicMaterial({
        map: labelTexture("START", "#697942"),
        transparent: true,
      }),
    );
    face.position.set(0, 0.68, 0.056);
    sign.add(face);
    this.board.add(sign);
  }

  private tokenLayout(token: Token, G: RabbitState, count: number) {
    if (token.id === this.winnerId || token.position >= FINISH)
      return { point: pathPoint(FINISH), scale: 1 };
    if (token.position < 0)
      return {
        point: new THREE.Vector3(
          (token.player - (count - 1) / 2) * 2.5 + (token.index - 1) * 0.7,
          0.13,
          10.2,
        ),
        scale: 1,
      };
    const point = pathPoint(token.position);
    const occupants = G.tokens.filter(
      (t) => t.position === token.position && t.id !== this.winnerId,
    );
    if (occupants.length <= 1) return { point, scale: 1 };
    // Fan out visually inside one tile without changing any logical position.
    const columns = Math.ceil(Math.sqrt(occupants.length));
    const rows = Math.ceil(occupants.length / columns);
    const slot = occupants.findIndex((t) => t.id === token.id);
    const row = Math.floor(slot / columns);
    const rowSize = Math.min(columns, occupants.length - row * columns);
    const scale = Math.min(0.66, 1.25 / Math.max(columns, rows));
    const offset = new THREE.Vector3(
      ((slot % columns) - (rowSize - 1) / 2) * 0.7 * scale,
      0,
      (row - (rows - 1) / 2) * 0.7 * scale,
    ).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
    return { point: point.add(offset), scale };
  }

  async sync(G: RabbitState, numPlayers: number, gameover?: Gameover) {
    if (this.disposed) return;
    const initial = !this.currentState;
    this.currentState = G;
    this.winnerId =
      gameover?.winner === undefined
        ? undefined
        : G.tokens
            .filter(
              (t) => t.player === Number(gameover.winner) && t.position >= -1,
            )
            .sort((a, b) => b.position - a.position)[0]?.id;
    if (initial) {
      for (let p = 0; p < numPlayers; p++) {
        const pad = roundedBox(
          this.board,
          new THREE.Color(COLORS[p])
            .lerp(new THREE.Color("#ffffff"), 0.58)
            .getStyle(),
          [2.2, 0.12, 0.88],
          [(p - (numPlayers - 1) / 2) * 2.5, 0.06, 10.2],
          0.06,
        );
        pad.receiveShadow = true;
      }
      G.tokens.forEach((token) => {
        const rabbit = makeRabbit(COLORS[token.player], token.index + 1);
        rabbit.userData.tokenId = token.id;
        const layout = this.tokenLayout(token, G, numPlayers);
        rabbit.position.copy(layout.point);
        rabbit.scale.setScalar(layout.scale);
        if (token.id === this.winnerId) rabbit.scale.set(1.04, 0.92, 1.04);
        rabbit.rotation.y = 0.35;
        rabbit.visible = token.position >= -1;
        this.rabbits.set(token.id, rabbit);
        this.board.add(rabbit);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.4, 0.023, 8, 48),
          new THREE.MeshBasicMaterial({
            color: PREVIEW_GREEN,
            toneMapped: false,
            transparent: true,
            opacity: 0.9,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.visible = false;
        this.selectionRings.set(token.id, ring);
        this.board.add(ring);
      });
      this.lids.forEach((lid, index) => {
        const isBridge = BRIDGES.includes(index);
        lid.scale.setScalar(!isBridge && G.holes.includes(index) ? 0.001 : 1);
        if (isBridge)
          lid.rotation.x = G.holes.includes(index) ? -Math.PI / 2 : 0;
        lid.position.y = rawHeight(...PATH[index]) + 0.055;
      });
      this.carrot.rotation.y = this.winnerId ? 0 : (G.mechanism * Math.PI) / 2;
      this.updateStars(G);
      this.updateEquipment(G);
      this.updateFeatureOccupancy(G);
      this.setWeatherState(G.weather);
      this.setDiscoveries(G.discoveries);
      return;
    }
    if (G.action.kind === "draw") {
      playSound("draw");
      await this.timeline((tl) => {
        tl.to({}, { duration: this.reducedMotion ? 0.05 : 0.48 });
      });
    } else if (G.action.kind === "move") {
      const rabbit = this.rabbits.get(G.action.token!)!;
      const token = G.tokens.find((t) => t.id === G.action.token)!;
      const layout = this.tokenLayout(token, G, numPlayers);
      const tileEffects = G.action.effects ?? [];
      const hasExtraMovement = tileEffects.some(
        (effect) => effect.route.length > 0,
      );
      if (this.following)
        this.focusAt(
          hasExtraMovement
            ? pathPoint(G.action.route![G.action.route!.length - 1])
            : layout.point,
        );
      await this.timeline((tl) => {
        G.tokens
          .filter(
            (t) =>
              t.id !== token.id && t.id !== this.winnerId && t.position >= 0,
          )
          .forEach((other) => {
            const mesh = this.rabbits.get(other.id)!;
            const target = this.tokenLayout(other, G, numPlayers);
            tl.to(mesh.position, { ...target.point, duration: 0.25 }, 0);
            tl.to(
              mesh.scale,
              {
                x: target.scale,
                y: target.scale,
                z: target.scale,
                duration: 0.25,
              },
              0,
            );
          });
        const route = G.action.route ?? [];
        route.forEach((index, stepIndex) => {
          const isLanding = stepIndex === route.length - 1;
          const point =
            isLanding && token.position >= 0 && !hasExtraMovement
              ? layout.point
              : pathPoint(index);
          const prop = this.featureProps.get(index);
          if (
            prop?.visible &&
            (!isLanding ||
              (hasExtraMovement &&
                ["spring", "slide"].includes(
                  featureAt(index, this.featureLayout) ?? "",
                )))
          )
            point.y += 0.6;
          if (
            !isLanding &&
            G.tokens.some((t) => t.id !== token.id && t.position === index)
          )
            point.y += 1.2;
          const step = { t: 0 };
          const from = rabbit.position.clone();
          tl.call(() => {
            from.copy(rabbit.position);
            playSound("hop");
          });
          tl.to(step, {
            t: 1,
            duration: this.reducedMotion ? 0.05 : 0.38,
            ease: "none",
            onUpdate: () => {
              rabbit.position.lerpVectors(from, point, step.t);
              rabbit.position.y +=
                Math.sin(step.t * Math.PI) * (this.reducedMotion ? 0 : 0.65);
            },
          });
          const scale =
            isLanding && token.position >= 0 && !hasExtraMovement
              ? layout.scale
              : 1;
          tl.to(
            rabbit.scale,
            {
              x: scale,
              y: scale,
              z: scale,
              duration: this.reducedMotion ? 0.05 : 0.38,
            },
            "<",
          );
          if (isLanding && featureAt(index, this.featureLayout) !== "spring")
            tl.call(() => {
              if (prop) prop.visible = false;
            });
        });
        this.addTileEffects(tl, tileEffects, G, numPlayers);
        if (G.action.fallen?.length) this.addFall(tl, rabbit);
      });
    } else if (G.action.kind === "rotate") {
      this.mechanismEffect();
      await this.timeline((tl) => {
        tl.to(this.carrot.rotation, {
          y: (G.mechanism * Math.PI) / 2,
          duration: this.reducedMotion ? 0.05 : 0.9,
          ease: "back.inOut(1.2)",
        });
        this.lids.forEach((lid, index) => {
          const open = G.holes.includes(index);
          const isBridge = BRIDGES.includes(index);
          if (!isBridge)
            tl.to(
              lid.scale,
              {
                x: open ? 0.001 : 1,
                y: open ? 0.001 : 1,
                z: open ? 0.001 : 1,
                duration: 0.35,
                ease: "power2.inOut",
              },
              0.4,
            );
          if (isBridge)
            tl.to(
              lid.rotation,
              { x: open ? -Math.PI / 2 : 0, duration: 0.4 },
              0.35,
            );
        });
        tl.addLabel("fall", 0.85);
        G.action.fallen?.forEach((id) =>
          this.addFall(tl, this.rabbits.get(id)!, "fall"),
        );
        this.addTileEffects(tl, G.action.effects ?? [], G, numPlayers);
      });
    } else if (G.action.kind === "rest") {
      await this.timeline((tl) => {
        tl.to({}, { duration: this.reducedMotion ? 0.05 : 0.35 });
      });
    }
    if (this.disposed) return;
    if (this.disposed) return;
    this.updateStars(G);
    this.updateEquipment(G);
    this.updateFeatureOccupancy(G);
    G.action.recovered?.forEach((id) => {
      const rabbit = this.rabbits.get(id);
      if (rabbit?.visible)
        this.floatingText(rabbit.position, "恢复", "#6f9b49");
    });
    if (G.action.kind === "move" && G.action.collected !== undefined) {
      playSound("collect");
      this.burst(
        pathPoint(G.action.collected).add(new THREE.Vector3(0, 0.7, 0)),
      );
    }
    G.action.collections?.forEach((collection) => {
      playSound("collect");
      this.burst(pathPoint(collection.index).add(new THREE.Vector3(0, 0.7, 0)));
    });
    if (this.winnerId && !this.disposed) {
      const winner = this.rabbits.get(this.winnerId)!;
      const destination = pathPoint(FINISH);
      if (this.following) this.focusAt(destination);
      const from = winner.position.clone();
      await this.timeline((tl) => {
        tl.to(this.carrot.rotation, {
          y: Math.round(this.carrot.rotation.y / (Math.PI * 2)) * Math.PI * 2,
          duration: 0.3,
        });
        if (from.distanceTo(destination) > 0.01) {
          const hop = { t: 0 };
          tl.to(hop, {
            t: 1,
            duration: this.reducedMotion ? 0.05 : 0.9,
            ease: "none",
            onUpdate: () => {
              winner.position.lerpVectors(from, destination, hop.t);
              winner.position.y +=
                Math.sin(hop.t * Math.PI) * (this.reducedMotion ? 0 : 1.1);
            },
          });
          tl.to(winner.scale, { x: 1, y: 1, z: 1, duration: 0.35 }, "<");
        }
        tl.to(winner.scale, {
          x: 1.04,
          y: 0.92,
          z: 1.04,
          duration: 0.22,
          ease: "power2.out",
        });
        tl.call(() => this.celebrate(winner.position));
        tl.to({}, { duration: this.reducedMotion ? 0.05 : 0.65 });
      });
    }
  }

  private celebrate(origin: THREE.Vector3) {
    if (this.reducedMotion) return;
    const group = new THREE.Group();
    group.position.copy(origin);
    this.scene.add(group);
    const tl = gsap.timeline({
      onComplete: () => {
        group.children.forEach((child) =>
          ((child as THREE.Mesh).material as THREE.Material).dispose(),
        );
        this.scene.remove(group);
        this.effects.delete(tl);
      },
    });
    for (let i = 0; i < 42; i++) {
      const star = new THREE.Mesh(
        starGeometry,
        new THREE.MeshBasicMaterial({
          color: [...COLORS, "#f0cb65", "#fff9dd"][i % 6],
          transparent: true,
          depthWrite: false,
        }),
      );
      star.scale.setScalar(0.065 + (i % 3) * 0.025);
      const angle = i * 2.4;
      star.position.set(Math.cos(angle) * 0.35, 0.65, Math.sin(angle) * 0.35);
      group.add(star);
      const time = (i % 7) * 0.065;
      tl.to(
        star.position,
        {
          x: Math.cos(angle) * (1.7 + (i % 3) * 0.45),
          z: Math.sin(angle) * (1.7 + (i % 3) * 0.45),
          y: 2 + (i % 5) * 0.22,
          duration: 0.75,
          ease: "power2.out",
        },
        time,
      );
      tl.to(
        star.position,
        { y: -0.5, duration: 1.5, ease: "power1.in" },
        time + 0.75,
      );
      tl.to(star.rotation, { z: angle, y: angle / 2, duration: 2.2 }, time);
      tl.to(star.material, { opacity: 0, duration: 0.6 }, time + 1.55);
    }
    this.effects.add(tl);
  }

  winnerPortrait() {
    if (!this.winnerId || this.disposed) return;
    const portrait = new THREE.Scene();
    const rabbit = this.rabbits.get(this.winnerId)!.clone(true);
    rabbit.position.set(0, 0, 0);
    rabbit.rotation.set(0, 0.2, 0);
    rabbit.scale.set(1.04, 0.92, 1.04);
    rabbit.getObjectByName("stun-halo")!.visible = false;
    portrait.add(rabbit, new THREE.HemisphereLight("#fff8e9", "#b2c9ad", 2.4));
    const light = new THREE.DirectionalLight("#fff8ec", 3);
    light.position.set(-3, 5, 4);
    portrait.add(light);
    const camera = new THREE.OrthographicCamera(-0.8, 0.8, 0.8, -0.8, 0.1, 20);
    camera.position.set(1.6, 1.6, 5);
    camera.lookAt(0, 0.7, 0);
    const size = 384;
    const target = new THREE.WebGLRenderTarget(size, size);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previousTarget = this.renderer.getRenderTarget();
    const previousViewport = this.renderer.getViewport(new THREE.Vector4());
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(portrait, camera);
      const pixels = new Uint8Array(size * size * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const data = new Uint8ClampedArray(pixels.length);
      for (let y = 0; y < size; y++)
        data.set(
          pixels.subarray((size - y - 1) * size * 4, (size - y) * size * 4),
          y * size * 4,
        );
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas
        .getContext("2d")!
        .putImageData(new ImageData(data, size, size), 0, 0);
      return canvas.toDataURL("image/png");
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setViewport(previousViewport);
      target.dispose();
      portrait.clear();
    }
  }

  private addTileEffects(
    tl: gsap.core.Timeline,
    effects: TileEffect[],
    G: RabbitState,
    numPlayers: number,
  ) {
    effects.forEach((effect, effectIndex) => {
      tl.call(() => this.triggerTileEffect(effect));
      tl.to(
        {},
        {
          duration: this.reducedMotion
            ? 0.01
            : effect.kind === "spring"
              ? 0.13
              : 0.18,
        },
      );
      const rabbit = this.rabbits.get(effect.token)!;
      const token = G.tokens.find((t) => t.id === effect.token)!;
      const route =
        effect.kind === "spring" ? effect.route.slice(-1) : effect.route;
      route.forEach((index, i) => {
        const lastMotion = !effects
          .slice(effectIndex + 1)
          .some((next) => next.token === effect.token && next.route.length > 0);
        const final =
          lastMotion && i === route.length - 1 && token.position >= -1;
        const target = final
          ? this.tokenLayout(token, G, numPlayers)
          : { point: pathPoint(index), scale: 1 };
        const from = rabbit.position.clone();
        const step = { t: 0 };
        const duration = this.reducedMotion
          ? 0.025
          : effect.kind === "spring"
            ? 0.72
            : effect.kind === "slide"
              ? 0.15
              : 0.24;
        tl.call(() => {
          from.copy(rabbit.position);
          if (this.following) this.focusAt(target.point);
        });
        tl.to(step, {
          t: 1,
          duration,
          ease: "none",
          onUpdate: () => {
            rabbit.position.lerpVectors(from, target.point, step.t);
            const height =
              effect.kind === "spring"
                ? 1.6
                : effect.kind === "slide"
                  ? 0.08
                  : 0.24;
            rabbit.position.y +=
              Math.sin(step.t * Math.PI) * (this.reducedMotion ? 0 : height);
          },
        });
        tl.to(
          rabbit.scale,
          { x: target.scale, y: target.scale, z: target.scale, duration },
          "<",
        );
        if (effect.kind === "slide")
          tl.call(() => this.pulseRing(target.point, "#cda0c2", 1.3));
      });
    });
    if (
      effects.some((effect) => effect.kind === "blocked" && effect.route.length)
    ) {
      G.tokens
        .filter(
          (token) =>
            token.position >= 0 &&
            !effects.some((effect) => effect.token === token.id),
        )
        .forEach((token) => {
          const target = this.tokenLayout(token, G, numPlayers);
          const rabbit = this.rabbits.get(token.id)!;
          tl.to(rabbit.position, {
            x: target.point.x,
            y: target.point.y,
            z: target.point.z,
            duration: 0.18,
          });
          tl.to(
            rabbit.scale,
            {
              x: target.scale,
              y: target.scale,
              z: target.scale,
              duration: 0.18,
            },
            "<",
          );
        });
    }
  }

  private addFall(tl: gsap.core.Timeline, rabbit: THREE.Group, at?: string) {
    const fall = gsap.timeline();
    fall.call(() => playSound("trap"));
    fall.to(rabbit.rotation, {
      z: 0.25,
      duration: 0.12,
      repeat: 2,
      yoyo: true,
    });
    fall.to(rabbit.position, {
      y: "-=1.7",
      duration: 0.4,
      ease: "power2.in",
    });
    fall.to(rabbit.scale, { x: 0.05, y: 0.05, z: 0.05, duration: 0.35 }, "<");
    fall.call(() => {
      rabbit.visible = false;
    });
    tl.add(fall, at);
  }

  private timeline(create: (tl: gsap.core.Timeline) => void): Promise<void> {
    return new Promise((resolve) => {
      this.settleAnimation = resolve;
      const tl = gsap.timeline({
        onComplete: () => {
          this.settleAnimation = undefined;
          resolve();
        },
      });
      this.activeTimeline = tl;
      create(tl);
    });
  }

  setSelectable(ids: string[]) {
    this.selectable = ids;
    this.selectionRings.forEach((ring, id) => {
      ring.visible = ids.includes(id);
      const rabbit = this.rabbits.get(id)!;
      ring.position.copy(rabbit.position);
      ring.position.y += 0.025;
      ring.scale.setScalar(rabbit.scale.x);
    });
    if (!ids.length) {
      this.highlight.visible = false;
      this.clearPreview();
    }
  }

  showPreview(route: number[], effects: TileEffect[] = []) {
    this.clearPreview();
    route.forEach((index, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.047, 8, 40),
        new THREE.MeshBasicMaterial({
          color: effects.some(
            (effect) => effect.kind === "blocked" && effect.from === index,
          )
            ? "#48a3b5"
            : this.currentState?.holes.includes(index) ||
                (i === route.length - 1 &&
                  ["wind", "slide"].includes(
                    featureAt(index, this.featureLayout) ?? "",
                  ))
              ? "#ef7c5b"
              : PREVIEW_GREEN,
          toneMapped: false,
          transparent: true,
          opacity: i === route.length - 1 ? 1 : 0.85,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(pathPoint(index));
      ring.position.y += 0.045;
      this.preview.add(ring);
    });
    effects.forEach((effect) =>
      effect.route
        .filter((index) => index >= 0)
        .forEach((index) => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.32, 0.035, 8, 36),
            new THREE.MeshBasicMaterial({
              color:
                effect.kind === "spring"
                  ? "#d0a43a"
                  : effect.kind === "blocked"
                    ? "#48a3b5"
                    : "#b36c92",
              transparent: true,
              opacity: 0.95,
              toneMapped: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position
            .copy(pathPoint(index))
            .add(new THREE.Vector3(0, 0.07, 0));
          this.preview.add(ring);
        }),
    );
  }

  clearPreview() {
    this.preview.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.preview.clear();
  }

  resetView() {
    this.useManualCamera();
    this.controls.reset();
  }
  setFollowing(value: boolean) {
    this.following = value;
  }
  focusRabbit(id: string) {
    const rabbit = this.rabbits.get(id);
    if (rabbit) this.focusAt(rabbit.position);
  }
  private cancelCameraTween = () => {
    this.cameraTween?.kill();
  };
  private useManualCamera = () => {
    this.cancelCameraTween();
    this.following = false;
    this.onManualCamera();
  };
  private focusAt(point: THREE.Vector3) {
    this.cancelCameraTween();
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(point.x, -6, 6),
      0.8 + point.y * 0.25,
      THREE.MathUtils.clamp(point.z, -6, 6),
    );
    const camera = this.camera.position
      .clone()
      .add(target.clone().sub(this.controls.target));
    const duration = this.reducedMotion ? 0 : 0.6;
    this.cameraTween = gsap.timeline();
    this.cameraTween.to(
      this.controls.target,
      { x: target.x, y: target.y, z: target.z, duration, ease: "power2.out" },
      0,
    );
    this.cameraTween.to(
      this.camera.position,
      { x: camera.x, y: camera.y, z: camera.z, duration, ease: "power2.out" },
      0,
    );
    this.cameraTween.to(
      this.camera,
      {
        zoom: 1.65,
        duration,
        ease: "power2.out",
        onUpdate: () => this.camera.updateProjectionMatrix(),
      },
      0,
    );
  }
  zoom(direction: number) {
    this.useManualCamera();
    this.camera.zoom = THREE.MathUtils.clamp(
      this.camera.zoom + direction * 0.15,
      0.7,
      2.4,
    );
    this.camera.updateProjectionMatrix();
  }
  toggleRotation() {
    this.autoRotate = !this.autoRotate;
    this.controls.autoRotate = this.autoRotate;
    return this.autoRotate;
  }

  private pick(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: THREE.Object3D[] = this.selectable
      .map((id) => this.rabbits.get(id)!)
      .filter(Boolean);
    if (this.sceneryEnabled) targets.push(...this.places.values());
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return;
    let object: THREE.Object3D | null = hit.object;
    while (object && !object.userData.tokenId && !object.userData.discovery)
      object = object.parent;
    return (object?.userData.tokenId ?? object?.userData.discovery) as
      | string
      | undefined;
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.pointerDown = true;
    this.pointerStart.set(event.clientX, event.clientY);
  };
  private handlePointerUp = (event: PointerEvent) => {
    this.pointerDown = false;
    if (
      this.pointerStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      ) > 6
    )
      return;
    const id = this.pick(event);
    if (id && DISCOVERIES.includes(id as Discovery))
      this.explore(id as Discovery);
    else if (id) this.onSelect(id);
  };
  private handlePointerMove = (event: PointerEvent) => {
    if (
      this.pointerDown &&
      event.buttons &&
      this.pointerStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      ) > 6
    )
      this.useManualCamera();
    const id = this.pick(event);
    this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
    this.highlight.visible = Boolean(id && this.rabbits.has(id));
    if (id && this.rabbits.has(id)) {
      this.highlight.position.copy(this.rabbits.get(id)!.position);
      this.highlight.position.y += 0.035;
      this.highlight.scale.setScalar(this.rabbits.get(id)!.scale.x);
    }
  };

  private render = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.render);
    this.controls.update();
    const time = performance.now() / 1000;
    const elapsed = (performance.now() - this.previousFrame) / 1000;
    const delta = Math.min(elapsed, 0.05);
    this.previousFrame = performance.now();
    if (this.weatherData?.enabled && !this.weatherPaused) {
      this.weatherElapsed += elapsed;
      const [x, z] = cloudPosition(this.weatherData, this.weatherElapsed);
      this.stormCloud.position.lerp(
        new THREE.Vector3(x, heightAt(x, z) + 3.4, z),
        1 - Math.exp(-delta * 16),
      );
    }
    if (!this.reducedMotion && this.sceneryEnabled)
      this.ambient.forEach((animate) => animate(time, delta));
    if (!this.reducedMotion && this.sceneryEnabled) {
      this.rabbits.forEach((rabbit) => {
        const halo = rabbit.getObjectByName("stun-halo");
        if (halo?.visible) halo.rotation.y += delta * 2.6;
      });
      if (this.stormCloud.visible) {
        const positions = this.rainGeometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        for (let i = 0; i < 14; i++) {
          const y = -0.35 - ((time * 1.4 + i * 0.15) % 2.1);
          positions.setY(i * 2, y);
          positions.setY(i * 2 + 1, y - 0.18);
        }
        positions.needsUpdate = true;
      }
    }
    this.selectionRings.forEach((ring) => {
      if (ring.visible)
        (ring.material as THREE.MeshBasicMaterial).opacity = this.reducedMotion
          ? 0.9
          : 0.85 + Math.sin(time * 3) * 0.1;
    });
    this.renderer.render(this.scene, this.camera);
  };

  getDiagnostics() {
    const pixels = new Uint8Array(4 * 32 * 32);
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.readPixels(
      Math.floor(width / 2) - 16,
      Math.floor(height / 2) - 16,
      32,
      32,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      meshes: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      nonTransparentPixels: Array.from(pixels).filter(
        (_, i) => i % 4 === 3 && pixels[i] > 0,
      ).length,
      width,
      height,
      pathLength: PATH.length,
      groundCount: GROUND_COUNT,
      cameraZoom: this.camera.zoom,
      cameraPosition: this.camera.position.toArray(),
      cameraTarget: this.controls.target.toArray(),
      following: this.following,
      features: this.featureLayout,
      featurePositions: [...this.featureProps].map(([index, prop]) => ({
        index,
        position: prop.position.toArray(),
        visible: prop.visible,
      })),
      cloudVisible: this.stormCloud.visible,
      cloudPosition: this.stormCloud.position.toArray(),
      lightningVisible: this.lightningVisible,
      activeEffects: this.effects.size,
      mechanismGlow: (this.carrotBody!.material as THREE.MeshPhysicalMaterial)
        .emissiveIntensity,
      litTraps: [...this.trapRims.values()].filter(
        (rim) =>
          (rim.material as THREE.MeshPhysicalMaterial).emissiveIntensity > 0.1,
      ).length,
      windSpeed: this.windSpeed.value,
      mushroomHeight: this.mushroomCap.position.y,
      fishHeight: this.fish.position.y,
      starsRemaining: [...this.starPickups.values()].filter(
        (star) => star.visible,
      ).length,
      places: [...this.places].map(([id, group]) => {
        const projected = group.position
          .clone()
          .add(new THREE.Vector3(0, id === "windmill" ? 1.4 : 0.5, 0))
          .project(this.camera);
        return {
          id,
          discovered: !this.discoveryPins.get(id)!.visible,
          screen: {
            x: rect.left + ((projected.x + 1) * rect.width) / 2,
            y: rect.top + ((1 - projected.y) * rect.height) / 2,
          },
        };
      }),
      winnerId: this.winnerId,
      throne: pathPoint(FINISH).toArray(),
      previews: this.preview.children.map((object) => ({
        color: (
          (object as THREE.Mesh).material as THREE.MeshBasicMaterial
        ).color.getHexString(),
        position: object.position.toArray(),
      })),
      tokens: [...this.rabbits].map(([id, mesh]) => {
        const projected = mesh.position
          .clone()
          .add(new THREE.Vector3(0, 0.7 * mesh.scale.y, 0))
          .project(this.camera);
        return {
          id,
          number: mesh.userData.number,
          numbered: Boolean(mesh.getObjectByName("belly-number")),
          shieldVisible: Boolean(
            mesh.getObjectByName("bubble-shield")?.visible,
          ),
          stunned: Boolean(mesh.getObjectByName("stun-halo")?.visible),
          visible: mesh.visible,
          position: mesh.position.toArray(),
          scale: mesh.scale.toArray(),
          screen: {
            x: rect.left + ((projected.x + 1) * rect.width) / 2,
            y: rect.top + ((1 - projected.y) * rect.height) / 2,
          },
        };
      }),
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.activeTimeline?.kill();
    this.cancelCameraTween();
    this.effects.forEach((effect) => effect.kill());
    this.settleAnimation?.();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.renderer.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
    );
    this.renderer.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.renderer.domElement.removeEventListener("wheel", this.useManualCamera);
    const geometries = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Sprite) mats.add(object.material);
      if (object instanceof THREE.LineSegments) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((material) => mats.add(material));
      }
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((mat) => mats.add(mat));
      }
    });
    geometries.forEach((geometry) => {
      if (geometry !== sphereGeometry && geometry !== starGeometry)
        geometry.dispose();
    });
    mats.forEach((material) => {
      const map = (material as THREE.MeshBasicMaterial).map;
      map?.dispose();
      if (
        ![...materials.values()].includes(
          material as THREE.MeshPhysicalMaterial,
        )
      )
        material.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
