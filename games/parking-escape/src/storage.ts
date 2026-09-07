import { LEVELS, initialState, type ParkingState } from './game';
import { legalMove, validLayout, type Level } from './rules';

export const SAVE_KEY = 'parking-escape-save-v1';
export const PREFERENCES_KEY = 'parking-escape-preferences-v1';
export type Saved = { version: 1; level: number; game: ParkingState; seconds: number; best: Record<string, number> };

function transition(level: Level, before: number[], after: number[]) {
  const changes = after.flatMap((to, car) => to !== before[car] ? [{ car, to }] : []);
  return changes.length === 1 && legalMove(level.cars, before, changes[0]);
}

export function parseSave(value: unknown): Saved {
  const fallback: Saved = { version: 1, level: 1, game: initialState(LEVELS[0]), seconds: 0, best: {} };
  if (!value || typeof value !== 'object') return fallback;
  const saved = value as Partial<Saved>;
  if (saved.version !== 1) return fallback;
  if (saved.best && typeof saved.best === 'object') {
    for (const level of LEVELS) {
      const best = saved.best[level.id];
      if (Number.isInteger(best) && best >= level.minimum && best <= 10000) fallback.best[level.id] = best;
    }
  }
  const level = LEVELS.find(level => level.id === saved.level), G = saved.game;
  if (!level || !G || !validLayout(level.cars, G.positions) || !Array.isArray(G.past) || !Array.isArray(G.future)) return fallback;
  if (G.past.length + G.future.length > 10000 || ![...G.past, ...G.future].every(p => validLayout(level.cars, p))) return fallback;
  // Validate the full undo/redo path so legal-looking but unreachable snapshots cannot be restored.
  const path = [...G.past, G.positions, ...[...G.future].reverse()];
  if (path[0].some((position, i) => position !== level.positions[i])) return fallback;
  for (let i = 1; i < path.length; i++) if (!transition(level, path[i - 1], path[i])) return fallback;
  return { version: 1, level: level.id, game: structuredClone(G), seconds: Number.isFinite(saved.seconds) && saved.seconds! >= 0 ? Math.min(saved.seconds!, 864000) : 0, best: fallback.best };
}

export function loadSave(): Saved {
  try { return parseSave(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')); }
  catch { return parseSave(null); }
}

export function persist(saved: Saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch { /* Storage may be full or unavailable. */ }
}

export function loadSound() {
  try { return JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null')?.sound !== false; }
  catch { return true; }
}

export function saveSound(sound: boolean) {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound })); } catch { /* Preferences are optional. */ }
}
