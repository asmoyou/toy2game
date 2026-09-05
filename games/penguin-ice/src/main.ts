import { createIcons, Volume2, VolumeX, Settings2, RotateCcw, RotateCw, LocateFixed, LayoutGrid, Maximize, Minimize, X, Check, ArrowLeft, ArrowRight, Hammer, Snowflake, Trophy, ChevronRight, Heart, Users, Bot, UserRound } from 'lucide';
import { IceGame } from './scene';
import { GameAudio } from './audio';
import type { PenguinMood } from './penguin-mood';
import confetti from 'canvas-confetti';
import './style.css';
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';

recordVisit('penguin-ice');

const icons = { Volume2, VolumeX, Settings2, RotateCcw, RotateCw, LocateFixed, LayoutGrid, Maximize, Minimize, X, Check, ArrowLeft, ArrowRight, Hammer, Snowflake, Trophy, ChevronRight, Heart, Users, Bot, UserRound };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const colors = ['coral', 'teal', 'yellow', 'violet'];
const audio = new GameAudio();
let playerCount = 2;
let bots = [false, false, false, false];
let radius = 4;
let round = 1;
let turn = 0;
let move = 0;
let remaining = 61;
let phase: 'playing' | 'settling' | 'lost' = 'playing';
let losses = [0, 0, 0, 0];
let lossTimer: ReturnType<typeof setTimeout> | undefined;
let pendingCount = 2;
let pendingBots = [...bots];
let botTimer: ReturnType<typeof setTimeout> | undefined;
let pendingRadius = 4;
let lastFocus: HTMLElement | null = null;
let activeDialog: HTMLDialogElement | null = null;
let resultSeconds = 0;

try {
  const saved = JSON.parse(localStorage.getItem('penguin-preferences') || '{}');
  if ([2, 3, 4].includes(saved.playerCount)) playerCount = saved.playerCount;
  if (Array.isArray(saved.bots)) bots = bots.map((_, index) => index > 0 && saved.bots[index] === true);
  if ([3, 4].includes(saved.radius)) radius = saved.radius;
  audio.enabled = saved.sound !== false;
} catch { /* Private browsing may disable storage. */ }

function avatar(index: number, extra = '') {
  return `<span class="penguin-avatar ${colors[index]} ${extra}" aria-hidden="true"><span class="avatar-body"><span class="avatar-face"></span><span class="avatar-eye left"></span><span class="avatar-eye right"></span><span class="avatar-beak"></span><span class="avatar-cheek left"></span><span class="avatar-cheek right"></span></span><span class="avatar-hat"></span></span>`;
}

