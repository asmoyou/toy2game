export type Cell = { id: string; q: number; r: number; x: number; z: number; rim: boolean };
export const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;
export const TILE_RADIUS = 0.67;
export const TILE_SPACING = 0.7;

export function createCells(radius: number): Cell[] {
  const cells: Cell[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (distance > radius) continue;
      cells.push({ id: `${q},${r}`, q, r, x: Math.sqrt(3) * TILE_SPACING * (q + r / 2), z: 1.5 * TILE_SPACING * r, rim: distance === radius });
    }
  }
  return cells;
}
