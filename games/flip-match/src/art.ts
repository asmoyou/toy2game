export const FACES = ['小兔', '狐狸', '棕熊', '熊猫', '小猫', '青蛙', '考拉', '狮子', '企鹅', '小猪', '小鼠', '小鸡', '草莓', '橙子', '西瓜', '香蕉', '葡萄', '樱桃', '苹果', '梨子', '菠萝', '牛油果', '蜜桃', '柠檬'];
const cache = new Map<number, HTMLCanvasElement>();
const backgrounds = ['#f8dce3', '#deedf8', '#fff0ce', '#e5eddd', '#f7e6cb', '#e6f1cf', '#e5e1f5', '#fce8bf', '#ddecf4', '#f7e0de', '#dee6f9', '#e4efd6'];

export function faceCanvas(id: number) {
  if (cache.has(id)) return cache.get(id)!;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
  const c = canvas.getContext('2d')!;
  c.scale(3, 3); c.lineCap = 'round'; c.lineJoin = 'round';
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string, angle = 0) => { c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); c.fill(); };
  const path = (points: number[][], color: string) => { c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
  const line = (points: number[][], color: string, width = 2) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); };
  const leaf = (x: number, y: number, angle = -0.5) => ellipse(x, y, 12, 5, '#729953', angle);
  const eyes = (y = 66, gap = 16) => {
    for (const x of [64 - gap, 64 + gap]) { ellipse(x, y, 3.1, 4.1, '#534535'); ellipse(x - 0.7, y - 1.3, 0.8, 1, '#fff9e9'); }
    ellipse(64 - gap - 7, y + 8, 5.5, 3, '#efb0a0'); ellipse(64 + gap + 7, y + 8, 5.5, 3, '#efb0a0');
    c.strokeStyle = '#745143'; c.lineWidth = 2; c.beginPath(); c.arc(64, y + 4, 6, 0.2, Math.PI - 0.2); c.stroke();
  };
  ellipse(64, 64, 64, 64, backgrounds[(id + 12) % 12]);
  ellipse(28, 24, 2, 2, '#ffffffaa'); ellipse(105, 78, 2, 2, '#ffffffaa');
  ellipse(96, 30, 3, 3, '#ffffff88'); ellipse(22, 95, 3, 3, '#ffffff88');

  if (id < 0) {
    ellipse(64, 64, 64, 64, '#f5d66e');
    c.strokeStyle = '#e0b746'; c.lineWidth = 1.1; c.beginPath(); c.arc(64, 64, 47, 0, Math.PI * 2); c.stroke();
    const points = Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 14 : 27; return [64 + Math.cos(a) * r, 61 + Math.sin(a) * r]; });
    path(points.map(([x, y]) => [x, y + 2]), '#ffebb0'); path(points, '#dcb047');
    ellipse(54, 58, 1.8, 2.3, '#b38b31'); ellipse(72, 58, 1.8, 2.3, '#b38b31');
    c.strokeStyle = '#b38b31'; c.lineWidth = 1.5; c.beginPath(); c.arc(63, 61, 4.3, 0.2, Math.PI - 0.2); c.stroke();
    for (const x of [54, 64, 74]) ellipse(x, 100, 1.5, 1.5, '#c5a23f');
  } else if (id <= 11) {
    if (id === 0) {
      ellipse(47, 37, 10, 25, '#fffdf3', -0.16); ellipse(79, 37, 10, 25, '#fffdf3', 0.16);
      ellipse(47, 34, 4.5, 16, '#efb8bc', -0.16); ellipse(79, 34, 4.5, 16, '#efb8bc', 0.16);
      ellipse(64, 70, 34, 29, '#fffdf3'); eyes(68); ellipse(64, 75, 3, 2, '#d99295');
    } else if (id === 1 || id === 4) {
      const fur = id === 1 ? '#ec9a48' : '#d8aa78';
      path([[30, 58], [31, 24], [53, 44], [75, 44], [97, 24], [98, 58]], fur);
      path([[35, 43], [35, 31], [48, 44]], '#edbbaf'); path([[80, 44], [93, 31], [93, 45]], '#edbbaf');
      ellipse(64, 68, 36, 29, fur);
      if (id === 1) { path([[29, 61], [64, 76], [99, 61], [86, 88], [64, 101], [42, 88]], '#fff6dc'); }
      else { line([[57, 44], [59, 53]], '#a4784b', 3); line([[70, 44], [69, 52]], '#a4784b', 3); line([[25, 74], [40, 77]], '#a4784b'); line([[88, 77], [103, 74]], '#a4784b'); }
      eyes(66); ellipse(64, 76, 4, 3, '#6b5140');
    } else if ([2, 3, 6, 7, 10].includes(id)) {
      const fur = ({ 2: '#b98255', 3: '#fffcef', 6: '#a8b8bd', 7: '#f3c75f', 10: '#afbdd1' } as Record<number, string>)[id];
      const ear = id === 3 ? '#535352' : fur;
      if (id === 7) { for (let i = 0; i < 12; i++) ellipse(64 + Math.cos(i * Math.PI / 6) * 30, 66 + Math.sin(i * Math.PI / 6) * 30, 13, 13, '#b87d42'); }
      ellipse(33, 42, id === 6 || id === 10 ? 19 : 14, id === 6 || id === 10 ? 20 : 14, ear);
      ellipse(95, 42, id === 6 || id === 10 ? 19 : 14, id === 6 || id === 10 ? 20 : 14, ear);
      ellipse(33, 43, 8, 9, id === 3 ? '#757573' : '#edd1be'); ellipse(95, 43, 8, 9, id === 3 ? '#757573' : '#edd1be');
      ellipse(64, 68, 35, 32, fur);
      if (id === 3) { ellipse(48, 64, 10, 13, '#535352', 0.3); ellipse(80, 64, 10, 13, '#535352', -0.3); }
      if (id === 2 || id === 7) ellipse(64, 81, 19, 13, '#fce6bb');
      eyes(65); ellipse(64, 75, id === 6 ? 8 : 4, id === 6 ? 12 : 3, id === 10 ? '#dd9faa' : '#695448');
      if (id === 3) { ellipse(48, 63, 2, 2, '#fff8e6'); ellipse(80, 63, 2, 2, '#fff8e6'); }
    } else if (id === 5) {
      ellipse(64, 70, 37, 29, '#91b968');
      ellipse(43, 47, 14, 16, '#91b968'); ellipse(85, 47, 14, 16, '#91b968');
      ellipse(43, 47, 9, 10, '#fff9dc'); ellipse(85, 47, 9, 10, '#fff9dc');
      ellipse(43, 48, 3, 4, '#4c583e'); ellipse(85, 48, 3, 4, '#4c583e');
      ellipse(39, 75, 6, 3, '#eab29a'); ellipse(89, 75, 6, 3, '#eab29a');
      c.strokeStyle = '#56723f'; c.lineWidth = 2.4; c.beginPath(); c.arc(64, 66, 17, 0.3, Math.PI - 0.3); c.stroke();
    } else if (id === 8) {
      ellipse(64, 66, 32, 38, '#667f8b'); ellipse(64, 78, 25, 24, '#fff8df');
      ellipse(50, 55, 13, 15, '#fff8df'); ellipse(78, 55, 13, 15, '#fff8df');
      ellipse(50, 57, 3, 4, '#43535b'); ellipse(78, 57, 3, 4, '#43535b');
      path([[57, 65], [71, 65], [64, 73]], '#e9b348'); ellipse(46, 100, 10, 4, '#e9b348'); ellipse(82, 100, 10, 4, '#e9b348');
    } else if (id === 9) {
      path([[32, 58], [27, 29], [51, 42], [77, 42], [101, 29], [96, 58]], '#e6a5a9');
      ellipse(64, 68, 35, 32, '#efbbbc'); eyes(64); ellipse(64, 82, 17, 11, '#df989f'); ellipse(58, 81, 2.5, 3.5, '#b9727e'); ellipse(70, 81, 2.5, 3.5, '#b9727e');
    } else {
      ellipse(64, 68, 33, 33, '#f5cc58'); ellipse(55, 34, 4, 10, '#e5ae43', -0.3); ellipse(65, 31, 4, 11, '#e5ae43', 0.1);
      eyes(65); path([[58, 76], [70, 76], [64, 82]], '#d79436'); ellipse(32, 79, 9, 16, '#eebd48', -0.4); ellipse(96, 79, 9, 16, '#eebd48', 0.4);
    }
  } else {
    if (id === 12) {
      c.fillStyle = '#e7837e'; c.beginPath(); c.moveTo(31, 51); c.bezierCurveTo(32, 24, 96, 24, 97, 51); c.bezierCurveTo(97, 73, 77, 97, 64, 102); c.bezierCurveTo(51, 97, 31, 73, 31, 51); c.fill();
      for (const [x, y] of [[42, 52], [63, 44], [85, 52], [48, 76], [80, 76], [64, 90]]) ellipse(x, y, 1.6, 3, '#ffe6ae', 0.2);
      path([[64, 26], [57, 36], [40, 35], [48, 44], [61, 42], [70, 46], [79, 35], [69, 35]], '#719757');
    } else if (id === 13 || id === 23) {
      ellipse(64, 69, id === 13 ? 34 : 39, id === 13 ? 33 : 27, id === 13 ? '#f1b054' : '#eed363', id === 23 ? -0.25 : 0);
      leaf(75, 32, 0.1); line([[63, 37], [63, 26]], '#8b8750', 3);
      for (const [x, y] of [[43, 52], [85, 74], [55, 89], [36, 74]]) ellipse(x, y, 1, 1.5, '#d8984b');
    } else if (id === 14) {
      c.fillStyle = '#8aaa62'; c.beginPath(); c.arc(64, 48, 44, 0, Math.PI); c.fill();
      c.fillStyle = '#f6e5ad'; c.beginPath(); c.arc(64, 48, 38, 0, Math.PI); c.fill();
      c.fillStyle = '#e88885'; c.beginPath(); c.arc(64, 48, 33, 0, Math.PI); c.fill();
      for (const [x, y] of [[42, 56], [64, 54], [85, 56], [54, 75], [76, 75]]) ellipse(x, y, 1.5, 2.6, '#795f4c', 0.1);
    } else if (id === 15) {
      c.fillStyle = '#eecb60'; c.beginPath(); c.moveTo(33, 32); c.bezierCurveTo(31, 77, 77, 96, 100, 45); c.bezierCurveTo(102, 99, 28, 121, 25, 50); c.closePath(); c.fill();
      line([[31, 32], [29, 25]], '#8b7e4a', 5); ellipse(61, 86, 3, 4, '#776240'); ellipse(80, 78, 3, 4, '#776240');
      cache.set(id, canvas); return canvas;
    } else if (id === 16) {
      for (const [x, y] of [[47, 47], [76, 47], [36, 66], [62, 66], [88, 65], [49, 87], [75, 86], [64, 102]]) ellipse(x, y, 14, 14, '#a38ac2');
      leaf(78, 25); line([[63, 39], [63, 21]], '#899057', 3);
    } else if (id === 17) {
      line([[38, 73], [70, 28], [86, 76]], '#7c9856', 3); leaf(78, 30, 0.3);
      ellipse(38, 78, 22, 23, '#ca6f78'); ellipse(87, 82, 22, 23, '#d98087');
      ellipse(32, 72, 3, 4, '#f7c6ba'); ellipse(81, 76, 3, 4, '#f7c6ba');
      eyes(80, 25); cache.set(id, canvas); return canvas;
    } else if (id === 18 || id === 22) {
      ellipse(49, 69, 24, 31, id === 18 ? '#d98076' : '#eeafa0', -0.22); ellipse(79, 69, 24, 31, id === 18 ? '#e48a7b' : '#efba9e', 0.22);
      line([[64, 43], [62, 25]], '#90724a', 3); leaf(78, 32); if (id === 22) line([[64, 55], [60, 76], [64, 94]], '#da958c', 1.5);
    } else if (id === 19) {
      ellipse(64, 51, 20, 22, '#bfca78'); ellipse(64, 76, 32, 29, '#c9d68b'); line([[63, 33], [69, 22]], '#977b4f', 4); leaf(80, 29, 0.3);
    } else if (id === 20) {
      ellipse(64, 75, 29, 34, '#e8bc67');
      for (let x = 35; x < 92; x += 14) line([[x, 51], [x + 20, 97]], '#c99d51', 1.2);
      for (let x = 36; x < 95; x += 14) line([[x, 98], [x + 17, 51]], '#c99d51', 1.2);
      path([[64, 48], [41, 28], [59, 32], [65, 14], [71, 33], [86, 26], [79, 46]], '#829f62');
    } else if (id === 21) {
      ellipse(64, 48, 20, 23, '#88a868'); ellipse(64, 76, 34, 30, '#88a868'); ellipse(64, 49, 14, 17, '#e1de9d'); ellipse(64, 75, 27, 24, '#e1de9d'); ellipse(64, 79, 15, 15, '#b58c60');
      eyes(55, 10); cache.set(id, canvas); return canvas;
    }
    eyes(id === 14 ? 64 : 65, id === 20 ? 13 : 16);
  }
  cache.set(id, canvas); return canvas;
}

const urls = new Map<number, string>();
export function faceImage(id: number) { if (!urls.has(id)) urls.set(id, faceCanvas(id).toDataURL()); return urls.get(id)!; }
