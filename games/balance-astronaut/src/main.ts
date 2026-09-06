import { createIcons, ArrowLeft, ArrowRight, ArrowDownToLine, CircleHelp, Settings2, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, LocateFixed, Grid2X2, Pause, Play, X, Dices, Orbit, Users, Bot, UserRound, Trophy, Check, Sparkles } from 'lucide';
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';
import { BalanceGame } from './game';
import { BalanceScene } from './scene';
import { GameAudio } from './audio';
import { SLOTS, PLAYER_COLORS, PLAYER_NAMES, SETTINGS_KEY, parseSettings } from './board';
import './style.css';

const icons = { ArrowLeft, ArrowRight, ArrowDownToLine, CircleHelp, Settings2, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, LocateFixed, Grid2X2, Pause, Play, X, Dices, Orbit, Users, Bot, UserRound, Trophy, Check, Sparkles };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const button = (id: string, name: string, glyph: string, extra = '') => `<button type="button" id="${id}" class="icon-button ${extra}" aria-label="${name}" data-tooltip="${name}">${icon(glyph)}</button>`;
const helmet = (owner: number, small = false) => `<span class="helmet ${small ? 'small' : ''}" style="--team:${PLAYER_COLORS[owner]}" aria-hidden="true"><span></span></span>`;
let settings = parseSettings(null);
try { settings = parseSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')); } catch { /* Preferences are optional. */ }
const audio = new GameAudio();
audio.enabled = settings.sound;
let game = new BalanceGame(settings);
let scene: BalanceScene | undefined;
let activeDialog: HTMLDialogElement | null = null;
let lastFocus: HTMLElement | null = null;
let userPaused = false;
let lastRevision = -1;
let previousPhase = game.phase;
let previousMoves = 0;
let previousTurn = 0;
let finishCountdown = -1;
let frameTime = performance.now();
let telemetryAt = 0;
let session = 1;
let wins = [0, 0, 0, 0];
let resultCounted = false;
let spinTimer: ReturnType<typeof setTimeout> | undefined;
let spinRotation = 0;
let draftCount = settings.count;
let draftBots = [...settings.bots];
recordVisit('balance-astronaut');

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="${libraryUrl(import.meta.env.BASE_URL)}" aria-label="返回游戏大厅" title="返回游戏大厅">
      <span class="brand-back">${icon('arrow-left')}</span><span class="brand-symbol">${icon('orbit')}</span>
      <span><h1>平衡太空人</h1><span class="brand-english">BALANCE ASTRONAUT</span></span>
    </a>
    <div class="header-label"><span></span> 一起，稳稳着陆</div>
    <nav class="header-tools" aria-label="游戏工具">
      ${button('rules-button', '游戏规则', 'circle-help')}
      ${button('sound-button', '关闭音效', 'volume-2')}
      ${button('fullscreen-button', '全屏', 'maximize', 'fullscreen-button')}
      ${button('settings-button', '游戏设置', 'settings-2')}
      <span class="tool-divider"></span>
      <button class="restart-button" id="restart-button">${icon('rotate-ccw')}<span>新的一局</span></button>
    </nav>
  </header>
  <main class="play-area">
    <div id="space-scene" class="scene-host"><div id="loading" class="scene-loading"><span class="loading-mark">${icon('orbit')}</span>空间站准备中</div></div>
    <section class="turn-panel" aria-live="polite" aria-atomic="true">
      <div class="eyebrow"><span class="live-dot"></span><span id="mode-label">轮流放置</span><span class="mini-divider">/</span><span id="session-label">第 01 局</span></div>
      <h2 id="turn-heading">轮到你啦</h2>
      <div class="active-crew" id="active-crew"></div>
      <div class="turn-description" id="turn-description">等待登舱</div>
      <div class="turn-steps" id="turn-steps" aria-hidden="true"></div>
    </section>
    <section class="balance-panel" aria-label="平台平衡状态">
      <div class="eyebrow">平衡监测 <span class="monitor-dot"></span></div>
      <div class="balance-dial" aria-hidden="true"><span class="dial-axis horizontal"></span><span class="dial-axis vertical"></span><span class="dial-inner"></span><span class="dial-dot" id="dial-dot"></span></div>
      <div class="tilt-reading"><strong id="tilt-value">0.0</strong><span>°</span></div>
      <div class="balance-word" id="balance-word">稳稳当当</div>
    </section>
    <div class="scene-bottom"><div class="crew-count"><span class="count-icon">${icon('users')}</span><div><strong id="crew-count">00</strong><span> / ${SLOTS.length}</span><small>已登舱太空人</small></div></div><span class="scene-coordinate">ORBITAL STATION <span>01</span></span></div>
    <div class="view-tools" role="group" aria-label="平台视角">
      ${button('view-left', '向左旋转视角', 'rotate-ccw')}${button('view-top', '俯视平台', 'grid2-x2')}${button('view-reset', '恢复默认视角', 'locate-fixed')}${button('view-right', '向右旋转视角', 'rotate-cw')}
    </div>
    <div class="paused-state" id="paused-state" hidden><span>${icon('pause')}</span><h2>休息一下</h2><button class="primary-button" id="resume-button">${icon('play')}继续游戏</button></div>
  </main>
  <footer class="game-dock">
    <div class="crew-roster"><div class="dock-heading"><span>${icon('users')}本局队伍</span><span id="round-label">第 1 轮</span></div><div class="players" id="players"></div></div>
    <div class="move-station">
      <div class="move-top"><span class="eyebrow" id="action-label">本回合</span>${button('pause-button', '暂停游戏', 'pause')}</div>
      <div class="move-controls">
        <div class="die" id="die" aria-label="本回合放置 1 位"><div class="die-grid">${Array.from({ length: 9 }, (_, i) => `<span data-pip="${i}"></span>`).join('')}</div></div>
        <div class="move-status"><strong id="remaining-label">还需放置 1 位</strong><span id="movement-state">等待登舱</span></div>
        ${button('slot-button', '停靠位列表', 'grid2-x2')}
        <button class="primary-button place-button" id="action-button" hidden>${icon('dices')}<span>掷骰子</span></button>
      </div>
    </div>
  </footer>
  <dialog id="rules-dialog" aria-labelledby="rules-title">
    <div class="dialog-top"><span class="eyebrow">MISSION BRIEF</span>${button('close-rules', '关闭规则', 'x', 'close-dialog')}</div>
    <h2 id="rules-title">一起保持平衡</h2>
    <div class="rules-visual">${helmet(0)}<span>${icon('orbit')}</span>${helmet(1)}</div>
    <ol class="rules-list"><li><strong>轮流登舱</strong><p>从空盘开始，每回合放置 1 位太空人；骰子挑战中，按点数逐一放置。</p></li><li><strong>等它稳一稳</strong><p>每位太空人都会改变平台的重心，平台稳定后才能继续。</p></li><li><strong>别让队员倒下</strong><p>有队员倒下或滑落时，当前玩家失败，其余队伍获胜。全部站稳 ${SLOTS.length} 个位置，全员共同获胜。</p></li></ol>
    <button class="primary-button wide close-dialog">${icon('check')}准备好了</button>
  </dialog>
  <dialog id="settings-dialog" aria-labelledby="settings-title">
    <form id="settings-form"><div class="dialog-top"><span class="eyebrow">CREW ASSEMBLY</span>${button('close-settings', '关闭设置', 'x', 'close-dialog')}</div><h2 id="settings-title">空间站设置</h2>
      <fieldset><legend>游戏模式</legend><div class="mode-options"><label><input type="radio" name="mode" value="classic"><span>${icon('arrow-down-to-line')}轮流放置</span></label><label><input type="radio" name="mode" value="dice"><span>${icon('dices')}骰子挑战</span></label></div></fieldset>
      <fieldset><legend>队伍数量</legend><div id="player-count" class="count-options" role="group" aria-label="队伍数量">${[2, 3, 4].map(count => `<button type="button" data-count="${count}" aria-pressed="false">${icon('users')}${count} 支队伍</button>`).join('')}</div></fieldset>
      <div id="roster-settings">${PLAYER_NAMES.map((name, index) => `<div class="roster-row" data-player="${index}">${helmet(index, true)}<strong>${name}</strong><div class="seat-roles" role="group" aria-label="${name}席位类型">${[false, true].map(bot => `<button type="button" data-owner="${index}" data-bot="${bot}" aria-label="${name}设为${bot ? '机器人' : '真人'}" aria-pressed="false">${icon(bot ? 'bot' : 'user-round')}${bot ? '机器人' : '真人'}</button>`).join('')}</div></div>`).join('')}</div>
      <p id="roster-summary" class="roster-summary" aria-live="polite"></p>
      <div class="setting-row"><label for="setting-sound">游戏音效</label><input id="setting-sound" name="sound" type="checkbox" role="switch"></div>
      <button type="submit" class="primary-button wide">开启新的一局${icon('arrow-right')}</button>
    </form>
  </dialog>
  <dialog id="restart-dialog" aria-labelledby="restart-title"><div class="dialog-top"><span class="eyebrow">NEW MISSION</span>${button('close-restart', '取消重开', 'x', 'close-dialog')}</div><h2 id="restart-title">重新集合？</h2><p class="dialog-description">当前的登舱进度将重新开始。</p><div class="dialog-actions"><button class="secondary-button close-dialog">继续这局</button><button class="primary-button" id="confirm-restart">${icon('rotate-ccw')}重新开局</button></div></dialog>
  <dialog id="slots-dialog" aria-labelledby="slots-title"><div class="dialog-top"><span class="eyebrow">DOCKING POSITIONS</span>${button('close-slots', '关闭选位', 'x', 'close-dialog')}</div><h2 id="slots-title">停靠位</h2><div id="slot-grid" class="slot-grid"></div></dialog>
  <dialog id="result-dialog" class="result-dialog" aria-labelledby="result-title">
    <div class="dialog-top"><span class="eyebrow">MISSION COMPLETE</span>${button('close-result', '查看空间站', 'x', 'close-dialog')}</div>
    <div class="result-orbit">${icon('trophy')}</div><h2 id="result-title">任务完成</h2><p class="result-description" id="result-description"></p><div class="winner-lineup" id="winner-lineup"></div>
    <div class="result-stats"><div><strong id="result-moves">0</strong><span>登舱次数</span></div><div><strong id="result-time">00:00</strong><span>任务用时</span></div><div><strong id="result-tilt">0°</strong><span>最大倾角</span></div></div>
    <button class="primary-button wide" id="play-again">再来一局${icon('arrow-right')}</button><button class="text-button" id="wheel-button">${icon('sparkles')}趣味转盘</button>
  </dialog>
  <dialog id="wheel-dialog" aria-labelledby="wheel-title"><div class="dialog-top"><span class="eyebrow">BONUS MISSION</span>${button('close-wheel', '关闭转盘', 'x', 'close-dialog')}</div><h2 id="wheel-title">来点小惊喜</h2><div class="wheel-stage"><span class="wheel-pointer"></span><canvas id="wheel" width="640" height="640" role="img" aria-label="六项趣味任务转盘"></canvas><span class="wheel-center">${icon('sparkles')}</span></div><p id="wheel-result" class="wheel-result" aria-live="polite">今日太空任务</p><button class="primary-button wide" id="spin-button">${icon('rotate-cw')}转动转盘</button></dialog>
`;

function refreshIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.8 } }); }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ } }
function syncPause() {
  game.paused = userPaused || Boolean(activeDialog) || document.hidden;
  audio.suspend(game.paused);
  $('#paused-state').hidden = !userPaused;
  const label = userPaused ? '继续游戏' : '暂停游戏';
  $('#pause-button').setAttribute('aria-label', label);
  $('#pause-button').dataset.tooltip = label;
  $('#pause-button').innerHTML = icon(userPaused ? 'play' : 'pause');
  refreshIcons();
}
function openDialog(id: string) {
  if (!activeDialog) lastFocus = document.activeElement as HTMLElement;
  activeDialog?.close();
  activeDialog = $<HTMLDialogElement>(id);
  activeDialog.showModal();
  syncPause();
}
function closeDialog() {
  activeDialog?.close(); activeDialog = null;
  syncPause(); lastFocus?.focus();
}
for (const close of document.querySelectorAll<HTMLButtonElement>('.close-dialog')) close.addEventListener('click', closeDialog);
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });

function updateSound() {
  audio.enabled = settings.sound;
  const label = settings.sound ? '关闭音效' : '开启音效';
  $('#sound-button').innerHTML = icon(settings.sound ? 'volume-2' : 'volume-x');
  $('#sound-button').setAttribute('aria-label', label);
  $('#sound-button').setAttribute('aria-pressed', String(settings.sound));
  $('#sound-button').dataset.tooltip = label;
  refreshIcons();
}

function render() {
  lastRevision = game.revision;
  $('#mode-label').textContent = settings.mode === 'dice' ? '骰子挑战' : '轮流放置';
  $('#session-label').textContent = `第 ${String(session).padStart(2, '0')} 局`;
  $('#round-label').textContent = `第 ${game.round} 轮`;
  $('#turn-heading').textContent = game.phase === 'finished' ? (game.loser === null ? '全部登舱啦' : '哎呀，失衡了') : game.phase === 'settling' ? '稳住，稳住' : game.isBot ? '电脑思考中' : '轮到你啦';
  $('#active-crew').innerHTML = `${helmet(game.turn)}<span style="color:${PLAYER_COLORS[game.turn]}"><strong>${PLAYER_NAMES[game.turn]}</strong><small>${game.isBot ? '电脑队员' : `玩家 ${game.turn + 1}`}</small></span>`;
  $('#turn-description').textContent = game.phase === 'finished' ? (game.loser === null ? '全员成功抵达空间站' : '本次登舱失去了平衡') : game.phase === 'settling' ? '平台晃动中' : game.phase === 'roll' || game.phase === 'rolling' ? '本回合 · 等待骰子结果' : `本回合 · 还需放置 ${game.remaining} 位`;
  $('#turn-steps').innerHTML = Array.from({ length: settings.count }, (_, index) => `<span style="--team:${PLAYER_COLORS[index]}" class="${index === game.turn ? 'active' : ''}"></span>`).join('');
  $('#crew-count').textContent = String(game.physics.crew.size).padStart(2, '0');
  $('#players').style.setProperty('--count', String(settings.count));
  $('#players').innerHTML = Array.from({ length: settings.count }, (_, index) => `<div class="player ${index === game.turn ? 'active' : ''}" style="--team:${PLAYER_COLORS[index]}" ${index === game.turn ? 'aria-current="true"' : ''}>${helmet(index, true)}<div class="player-text"><strong>${PLAYER_NAMES[index]}</strong><small>${icon(settings.bots[index] ? 'bot' : 'user-round')}${settings.bots[index] ? '电脑' : `玩家 ${index + 1}`}</small></div><span class="player-score">${wins[index]}<small>胜</small></span><span class="player-indicator"></span></div>`).join('');
  $<HTMLButtonElement>('#slot-button').disabled = !game.canPlace || game.isBot;
  $('#remaining-label').textContent = game.phase === 'roll' || game.phase === 'rolling' ? '本回合待定' : game.phase === 'finished' ? '任务结束' : `还需放置 ${game.remaining} 位`;
  $('#action-label').textContent = game.isBot && game.phase !== 'finished' ? '电脑回合' : '本回合';
  $('#movement-state').textContent = game.phase === 'settling' ? '平台晃动中' : game.phase === 'finished' ? '登舱结束' : game.isBot ? '机器人行动中' : '等待登舱';
  const action = $<HTMLButtonElement>('#action-button');
  const rollPhase = game.phase === 'roll' || game.phase === 'rolling';
  $('#slot-button').hidden = rollPhase || game.phase === 'finished';
  action.hidden = !rollPhase && game.phase !== 'finished';
  action.disabled = game.phase !== 'finished' && (game.isBot || game.paused || game.phase !== 'roll');
  action.innerHTML = game.phase === 'finished' ? `${icon('trophy')}<span>查看结果</span>` : `${icon('dices')}<span>${game.phase === 'rolling' ? '骰子转动中' : '掷骰子'}</span>`;
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = settings.mode === 'classic' ? 1 : game.dice;
  document.querySelectorAll<HTMLElement>('[data-pip]').forEach(pip => pip.classList.toggle('visible', pips[face].includes(Number(pip.dataset.pip))));
  $('#die').classList.toggle('rolling', game.phase === 'rolling');
  $('#die').hidden = settings.mode !== 'dice';
  $('#die').setAttribute('aria-label', `骰子 ${face} 点`);
  refreshIcons();
}

function showResult() {
  if (!resultCounted) {
    for (let i = 0; i < settings.count; i++) if (i !== game.loser) wins[i]++;
    resultCounted = true;
    render();
  }
  const winners = Array.from({ length: settings.count }, (_, i) => i).filter(i => i !== game.loser);
  $('#result-title').textContent = game.loser === null ? '全员平安着陆！' : winners.length === 1 ? `${PLAYER_NAMES[winners[0]]}，赢啦！` : '稳稳站住的你们，赢啦！';
  $('#result-description').textContent = game.loser === null ? `${SLOTS.length} 位太空人，一起完成平衡任务。` : `${PLAYER_NAMES[game.loser]}先失去了平衡，下一局再出发。`;
  $('#winner-lineup').innerHTML = winners.map(owner => `<div>${helmet(owner)}<strong>${PLAYER_NAMES[owner]}</strong></div>`).join('');
  $('#result-moves').textContent = String(game.moves);
  $('#result-time').textContent = `${String(Math.floor(game.time / 60)).padStart(2, '0')}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
  $('#result-tilt').textContent = `${game.peakTilt.toFixed(1)}°`;
  openDialog('#result-dialog');
}

