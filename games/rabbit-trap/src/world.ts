export const GROUND_PATH: [number, number][] = [
  [-5, 7],
  [-3.5, 7.75],
  [-1.8, 8.15],
  [0, 8.4],
  [1.8, 8.2],
  [3.5, 7.7],
  [5.1, 6.85],
  [6.5, 5.65],
  [7.65, 4],
  [8.35, 2.15],
  [8.65, 0.2],
  [8.35, -1.8],
  [7.7, -3.7],
  [6.6, -5.35],
  [5.1, -6.65],
  [3.4, -7.55],
  [1.5, -8.15],
  [-0.5, -8.35],
  [-2.55, -8],
  [-4.45, -7.35],
  [-6.1, -6.25],
  [-7.3, -4.7],
  [-8.1, -2.9],
  [-8.45, -1],
  [-8.35, 1],
  [-7.9, 2.95],
  [-6.7, 4],
  [-5.5, 4.45],
];

export const HILL_PATH: [number, number][] = [
  [-5.2, 2.9],
  [-4.5, 3.7],
  [-3.4, 4.05],
  [-2.2, 4.25],
  [-0.9, 4.35],
  [0.45, 4.3],
  [1.75, 4],
  [2.95, 3.35],
  [3.95, 2.4],
  [4.55, 1.15],
  [4.65, -0.25],
  [4.25, -1.6],
  [3.4, -2.7],
  [2.2, -3.55],
  [0.8, -3.9],
  [-0.65, -3.8],
  [-2.1, -3.2],
  [-3.3, -2.3],
  [-3.85, -0.95],
  [-3.55, 0.5],
  [-2.4, 1.45],
  [-0.95, 1.95],
  [0.65, 1.9],
  [2, 1.05],
  [2.3, -0.45],
  [1.35, -1.6],
  [-0.15, -1.65],
];

export const GROUND_COUNT = GROUND_PATH.length;
export const PATH = [...GROUND_PATH, ...HILL_PATH];
export const FINISH = PATH.length;
export const TRAPS = [4, 8, 12, 17, 21, 24].map((i) => i + GROUND_COUNT);
export const BRIDGES = [8, 17].map((i) => i + GROUND_COUNT);
export const TRAP_PATTERNS = [
  [8, 21],
  [4, 17],
  [12, 24],
  [8, 17, 21],
  [4, 12],
  [21, 24],
].map((pattern) => pattern.map((i) => i + GROUND_COUNT));
export const STAR_TILES = [
  2,
  6,
  10,
  14,
  18,
  23,
  GROUND_COUNT + 3,
  GROUND_COUNT + 13,
  GROUND_COUNT + 22,
];
export const DISCOVERIES = ["mushroom", "pond", "windmill"] as const;
export type Discovery = (typeof DISCOVERIES)[number];
export const DISCOVERY_NAMES: Record<Discovery, string> = {
  mushroom: "蘑菇营地",
  pond: "泡泡池塘",
  windmill: "风车花园",
};

export type FeatureKind = "spring" | "wind" | "slide" | "shield";
export const FEATURE_INFO: Record<
  FeatureKind,
  {
    name: string;
    glyph: string;
    color: string;
    fill: string;
    description: string;
  }