function playerName(index: number) { return `${bots[index] ? '机器人' : '玩家'} ${index + 1}`; }

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="${libraryUrl(import.meta.env.BASE_URL)}" aria-label="返回游戏大厅" title="返回游戏大厅">
      <span class="brand-mark"><i data-lucide="arrow-left"></i></span>
      <span><span class="brand-title">企鹅敲敲敲<span class="brand-dot">.</span></span><span class="brand-subtitle">ICE ICE PENGUIN</span></span>
    </a>
    <span class="header-tag"><span class="tiny-spark">✳</span> 快乐，就在这一敲</span>
    <nav class="tools" aria-label="游戏工具">
      <button class="icon-button" id="sound-button" aria-label="关闭音效" title="关闭音效"><i data-lucide="volume-2"></i></button>
      <button class="icon-button fullscreen-button" id="fullscreen-button" aria-label="全屏" title="全屏"><i data-lucide="maximize"></i></button>
      <button class="icon-button" id="settings-button" aria-label="游戏设置" title="游戏设置"><i data-lucide="settings-2"></i></button>
      <span class="tool-divider"></span>
      <button class="new-game-button" id="restart-button" aria-label="新的一局" title="新的一局"><i data-lucide="rotate-ccw"></i><span>新的一局</span></button>
    </nav>
  </header>
  <main class="game-area">
    <div id="scene" class="scene"><div class="loading" id="loading"><span class="loading-ice"></span>冰场准备中</div></div>
    <section class="turn-panel" aria-live="polite" aria-atomic="true">
      <div class="eyebrow"><span class="live-dot"></span> 冰上派对 <span class="eyebrow-divider">/</span> <span id="player-count-label">2 人对战</span></div>
      <h1 id="turn-heading">轮到你啦！</h1>
      <div class="current-player coral" id="current-player"><span class="current-player-marker"></span><span id="current-player-name">玩家 1</span><i data-lucide="hammer"></i></div>
      <div class="turn-progress" id="turn-progress"></div>
      <div class="penguin-status"><span class="status-line"></span><span id="penguin-status">小企鹅现在很淡定</span></div>
    </section>
    <section class="game-stats" aria-label="本局状态">
      <div class="round-label">ROUND <span id="round-number">01</span><span class="round-decoration">/</span><span class="round-cn">第 <span id="move-number">1</span> 手</span></div>
      <div class="ice-count"><span class="ice-count-icon"><i data-lucide="snowflake"></i></span><span><strong id="ice-count">61</strong><span class="ice-count-total"> / <span id="ice-total">61</span></span><small>剩余冰块</small></span></div>
    </section>
    <div class="scene-note" id="scene-note"><span class="note-dot"></span><span id="scene-note-text">今日冰况：稳稳当当</span></div>
    <div class="board-caption"><span class="little-cross">+</span> 一块薄冰，一点心跳 <span class="little-cross">+</span></div>
    <div class="ice-legend"><span class="legend-hex white"></span>雪白冰<span class="legend-hex blue"></span>海蓝冰</div>
    <div class="view-tools" role="group" aria-label="冰场视角">
      <button class="icon-button" data-view="left" aria-label="向左旋转视角" title="向左旋转视角"><i data-lucide="rotate-ccw"></i></button>
      <button class="icon-button" data-view="top" aria-label="俯视冰场" title="俯视冰场"><i data-lucide="layout-grid"></i></button>
      <button class="icon-button" data-view="reset" aria-label="恢复默认视角" title="恢复默认视角"><i data-lucide="locate-fixed"></i></button>
      <button class="icon-button" data-view="right" aria-label="向右旋转视角" title="向右旋转视角"><i data-lucide="rotate-cw"></i></button>
    </div>
  </main>
  <footer class="player-dock">
    <div class="dock-label"><span class="dock-label-title"><i data-lucide="users"></i> 本局玩家<button class="icon-button roster-button" id="roster-button" aria-label="设置机器人玩家" title="设置机器人玩家"><i data-lucide="bot"></i></button></span><span class="dock-round">第 <span id="dock-round-number">1</span> 场冰上派对</span></div>
    <div class="players" id="players"></div>
    <div class="dock-mood"><i data-lucide="heart"></i><span>友谊第一<small>企鹅也是</small></span></div>
  </footer>
  <dialog id="settings-dialog" aria-labelledby="settings-title">
    <form id="settings-form">
      <div class="dialog-header"><span class="dialog-eyebrow">LET'S PLAY TOGETHER</span><button type="button" class="icon-button close-dialog" aria-label="关闭设置"><i data-lucide="x"></i></button></div>
      <h2 id="settings-title">冰上派对设置</h2>
      <fieldset><legend>几个人一起玩？</legend><div class="segmented" id="player-options">${[2, 3, 4].map(count => `<button type="button" data-count="${count}" aria-pressed="${count === playerCount}"><i data-lucide="users"></i>${count} 人</button>`).join('')}</div></fieldset>
      <fieldset class="roster-field"><legend>玩家阵容</legend><div class="player-roles" id="player-roles"></div></fieldset>
      <fieldset><legend>冰场大小</legend><div class="segmented board-options" id="board-options"><button type="button" data-radius="3" aria-pressed="false"><span>小小冰场</span><small>37 块冰</small></button><button type="button" data-radius="4" aria-pressed="true"><span>大大冰场</span><small>61 块冰</small></button></div></fieldset>
      <label class="sound-setting"><span><i data-lucide="volume-2"></i>游戏音效</span><input type="checkbox" id="sound-setting" role="switch"><span class="switch-track"></span></label>
      <button type="submit" class="primary-button">开启新的一局<i data-lucide="arrow-right"></i></button>
    </form>
  </dialog>
  <dialog id="restart-dialog" aria-labelledby="restart-title">
    <div class="dialog-header"><span class="dialog-eyebrow">A FRESH START</span><button class="icon-button close-dialog" aria-label="取消"><i data-lucide="x"></i></button></div>
    <h2 id="restart-title">再铺一片新冰场？</h2>
    <p class="dialog-description">这一局还没结束，小企鹅已经准备好啦。</p>
    <div class="dialog-actions"><button class="secondary-button close-dialog">继续这局</button><button class="primary-button" id="confirm-restart">重新开局<i data-lucide="rotate-ccw"></i></button></div>
  </dialog>
  <dialog id="result-dialog" class="result-dialog" aria-labelledby="result-title">
    <canvas id="result-confetti" class="result-confetti" aria-hidden="true"></canvas>
    <div class="dialog-header"><span class="dialog-eyebrow">ICE ICE VICTORY</span><button class="icon-button close-dialog" aria-label="查看冰场"><i data-lucide="x"></i></button></div>
    <div class="victory-trophy"><span class="victory-spark first">+</span><i data-lucide="trophy"></i><span class="victory-spark second">+</span></div>
    <div class="result-eyebrow" id="result-round">第 1 场冰上派对</div>
    <h2 id="result-title">赢得漂亮！</h2>
    <div class="winner-lineup" id="result-winners"></div>
    <p class="result-cheer">稳稳站到最后，胜利属于你！</p>
    <div class="result-stats"><div><strong id="result-moves">0</strong><span>敲击次数</span></div><div><strong id="result-ice">0</strong><span>剩余冰块</span></div><div><strong id="result-duration">00:00</strong><span>本局用时</span></div></div>
    <div class="result-loser" id="result-loser"></div>
    <button class="primary-button" id="play-again">再来一局<i data-lucide="arrow-right"></i></button>
    <button class="text-button" id="change-players">换个阵容<i data-lucide="chevron-right"></i></button>
  </dialog>
  <div class="toast" id="toast" role="status"></div>
