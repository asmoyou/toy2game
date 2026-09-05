export type PenguinMood = 'happy' | 'alert' | 'surprised' | 'scared' | 'falling' | 'swimming';

export type PenguinCondition = {
  remainingRatio: number;
  supports: number;
  stress: number;
  tilt: number;
  fallingSpeed: number;
  wobble: number;
  lost: boolean;
  inWater: boolean;
};

export function selectPenguinMood(condition: PenguinCondition, reacting = false): PenguinMood {
  if (condition.lost) return condition.inWater ? 'swimming' : 'falling';
  if (condition.supports <= 2 || condition.stress > 0.9 || condition.tilt > 0.11 || condition.fallingSpeed > 0.25 || condition.remainingRatio < 0.4) return 'scared';
  if (reacting || condition.wobble > 0.16) return 'surprised';
  if (condition.supports < 4 || condition.stress > 0.65 || condition.tilt > 0.045 || condition.remainingRatio < 0.72) return 'alert';
  return 'happy';
}
