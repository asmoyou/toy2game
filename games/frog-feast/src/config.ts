export const BEAN_COUNT = 60;
export const BEAN_RADIUS = 0.215;
export const DECK_Y = 0.48;
export const FROG_RADIUS = 3.8;
export const CYCLE = 0.7;
export const STEP = 1 / 120;
export const TEAMS = [
  { name: '绿蛙', nickname: '青青', color: '#64b936', ink: '#477829', pale: '#eaf4db', angle: Math.PI / 4, key: 'A', code: 'KeyA' },
  { name: '蓝蛙', nickname: '蓝蓝', color: '#17aee7', ink: '#247ba0', pale: '#e6f3fa', angle: Math.PI * 5 / 4, key: 'L', code: 'KeyL' },
  { name: '黄蛙', nickname: '豆豆', color: '#ffc52d', ink: '#976b19', pale: '#fff4d6', angle: Math.PI * 3 / 4, key: 'Z', code: 'KeyZ' },
  { name: '红蛙', nickname: '红红', color: '#f14a40', ink: '#b55249', pale: '#ffebe6', angle: Math.PI * 7 / 4, key: 'M', code: 'KeyM' },
] as const;
export const BEAN_COLORS = ['#f7c72e', '#ec433b', '#79c43d', '#189ee1'];
export type Settings = { version: 1; count: number; bots: boolean[]; sound: boolean };
export const SETTINGS_KEY = 'frog-feast-preferences-v1';

export function parseSettings(value: unknown): Settings {
  const saved = value && typeof value === 'object' && 'version' in value && value.version === 1 ? value as Partial<Settings> : {};
  const count = [2, 3, 4].includes(saved.count ?? 0) ? saved.count! : 4;
  return { version: 1, count, sound: saved.sound !== false, bots: Array.from({ length: 4 }, (_, i) => i < count && (Array.isArray(saved.bots) ? saved.bots[i] === true : i > 0)) };
}

export function seededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// Shared by the animated mouth and its capture volume: the visual pose never decides a score.
export function mouthPose(age: number) {
  if (age < 0 || age >= CYCLE) return { reach: 0, open: 0 };
  const reach = age < 0.22 ? age / 0.22 : age < 0.4 ? 1 : 1 - (age - 0.4) / 0.3;
  const open = age < 0.16 ? age / 0.16 : age < 0.25 ? 1 : Math.max(0, 1 - (age - 0.25) / 0.14);
  return { reach: Math.max(0, reach) * 1.3, open: open * 0.52 };
}
