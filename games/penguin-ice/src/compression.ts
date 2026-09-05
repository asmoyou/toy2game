export function compressionFactor(directions: ReadonlyArray<{ x: number; z: number }>, friction: number): number {
  const angles = directions.filter(vector => Math.hypot(vector.x, vector.z) > 1e-6)
    .map(vector => Math.atan2(vector.z, vector.x)).sort((a, b) => a - b);
  if (angles.length < 2) return 0;
  let largestGap = angles[0] + Math.PI * 2 - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) largestGap = Math.max(largestGap, angles[i] - angles[i - 1]);
  // Opposing contacts, including their friction cones, must balance the clamping pressure.
  if (largestGap > Math.PI + 2 * Math.atan(friction) - 0.01) return 0;
  return Math.min(1, 0.8 + Math.max(0, angles.length - 2) * 0.05);
}
