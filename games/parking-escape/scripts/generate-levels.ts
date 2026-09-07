import { writeFile } from 'node:fs/promises';
import { GARAGE, validLayout, type Level, type Vehicle } from '../src/rules.ts';
import { solve } from '../src/solver.ts';

let seed = 20260907;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const integer = (n: number) => Math.floor(random() * n);
const groups: Level[][] = [[], [], [], []];
const names = ['清晨出发', '街角相逢', '借个车位', '错峰出行', '各退一步', '小小调度', '转角之间', '礼让通行', '迂回有道', '车位交换', '忙里有序', '恰到好处', '环环相扣', '腾挪空间', '进退之间', '穿行街区', '静心调度', '柳暗花明', '拥挤时刻', '城市迷局', '步步为营', '解开连环', '最后一格', '出库大师'];
const layouts = new Set<string>();
for (let attempt = 0; groups.some(group => group.length < 6) && attempt < 50000; attempt++) {
  const cars: Vehicle[] = [{ id: 'X', axis: 'x', lane: 2, size: 2 }];
  const positions = [integer(3)];
  const order = GARAGE.slice(1).map(car => ({ car, rank: random() })).sort((a, b) => a.rank - b.rank);
  const target = 8 + integer(6);
  for (const { car } of order) {
    if (cars.length >= target) break;
    const size = GARAGE.findIndex(item => item.id === car.id) > 10 ? 3 : 2;
    for (let trial = 0; trial < 24; trial++) {
      const vehicle: Vehicle = { id: car.id, axis: random() < 0.5 ? 'x' : 'z', lane: integer(6), size };
      const position = integer(7 - size);
      if (validLayout([...cars, vehicle], [...positions, position])) {
        cars.push(vehicle); positions.push(position); break;
      }
    }
  }
  if (cars.length < 7) continue;
  const result = solve(cars, positions, 35000);
  if (result.status !== 'solved') continue;
  const minimum = result.moves.length;
  const difficulty = minimum < 7 ? 0 : minimum < 11 ? 1 : minimum < 17 ? 2 : 3;
  if (minimum < 4 || groups[difficulty].length >= 6) continue;
  const signature = cars.map((car, i) => `${car.axis}${car.lane}${car.size}${positions[i]}`).sort().join('');
  if (layouts.has(signature)) continue;
  layouts.add(signature);
  groups[difficulty].push({ id: 0, name: '', difficulty, minimum, cars, positions });
  console.log(`Found ${groups.flat().length}/24: ${minimum} moves, ${cars.length} cars, attempt ${attempt}`);
}
if (groups.some(group => group.length < 6)) throw new Error('Not enough verified levels');
const levels = groups.flatMap(group => group.sort((a, b) => a.minimum - b.minimum)).map((level, i) => ({ ...level, id: i + 1, name: names[i] }));
await writeFile(new URL('../src/levels.json', import.meta.url), `${JSON.stringify(levels, null, 2)}\n`);
