export const DECK_THICKNESS = 0.18;
export const RINGS = [
  { radius: 1.3, edge: 1.98, count: 6, height: 0.54 },
  { radius: 2.65, edge: 3.32, count: 12, height: 0.36 },
  { radius: 3.9, edge: 4.57, count: 12, height: 0.18 },
  { radius: 5.15, edge: 5.76, count: 18, height: 0 },
] as const;
export const BOARD_RADIUS = RINGS[RINGS.length - 1].edge;
export const DECK_CENTER_Y = RINGS.reduce((moment, ring, index) => {
  const area = ring.edge ** 2 - (RINGS[index - 1]?.edge ?? 0) ** 2;
  return moment + area * (ring.height - DECK_THICKNESS / 2);
}, 0) / BOARD_RADIUS ** 2;
export const PIVOT_LOCAL_Y = RINGS[0].height - DECK_THICKNESS;
export const deckSurface = (slot: { y: number }) => slot.y - DECK_CENTER_Y;
export type Slot = { id: number; x: number; y: number; z: number; ring: number };
export const SLOTS: Slot[] = RINGS.flatMap(({ radius, count, height }, ring) => Array.from({ length: count }, (_, index) => {
  const angle = index / count * Math.PI * 2 + (ring % 2 ? Math.PI / count : 0);
  return { id: 0, x: Math.cos(angle) * radius, y: height, z: Math.sin(angle) * radius, ring };
})).map((slot, id) => ({ ...slot, id }));

export const PLAYER_COLORS = ['#257bc1', '#e5ae34', '#de7769', '#429d8b'];
export const PLAYER_NAMES = ['蓝星队', '金星队', '火星队', '绿星队'];
export type Mode = 'classic' | 'dice';
export type Settings = { count: number; bots: boolean[]; mode: Mode; sound: boolean };
export const DEFAULT_SETTINGS: Settings = { count: 2, bots: [false, true, false, false], mode: 'classic', sound: true };
export const SETTINGS_KEY = 'balance-astronaut-preferences-v1';

export function parseSettings(value: unknown): Settings {
  const saved = value && typeof value === 'object' ? value as Partial<Settings> : {};
  return {
    count: [2, 3, 4].includes(saved.count ?? 0) ? saved.count! : 2,
    bots: Array.from({ length: 4 }, (_, index) => Array.isArray(saved.bots) ? saved.bots[index] === true : DEFAULT_SETTINGS.bots[index]),
    mode: saved.mode === 'dice' ? 'dice' : 'classic',
    sound: saved.sound !== false,
  };
}
