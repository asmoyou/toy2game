export type Vehicle = { id: string; axis: 'x' | 'z'; lane: number; size: 2 | 3 };
export type Move = { car: number; to: number };
export type Level = { id: number; name: string; difficulty: number; minimum: number; cars: Vehicle[]; positions: number[] };
export const SIZE = 6;
export const EXIT = 6;
export const DIFFICULTIES = ['初来乍到', '渐入佳境', '环环相扣', '出库高手'];
export const GARAGE = [
  { id: 'X', name: '出库警车', color: '#f4f6f5', kind: 'police' },
  { id: 'A', name: '珊瑚轿车', color: '#f06468', kind: 'car' },
  { id: 'B', name: '天蓝轿车', color: '#59bddd', kind: 'car' },
  { id: 'C', name: '柠檬出租车', color: '#f5cf35', kind: 'taxi' },
  { id: 'D', name: '橘色越野车', color: '#f6a33f', kind: 'jeep' },
  { id: 'E', name: '青绿轿车', color: '#73be8e', kind: 'car' },
  { id: 'F', name: '红色消防车', color: '#e65b4c', kind: 'fire' },
  { id: 'G', name: '紫色轿车', color: '#b398d2', kind: 'car' },
  { id: 'H', name: '蓝色工程车', color: '#5499ed', kind: 'jeep' },
  { id: 'I', name: '白色救护车', color: '#ebf0f2', kind: 'ambulance' },
  { id: 'J', name: '薄荷轿车', color: '#54cbb8', kind: 'car' },
  { id: 'K', name: '黄色校车', color: '#fac347', kind: 'bus' },
  { id: 'L', name: '绿色货车', color: '#9bbd69', kind: 'truck' },
  { id: 'M', name: '紫色巴士', color: '#c5b5dd', kind: 'bus' },
  { id: 'N', name: '红色货车', color: '#e77464', kind: 'truck' },
] as const;
export const appearance = (id: string) => GARAGE.find(car => car.id === id)!;

export function occupancy(cars: Vehicle[], positions: number[]) {
  const grid = new Int8Array(SIZE * SIZE).fill(-1);
  cars.forEach((car, i) => {
    if (positions[i] === EXIT && i === 0) return;
    for (let offset = 0; offset < car.size; offset++) {
      grid[car.axis === 'x' ? car.lane * SIZE + positions[i] + offset : (positions[i] + offset) * SIZE + car.lane] = i;
    }
  });
  return grid;
}

export function validLayout(cars: Vehicle[], positions: unknown): positions is number[] {
  if (!Array.isArray(positions) || positions.length !== cars.length || !cars.length) return false;
  const used = new Set<number>();
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i], start = positions[i];
    if (!Number.isInteger(start) || !Number.isInteger(car.lane) || car.lane < 0 || car.lane >= SIZE) return false;
    if (i === 0 && start === EXIT && car.id === 'X' && car.axis === 'x' && car.lane === 2) continue;
    if (start < 0 || start + car.size > SIZE) return false;
    for (let n = 0; n < car.size; n++) {
      const cell = car.axis === 'x' ? car.lane * SIZE + start + n : (start + n) * SIZE + car.lane;
      if (used.has(cell)) return false;
      used.add(cell);
    }
  }
  return cars[0].id === 'X' && cars[0].axis === 'x' && cars[0].lane === 2 && cars[0].size === 2;
}

export function bounds(cars: Vehicle[], positions: number[], index: number, grid = occupancy(cars, positions)) {
  const car = cars[index];
  if (!car || positions[0] === EXIT) return { min: positions[index], max: positions[index] };
  const at = (p: number) => grid[car.axis === 'x' ? car.lane * SIZE + p : p * SIZE + car.lane];
  let min = positions[index], max = positions[index];
  while (min > 0 && at(min - 1) === -1) min--;
  while (max + car.size < SIZE && at(max + car.size) === -1) max++;
  if (index === 0 && max === SIZE - car.size) max = EXIT;
  return { min, max };
}

export function legalMove(cars: Vehicle[], positions: number[], move: Move) {
  if (!Number.isInteger(move.car) || move.car < 0 || move.car >= cars.length || !Number.isInteger(move.to)) return false;
  if (positions[0] === EXIT || move.to === positions[move.car]) return false;
  if (move.car === 0 && move.to === 5) return false;
  const range = bounds(cars, positions, move.car);
  return move.to >= range.min && move.to <= range.max;
}

export function nextPositions(positions: number[], move: Move) {
  const next = [...positions];
  next[move.car] = move.to;
  return next;
}

export function movesFrom(cars: Vehicle[], positions: number[]) {
  const grid = occupancy(cars, positions), moves: Move[] = [];
  if (positions[0] === EXIT) return moves;
  cars.forEach((_, car) => {
    const range = bounds(cars, positions, car, grid);
    for (let to = range.min; to <= range.max; to++) {
      if (to !== positions[car] && !(car === 0 && to === 5)) moves.push({ car, to });
    }
  });
  return moves;
}

export const starsFor = (moves: number, minimum: number) => moves <= minimum ? 3 : moves <= minimum + 5 ? 2 : 1;