`;

const celebrate = confetti.create($<HTMLCanvasElement>('#result-confetti'), { resize: true, useWorker: false });

function refreshIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.8 } }); }

function savePreferences() {
  try { localStorage.setItem('penguin-preferences', JSON.stringify({ playerCount, bots, radius, sound: audio.enabled })); } catch { /* Storage is optional. */ }
}

function updateSound() {
  $('#sound-button').innerHTML = `<i data-lucide="${audio.enabled ? 'volume-2' : 'volume-x'}"></i>`;
  $('#sound-button').setAttribute('aria-label', audio.enabled ? '关闭音效' : '开启音效');
  $('#sound-button').setAttribute('title', audio.enabled ? '关闭音效' : '开启音效');
  $('#sound-button').setAttribute('aria-pressed', String(audio.enabled));
  $<HTMLInputElement>('#sound-setting').checked = audio.enabled;
  refreshIcons();
  savePreferences();
}

function renderPlayers() {
  $('#players').innerHTML = Array.from({ length: playerCount }, (_, i) => `
    <div class="player ${colors[i]} ${i === turn ? 'active' : ''} ${phase === 'lost' && i === turn ? 'has-lost' : ''}" aria-label="${playerName(i)}${i === turn ? phase === 'lost' ? '本局落水' : '当前回合' : ''}">
      ${avatar(i)}
      <span class="player-info"><strong>${playerName(i)}<span class="player-active-dot"></span></strong><small>${bots[i] ? '<i data-lucide="bot"></i>' : ''}${i === turn ? phase === 'lost' ? '这次先下水啦' : phase === 'settling' ? '冰面晃动中' : bots[i] ? '正在选冰块' : '本轮主角' : bots[i] ? '等待回合' : '等你出手'}</small></span>
      <span class="player-score" title="落水次数">${losses[i]}<small>落水</small></span>
      <span class="player-turn-marker"><i data-lucide="${phase === 'lost' ? 'snowflake' : 'hammer'}"></i></span>
    </div>`).join('');
  $('#players').style.setProperty('--player-count', String(playerCount));
  refreshIcons();
}

function renderStatus() {
  $('#current-player').className = `current-player ${colors[turn]}`;
  $('#current-player-name').textContent = playerName(turn);
  $('#turn-heading').textContent = phase === 'lost' ? '哎呀，掉下去啦！' : phase === 'settling' ? '稳住，稳住…' : bots[turn] ? '机器人思考中' : '轮到你啦！';
  $('#move-number').textContent = String(move + (phase === 'playing' ? 1 : 0));
  $('#round-number').textContent = String(round).padStart(2, '0');
  $('#dock-round-number').textContent = String(round);
  const botCount = bots.slice(0, playerCount).filter(Boolean).length;
  $('#player-count-label').textContent = botCount ? `${playerCount - botCount} 真人 · ${botCount} 机器人` : `${playerCount} 人对战`;
  $('#ice-count').textContent = String(remaining);
  $('#ice-total').textContent = String(radius === 4 ? 61 : 37);
  $('#turn-progress').innerHTML = Array.from({ length: playerCount }, (_, i) => `<span class="progress-segment ${colors[i]} ${i === turn ? 'active' : ''}"></span>`).join('');
  renderPenguinStatus(game?.getMood() ?? 'happy');
  renderPlayers();
  syncTurn();
}

function renderPenguinStatus(mood: PenguinMood) {
  const text: Record<PenguinMood, [string, string]> = {
    happy: ['小企鹅开心得想跳舞', '今日冰况：稳稳当当'],
    alert: ['小企鹅开始左顾右盼', '今日冰况：有点松动'],
    surprised: ['哎呀！吓了小企鹅一跳', '冰面震动中…'],
    scared: ['小企鹅正在努力保持平衡', '今日冰况：心跳时刻'],
    falling: ['小企鹅先去游个泳', '今日冰况：扑通一声！'],
    swimming: ['小企鹅正在海里扑腾', '冰上派对：水花时间'],
  };
  $('#penguin-status').textContent = text[mood][0];
  $('#scene-note-text').textContent = text[mood][1];
  $('#scene-note').classList.toggle('danger', mood === 'scared' || mood === 'falling' || mood === 'swimming');
}

function renderResultStats() {
  $('#result-moves').textContent = String(move);
  $('#result-ice').textContent = String(remaining);
  $('#result-duration').textContent = `${String(Math.floor(resultSeconds / 60)).padStart(2, '0')}:${String(resultSeconds % 60).padStart(2, '0')}`;
}

function prepareResult() {
  const winners = Array.from({ length: playerCount }, (_, i) => i).filter(i => i !== turn);
  $('#result-round').textContent = `第 ${round} 场冰上派对`;
  $('#result-title').textContent = winners.length === 1 ? `${playerName(winners[0])}，赢啦！` : '胜利属于你们！';
  $('#result-winners').innerHTML = winners.map((i, index) => `<div class="winner" style="--winner-delay:${index * 90}ms">${avatar(i)}<strong>${playerName(i)}</strong><span>本局获胜</span></div>`).join('');
  $('#result-loser').innerHTML = `<i data-lucide="snowflake"></i><span>${playerName(turn)}先下水啦</span><span class="loser-aside">下一局再见！</span>`;
  resultSeconds = Math.floor(game.getState().elapsed);
  renderResultStats();
  refreshIcons();
}

function cancelBotTurn() {
  clearTimeout(botTimer);
  botTimer = undefined;
}

function syncTurn() {
  cancelBotTurn();
  game?.setHumanInput(!bots[turn] && phase === 'playing');
  if (!game || !bots[turn] || phase !== 'playing' || activeDialog || document.hidden) return;
  const scheduledRound = round, scheduledTurn = turn;
  botTimer = setTimeout(() => {
    botTimer = undefined;
    if (round !== scheduledRound || turn !== scheduledTurn || activeDialog || document.hidden || phase !== 'playing') return;
    const id = game.chooseBotMove();
    if (id) game.strike(id);
  }, 1000 + Math.random() * 450);
}

let game: IceGame;
try {
  game = new IceGame($('#scene'), {
    onReady: () => $('#loading')?.remove(),
    onMoodChange: renderPenguinStatus,
    onStrike: () => {
      cancelBotTurn();
      move++;
      phase = 'settling';
      renderStatus();
    },
    onHit: count => {
      remaining = count;
      audio.unlock();
      audio.hit();
      renderStatus();
    },
    onChange: count => {
      remaining = count;
      if (phase === 'lost') renderResultStats();
      renderStatus();
    },
    onSettled: () => {
      turn = (turn + 1) % playerCount;
      phase = 'playing';
      audio.turn();
      renderStatus();
    },
    onLose: () => {
      phase = 'lost';
      cancelBotTurn();
      losses[turn]++;
      audio.fall();
      renderStatus();
      prepareResult();
      lossTimer = setTimeout(() => {
        openDialog('result-dialog');
        audio.win();
        const options = { particleCount: 65, spread: 75, startVelocity: 27, gravity: 0.9, ticks: 160, colors: ['#f18c77', '#68b9b0', '#e8be61', '#a3d9e5', '#ffffff'], disableForReducedMotion: true };
        void celebrate({ ...options, angle: 65, origin: { x: 0.08, y: 0.45 } });
        void celebrate({ ...options, angle: 115, origin: { x: 0.92, y: 0.45 } });
      }, 1450);
    }
  });
  if (radius !== 4) game.reset(radius);
  remaining = radius === 4 ? 61 : 37;
  if (import.meta.env.DEV) {
    Object.assign(window, { __iceGame: { getState: () => ({ ...game.getState(), turn, move, phase, playerCount, bots: bots.slice(0, playerCount), round, remaining }) } });
  }
} catch (error) {
  $('#loading').innerHTML = '<span>冰场暂时没能打开</span><small>请使用 Safari 或 Chrome 重新打开。</small><button onclick="location.reload()">重新加载</button>';
  console.error(error);
}

function openDialog(id: string) {
  cancelBotTurn();
  if (activeDialog?.id === 'result-dialog') celebrate.reset();
  if (!activeDialog) lastFocus = document.activeElement as HTMLElement;
  if (activeDialog) activeDialog.close();
  activeDialog = $<HTMLDialogElement>(`#${id}`);
  game?.setPaused(true);
  activeDialog.showModal();
}