> = {
  spring: {
    name: "弹簧跳台",
    glyph: "+3",
    color: "#538234",
    fill: "#dceebc",
    description: "落到弹簧上，再向前跳 3 格。",
  },
  wind: {
    name: "逆风陷阱",
    glyph: "-2",
    color: "#bd7740",
    fill: "#f4d9b7",
    description: "被大风吹退 2 格，护盾可以抵挡。",
  },
  slide: {
    name: "滑梯陷阱",
    glyph: "↩",
    color: "#9b648e",
    fill: "#ead3e4",
    description: "滑回本段安全起点，护盾可以抵挡。",
  },
  shield: {
    name: "泡泡护盾",
    glyph: "盾",
    color: "#408f9b",
    fill: "#c7e8ec",
    description: "获得一层护盾，抵挡一次地洞、逆风、滑梯或雷击。",
  },
};
export type FeatureTile = { index: number; kind: FeatureKind };
export const FEATURE_TILES: FeatureTile[] = [
  { index: 3, kind: "shield" },
  { index: 5, kind: "spring" },
  { index: 11, kind: "wind" },
  { index: 13, kind: "shield" },
  { index: 15, kind: "slide" },
  { index: 19, kind: "spring" },
  { index: 24, kind: "wind" },
  { index: GROUND_COUNT + 7, kind: "spring" },
  { index: GROUND_COUNT + 10, kind: "shield" },
  { index: GROUND_COUNT + 16, kind: "wind" },
  { index: GROUND_COUNT + 20, kind: "slide" },
];
export function featureAt(
  index: number,
  layout: readonly FeatureTile[] = FEATURE_TILES,
) {
  return layout.find((tile) => tile.index === index)?.kind;
}

export function randomizeFeatures(random: {
  Shuffle: <T>(values: T[]) => T[];
}): FeatureTile[] {
  const excluded = new Set([
    ...STAR_TILES,
    ...TRAPS,
    0,
    1,
    8,
    16,
    GROUND_COUNT,
    GROUND_COUNT + 14,
  ]);
  const ground = PATH.map((_, i) => i).filter(
    (i) => i < GROUND_COUNT && !excluded.has(i),
  );
  const hill = PATH.map((_, i) => i).filter(
    (i) => i >= GROUND_COUNT && !excluded.has(i),
  );
  const groundKinds: FeatureKind[] = ["shield", "spring", "wind", "slide"];
  const hillKinds: FeatureKind[] = ["shield", "spring", "wind", "slide"];
  for (let attempt = 0; attempt < 100; attempt++) {
    const groundPositions = random.Shuffle(ground);
    const hillPositions = random.Shuffle(hill);
    const layout = [
      ...random
        .Shuffle(groundKinds)
        .map((kind, i) => ({ kind, index: groundPositions[i] })),
      ...random
        .Shuffle(hillKinds)
        .map((kind, i) => ({ kind, index: hillPositions[i] })),
    ];
    if (
      layout.some((tile, i) =>
        layout.some(
          (other, j) => i !== j && Math.abs(tile.index - other.index) < 3,
        ),
      )
    )
      continue;
    const hazards = new Set(
      layout
        .filter((tile) => tile.kind === "wind" || tile.kind === "slide")
        .map((tile) => tile.index),
    );
    // Keep a way through with a 1/2/3 card, and avoid springs that feed backward loops.
    if (
      [...hazards].some(
        (index) => hazards.has(index + 1) && hazards.has(index + 2),
      )
    )
      continue;
    if (
      layout.some(
        (tile) => tile.kind === "spring" && hazards.has(tile.index + 3),
      )
    )
      continue;
    return layout.sort((a, b) => a.index - b.index);
  }
  return [
    { index: 3, kind: "shield" },
    { index: 7, kind: "spring" },
    { index: 15, kind: "slide" },
    { index: 24, kind: "wind" },
    { index: 29, kind: "shield" },
    { index: 35, kind: "spring" },
    { index: 44, kind: "wind" },
    { index: 48, kind: "slide" },
  ];
}
export function checkpointFor(index: number) {
  if (index >= GROUND_COUNT + 14) return GROUND_COUNT + 14;
  if (index >= GROUND_COUNT) return GROUND_COUNT;
  if (index >= 16) return 16;
  if (index >= 8) return 8;
  return 0;
}

export function zoneFor(position: number) {
  if (position >= GROUND_COUNT) return "胡萝卜山";
  if (position >= 16) return "风车花园";
  if (position >= 8) return "泡泡池塘";
  return "蘑菇营地";
}