function frame() {
  const now = performance.now(), elapsed = Math.min(0.1, (now - frameTime) / 1000);
  frameTime = now;
  if (game.moves > previousMoves) audio.play('place');
  if (game.phase === 'rolling' && previousPhase !== 'rolling') audio.play('roll');
  if (game.turn !== previousTurn) audio.play('turn');
  if (game.phase === 'finished' && previousPhase !== 'finished') {
    finishCountdown = 1.6;
    audio.play(game.loser === null ? 'win' : 'fall');
  }
  previousMoves = game.moves; previousPhase = game.phase; previousTurn = game.turn;
  if (lastRevision !== game.revision) render();
  if (now > telemetryAt) {
    telemetryAt = now + 100;
    const tilt = game.physics.tilt, lean = game.physics.lean;
    $('#tilt-value').textContent = tilt.toFixed(1);
    $('#dial-dot').style.transform = `translate(${Math.max(-30, Math.min(30, lean.x * 110))}px, ${Math.max(-30, Math.min(30, lean.z * 110))}px)`;
    $('#balance-word').textContent = tilt < 5 ? '稳稳当当' : tilt < 12 ? '有一点晃' : tilt < 20 ? '小心偏重' : '失衡警报';
    $('.balance-panel').classList.toggle('warning', tilt >= 12);
  }
  if (finishCountdown >= 0 && !game.paused) {
    finishCountdown -= elapsed;
    if (finishCountdown < 0) showResult();
  }
}

