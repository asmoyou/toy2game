export const GROUND_Y = -1.65;
export const WATER_LEVEL = -2.15;

export function createHoleOutline(boardRadius: number) {
  const frameRadius = Math.sqrt(3) * 0.7 * boardRadius + 1.25;
  const extent = frameRadius * 0.65;
  const fractures = [
    [-0.82, -0.54], [-0.45, -0.83], [-0.12, -0.72], [0.02, -0.98],
    [0.28, -0.67], [0.67, -0.76], [0.75, -0.44], [0.98, -0.22],
    [0.68, 0.02], [0.87, 0.35], [0.54, 0.47], [0.6, 0.83],
    [0.21, 0.72], [-0.02, 0.95], [-0.2, 0.69], [-0.59, 0.82],
    [-0.64, 0.48], [-0.93, 0.26], [-0.73, 0.02], [-0.96, -0.21],
  ];
  return fractures.map(([x, z]) => ({ x: x * extent, z: z * extent }));
}
