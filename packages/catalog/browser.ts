export const LIBRARY_KEY = 'toy2game-library-v1';

export type Library = {
  favorites: string[];
  recent: { id: string; playedAt: number }[];
};

export function readLibrary(): Library {
  try {
    const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}');
    return {
      favorites: Array.isArray(data?.favorites)
        ? [...new Set<string>(data.favorites.filter((id: unknown) => typeof id === 'string'))]
        : [],
      recent: Array.isArray(data?.recent)
        ? data.recent.filter((entry: Library['recent'][number]) =>
          typeof entry?.id === 'string' && Number.isFinite(entry?.playedAt)).slice(0, 24)
        : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function writeLibrary(library: Library): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function recordVisit(id: string) {
  const library = readLibrary();
  library.recent = [{ id, playedAt: Date.now() }, ...library.recent.filter(entry => entry.id !== id)].slice(0, 24);
  writeLibrary(library);
}

export function libraryUrl(gameBase: string) {
  return new URL('../../', new URL(gameBase, window.location.origin)).pathname;
}
