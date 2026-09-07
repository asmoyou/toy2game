import { writeFile } from 'node:fs/promises';
import { GARAGE, validLayout, type Level, type Vehicle } from '../src/rules.ts';
import { solve } from '../src/solver.ts';

const firstBatchNames = ['清晨出发', '街角相逢', '借个车位', '错峰出行', '各退一步', '小小调度', '转角之间', '礼让通行', '迂回有道', '车位交换', '忙里有序', '恰到好处', '环环相扣', '腾挪空间', '进退之间', '穿行街区', '静心调度', '柳暗花明', '拥挤时刻', '城市迷局', '步步为营', '解开连环', '最后一格', '出库大师'];
const secondBatchNames = [
  '晨光小巷', '早餐街口', '邻里让行', '树荫车位', '午后出游', '周末集市',
  '公园门前', '放学路上', '雨后街道', '晚风归途', '花店转角', '河畔停车',
  '书店相遇', '操场旁边', '面包飘香', '小桥借位', '林间驿站', '海边出发',
  '街坊互助', '顺路同行', '留点空间', '轻松换位', '慢慢来吧', '一路畅通',
  '双向礼让', '前后照应', '错位通行', '借道而行', '街区穿梭', '临时停靠',
  '来回调度', '横街纵巷', '先退后进', '找个空当', '轮流借位', '小城早高峰',
  '三车相逢', '空位接力', '车流交汇', '出口在望', '排队等候', '等待时机',
  '顺藤摸瓜', '盘活车位', '穿针引线', '留好退路', '稳步向前', '有序出发',
  '交错车阵', '连锁让行', '一退两进', '左右逢源', '见缝插针', '多走一步',
  '街巷回环', '步步相让', '拥堵疏导', '巧借长车', '长短相济', '转圜余地',
  '解开车结', '逆向思考', '腾出通道', '迂回穿行', '连环借位', '通路重组',
  '进退有方', '调度考验', '曲径通幽', '环城车流', '层层让路', '突破重围',
  '密集车阵', '多重借道', '深巷回声', '错综有序', '层层解锁', '狭路相让',
  '长车迷阵', '环线调度', '静候空位', '全盘统筹', '往返之间', '多步筹谋',
  '抽丝剥茧', '车阵深处', '峰回路转', '寸格必争', '重重关卡', '精密换位',
  '城市脉络', '连环破局', '出库远征', '最后通道', '调度专家', '终极调度',
];

// Ignore colors and vehicle ordering: swapping appearances does not make a new puzzle.
const signature = (level: Pick<Level, 'cars' | 'positions'>) => level.cars.map((car, i) => `${car.axis}${car.lane}${car.size}${level.positions[i]}`).sort().join('');

function generatePack(seedValue: number, perDifficulty: number, names: string[], existing: Level[] = []) {
  if (names.length !== perDifficulty * 4) throw new Error('Every level needs a name');
  let seed = seedValue;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const integer = (n: number) => Math.floor(random() * n);
  const groups: Level[][] = [[], [], [], []];
  const layouts = new Set(existing.map(signature));
  // Spread the second batch across move counts to include harder boards within each tier.
  const band = (minimum: number) => minimum < 17 ? minimum : minimum < 20 ? 17 : minimum < 23 ? 20 : 23;
  const quotas = [8, 6, 4, 8];
  for (let attempt = 0; groups.some(group => group.length < perDifficulty) && attempt < 150000; attempt++) {
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
    if (minimum < 4 || groups[difficulty].length >= perDifficulty) continue;
    if (existing.length && groups[difficulty].filter(level => band(level.minimum) === band(minimum)).length >= quotas[difficulty]) continue;
    const key = signature({ cars, positions });
    if (layouts.has(key)) continue;
    layouts.add(key);
    groups[difficulty].push({ id: 0, name: '', difficulty, minimum, cars, positions });
    console.log(`Found ${existing.length + groups.flat().length}/${existing.length + names.length}: ${minimum} moves, ${cars.length} cars, attempt ${attempt}`);
  }
  if (groups.some(group => group.length < perDifficulty)) throw new Error('Not enough verified levels');
  return groups.flatMap(group => group.sort((a, b) => a.minimum - b.minimum)).map((level, i) => ({ ...level, name: names[i] }));
}

// Number the complete collection after sorting, so every difficulty has a continuous range.
const firstBatch = generatePack(20260907, 6, firstBatchNames);
const levels = [...firstBatch, ...generatePack(20260908, 24, secondBatchNames, firstBatch)]
  .sort((a, b) => a.difficulty - b.difficulty || a.minimum - b.minimum)
  .map((level, i) => ({ ...level, id: i + 1 }));
await writeFile(new URL('../src/levels.json', import.meta.url), `${JSON.stringify(levels, null, 2)}\n`);