function restart() {
  closeDialog(); clearTimeout(spinTimer);
  $<HTMLButtonElement>('#spin-button').disabled = false;
  $('#wheel-result').textContent = '今日太空任务';
  spinRotation = 0; $('#wheel').style.transform = 'rotate(0deg)';
  game.dispose(); game = new BalanceGame(settings);
  userPaused = false; resultCounted = false; finishCountdown = -1;
  previousPhase = game.phase; previousMoves = previousTurn = 0;
  session++; scene?.setGame(game); syncPause(); render();
  if (import.meta.env.DEV) exposeDiagnostics();
}

function exposeDiagnostics() {
  Object.assign(window, { __balance: { game, diagnostics: () => scene?.diagnostics(), state: () => ({ phase: game.phase, turn: game.turn, moves: game.moves, remaining: game.remaining, selected: game.selected, paused: game.paused, time: game.time, loser: game.loser, tilt: game.physics.tilt, count: game.physics.crew.size, settings }) } });
}

$('#rules-button').addEventListener('click', () => openDialog('#rules-dialog'));
$('#restart-button').addEventListener('click', () => game.phase === 'finished' || (game.moves === 0 && game.phase !== 'rolling') ? restart() : openDialog('#restart-dialog'));
$('#confirm-restart').addEventListener('click', restart);
$('#play-again').addEventListener('click', restart);
$('#sound-button').addEventListener('click', () => { settings.sound = !settings.sound; updateSound(); saveSettings(); audio.unlock(); audio.suspend(game.paused); });
$('#pause-button').addEventListener('click', () => { userPaused = !userPaused; syncPause(); render(); });
$('#resume-button').addEventListener('click', () => { userPaused = false; syncPause(); render(); });
$('#action-button').addEventListener('click', () => {
  audio.unlock();
  if (game.phase === 'finished') { finishCountdown = -1; showResult(); }
  else if (game.phase === 'roll') game.roll();
  render();
});
for (const action of ['left', 'top', 'reset', 'right']) $(`#view-${action}`).addEventListener('click', () => scene?.view(action));

