import { parseSettings, replaySave, saveFor, type MatchState, type Settings } from './rules';

export const SAVE_KEY = 'flip-match-save-v1';
export const PREFERENCES_KEY = 'flip-match-preferences-v1';
export function loadMatch() {
  try { return replaySave(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')); } catch { return null; }
}
export function saveMatch(state: MatchState) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveFor(state))); } catch { /* Playing is possible without storage. */ }
}
export function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    return { settings: parseSettings([1, 2].includes(saved?.version) ? saved.settings : null), sound: saved?.sound !== false };
  } catch { return { settings: parseSettings(null), sound: true }; }
}
export function savePreferences(settings: Settings, sound: boolean) {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 2, settings, sound })); } catch { /* Optional preferences. */ }
}
