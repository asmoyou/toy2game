import { PATH } from "./world";

export type WeatherStrike = {
  id: number;
  point: [number, number];
  hits: string[];
  blocked: string[];
};
export type WeatherState = {
  version: 2;
  enabled: boolean;
  revision: number;
  from: [number, number];
  to: [number, number];
  duration: number;
  elapsed: number;
  strikeIn: number;
  strikes: number;
  lastStrike?: WeatherStrike;
};
export type WeatherRandom = {
  Die: (sides: number) => number;
  Number: () => number;
};

function waypoint(random: WeatherRandom, occupied: number[]): [number, number] {
  const positions = [
    ...new Set(occupied.filter((index) => index >= 0 && index < PATH.length)),
  ];
  if (positions.length && random.Die(3) !== 1) {
    const [x, z] = PATH[positions[random.Die(positions.length) - 1]];
    return [
      x + (random.Number() - 0.5) * 0.35,
      z + (random.Number() - 0.5) * 0.35,
    ];
  }
  if (random.Die(2) === 1) return [...PATH[random.Die(PATH.length) - 1]];
  const angle = random.Number() * Math.PI * 2;
  const radius = 2 + random.Number() * 7.5;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.95];
}

export function createWeather(random?: WeatherRandom): WeatherState {
  return {
    version: 2,
    enabled: true,
    revision: 0,
    from: [-7, -5],
    to: random ? waypoint(random, []) : [5, -3],
    duration: random ? random.Die(4) + 4 : 7,
    elapsed: 0,
    strikeIn: random ? random.Die(5) + 4 : 7,
    strikes: 0,
  };
}

export function cloudPosition(
  weather: WeatherState,
  extraTime = 0,
): [number, number] {
  const t = Math.min(
    1,
    Math.max(0, (weather.elapsed + extraTime) / weather.duration),
  );
  const ease = t * t * (3 - 2 * t);
  return [
    weather.from[0] + (weather.to[0] - weather.from[0]) * ease,
    weather.from[1] + (weather.to[1] - weather.from[1]) * ease,
  ];
}

export function advanceCloud(
  weather: WeatherState,
  elapsed: number,
  occupied: number[],
  random: WeatherRandom,
  canStrike: boolean,
) {
  let remaining = Math.min(Math.max(elapsed, 0), 60);
  weather.strikeIn -= remaining;
  while (remaining > 0) {
    const step = Math.min(remaining, weather.duration - weather.elapsed);
    weather.elapsed += step;
    remaining -= step;
    if (weather.elapsed >= weather.duration) {
      weather.from = [...weather.to];
      weather.to = waypoint(random, occupied);
      weather.duration = random.Die(4) + 4;
      weather.elapsed = 0;
    }
  }
  weather.revision++;
  if (weather.strikeIn > 0 || !canStrike) return;
  weather.strikeIn = random.Die(7) + 5;
  weather.strikes++;
  return cloudPosition(weather);
}