$('#slot-button').addEventListener('click', () => {
  $('#slot-grid').innerHTML = SLOTS.map(slot => `<button class="${game.selected === slot.id ? 'selected' : ''}" data-slot="${slot.id}" ${game.physics.crew.has(slot.id) ? 'disabled' : ''} aria-label="${slot.id + 1} 号停靠位${game.physics.crew.has(slot.id) ? '已占用' : ''}">${String(slot.id + 1).padStart(2, '0')}</button>`).join('');
  openDialog('#slots-dialog');
});
$('#slot-grid').addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-slot]');
  if (target && !target.disabled) { closeDialog(); audio.unlock(); game.place(Number(target.dataset.slot)); render(); }
});

function updateRosterRows() {
  document.querySelectorAll<HTMLElement>('[data-player]').forEach(row => row.hidden = Number(row.dataset.player) >= draftCount);
  document.querySelectorAll<HTMLElement>('[data-count]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === draftCount)));
  document.querySelectorAll<HTMLElement>('[data-owner]').forEach(button => button.setAttribute('aria-pressed', String(draftBots[Number(button.dataset.owner)] === (button.dataset.bot === 'true'))));
  const bots = draftBots.slice(0, draftCount).filter(Boolean).length;
  $('#roster-summary').textContent = `${draftCount - bots} 真人 · ${bots} 机器人`;
}
$('#settings-button').addEventListener('click', () => {
  $<HTMLInputElement>(`input[name="mode"][value="${settings.mode}"]`).checked = true;
  draftCount = settings.count;
  draftBots = [...settings.bots];
  $<HTMLInputElement>('#setting-sound').checked = settings.sound;
  updateRosterRows(); openDialog('#settings-dialog');
});
$('#player-count').addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-count]');
  if (target) { draftCount = Number(target.dataset.count); updateRosterRows(); }
});
$('#roster-settings').addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-owner]');
  if (target) { draftBots[Number(target.dataset.owner)] = target.dataset.bot === 'true'; updateRosterRows(); }
});
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData($<HTMLFormElement>('#settings-form'));
  const next = parseSettings({ count: draftCount, mode: form.get('mode'), sound: form.has('sound'), bots: draftBots.map((bot, i) => i < draftCount && bot) });
  if (next.count !== settings.count || next.bots.some((bot, i) => bot !== settings.bots[i])) wins = [0, 0, 0, 0];
  settings = next; saveSettings(); updateSound(); restart();
});