function closeDialog() {
  celebrate.reset();
  activeDialog?.close();
  activeDialog = null;
  game?.setPaused(document.hidden);
  lastFocus?.focus();
  syncTurn();
}

function newRound(resetScores = false) {
  cancelBotTurn();
  clearTimeout(lossTimer);
  closeDialog();
  if (resetScores) losses = [0, 0, 0, 0];
  round++;
  turn = 0;
  move = 0;
  remaining = radius === 4 ? 61 : 37;
  phase = 'playing';
  game?.reset(radius);
  audio.unlock();
  audio.start();
  renderStatus();
  savePreferences();
}

function openSettings() {
  pendingCount = playerCount;
  pendingBots = [...bots];
  pendingRadius = radius;
  updateOptions();
  openDialog('settings-dialog');
}

function updateOptions() {
  document.querySelectorAll<HTMLButtonElement>('[data-count]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === pendingCount)));
  document.querySelectorAll<HTMLButtonElement>('[data-radius]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.radius) === pendingRadius)));
  $('#player-roles').innerHTML = Array.from({ length: pendingCount }, (_, i) => `
    <div class="role-row"><span class="role-name ${colors[i]}"><span class="current-player-marker"></span>玩家 ${i + 1}</span>
      ${i === 0 ? '<span class="human-seat"><i data-lucide="user-round"></i>真人</span>' : `<div class="segmented role-control" aria-label="玩家 ${i + 1} 类型"><button type="button" data-seat="${i}" data-bot="false" aria-pressed="${!pendingBots[i]}" aria-label="玩家 ${i + 1} 设为真人"><i data-lucide="user-round"></i>真人</button><button type="button" data-seat="${i}" data-bot="true" aria-pressed="${pendingBots[i]}" aria-label="玩家 ${i + 1} 设为机器人"><i data-lucide="bot"></i>机器人</button></div>`}
    </div>`).join('');
  refreshIcons();
}

$('#sound-button').addEventListener('click', () => { audio.enabled = !audio.enabled; audio.unlock(); updateSound(); if (audio.enabled) audio.turn(); });
$('#sound-setting').addEventListener('change', () => { audio.enabled = $<HTMLInputElement>('#sound-setting').checked; audio.unlock(); updateSound(); });
$('#settings-button').addEventListener('click', openSettings);
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => game?.adjustView(button.dataset.view as 'left' | 'right' | 'top' | 'reset')));
$('#roster-button').addEventListener('click', openSettings);
$('#player-roles').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-seat]');
  if (!button) return;
  pendingBots[Number(button.dataset.seat)] = button.dataset.bot === 'true';
  updateOptions();
  $<HTMLButtonElement>(`[data-seat="${button.dataset.seat}"][data-bot="${button.dataset.bot}"]`).focus();
});
$('#restart-button').addEventListener('click', () => { if (move && phase !== 'lost') openDialog('restart-dialog'); else newRound(); });
$('#confirm-restart').addEventListener('click', () => newRound());
$('#play-again').addEventListener('click', () => newRound());
$('#change-players').addEventListener('click', openSettings);
$('#scene').addEventListener('pointerdown', () => audio.unlock());
document.querySelectorAll('[data-count]').forEach(button => button.addEventListener('click', () => { pendingCount = Number((button as HTMLElement).dataset.count); updateOptions(); }));
document.querySelectorAll('[data-radius]').forEach(button => button.addEventListener('click', () => { pendingRadius = Number((button as HTMLElement).dataset.radius); updateOptions(); }));
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const changed = playerCount !== pendingCount || bots.some((value, index) => value !== pendingBots[index]);
  playerCount = pendingCount;
  bots = [...pendingBots];
  radius = pendingRadius;
  newRound(changed);
});
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', closeDialog));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
});

let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}

if (!document.fullscreenEnabled) $('#fullscreen-button').hidden = true;
$('#fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('当前浏览器暂不支持全屏'); }
});
document.addEventListener('fullscreenchange', () => {
  const full = Boolean(document.fullscreenElement);
  $('#fullscreen-button').innerHTML = `<i data-lucide="${full ? 'minimize' : 'maximize'}"></i>`;
  $('#fullscreen-button').setAttribute('aria-label', full ? '退出全屏' : '全屏');
  $('#fullscreen-button').setAttribute('title', full ? '退出全屏' : '全屏');
  refreshIcons();
});
document.addEventListener('visibilitychange', () => { game?.setPaused(document.hidden || Boolean(activeDialog)); syncTurn(); });
window.addEventListener('pagehide', savePreferences);
updateSound();
renderStatus();