$('#fullscreen-button').hidden = !document.fullscreenEnabled;
$('#fullscreen-button').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Fullscreen may be unavailable on this device. */ }
});
document.addEventListener('fullscreenchange', () => {
  const full = Boolean(document.fullscreenElement), label = full ? '退出全屏' : '全屏';
  $('#fullscreen-button').innerHTML = icon(full ? 'minimize' : 'maximize');
  $('#fullscreen-button').setAttribute('aria-label', label); $('#fullscreen-button').dataset.tooltip = label;
  refreshIcons();
});
document.addEventListener('visibilitychange', () => { syncPause(); render(); });

const tasks = ['太空漫步', '比个爱心', '原地转一圈', '讲个笑话', '夸夸队友', '胜利击掌'];
const wheelColors = ['#b5dedc', '#f3d47b', '#e9b4a9', '#bbcdec', '#d5c6df', '#c8ddb5'];
const context = $<HTMLCanvasElement>('#wheel').getContext('2d')!;
for (let i = 0; i < tasks.length; i++) {
  const angle = i / tasks.length * Math.PI * 2 - Math.PI / 2;
  context.beginPath(); context.moveTo(320, 320); context.arc(320, 320, 309, angle - Math.PI / 6, angle + Math.PI / 6); context.closePath(); context.fillStyle = wheelColors[i]; context.fill();
  context.save(); context.translate(320, 320); context.rotate(angle + Math.PI / 2); context.fillStyle = '#314946'; context.font = 'bold 27px sans-serif'; context.textAlign = 'center'; context.fillText(tasks[i], 0, -205); context.restore();
}
$('#wheel-button').addEventListener('click', () => openDialog('#wheel-dialog'));
$('#spin-button').addEventListener('click', () => {
  clearTimeout(spinTimer);
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const choice = Math.floor(random * tasks.length);
  spinRotation += 2160 - (spinRotation % 360) - choice * 60;
  $('#wheel').style.transform = `rotate(${spinRotation}deg)`;
  $<HTMLButtonElement>('#spin-button').disabled = true;
  $('#wheel-result').textContent = '任务抽取中';
  spinTimer = setTimeout(() => { $('#wheel-result').textContent = tasks[choice]; $<HTMLButtonElement>('#spin-button').disabled = false; }, 2700);
});

refreshIcons(); updateSound(); render();
try {
  scene = new BalanceScene($('#space-scene'), game, frame, id => { if (game.place(id)) { audio.unlock(); render(); } });
  $('#loading').remove();
  if (import.meta.env.DEV) exposeDiagnostics();
} catch (error) {
  console.error(error);
  $('#loading').innerHTML = `<span>${icon('orbit')}</span><strong>空间站暂时无法启动</strong><span>请使用支持 WebGL 的浏览器。</span><button class="primary-button" id="reload-button">重新加载${icon('rotate-ccw')}</button>`;
  $('#reload-button').addEventListener('click', () => location.reload());
  refreshIcons();
}
syncPause();
window.addEventListener('pagehide', saveSettings);
if (import.meta.hot) import.meta.hot.dispose(() => { clearTimeout(spinTimer); scene?.dispose(); game.dispose(); audio.dispose(); });
