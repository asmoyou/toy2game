import { createIcons, ArrowLeft, ArrowRight, CircleHelp, Settings2, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, LocateFixed, Pause, Play, X, Users, Bot, UserRound, Trophy, Hand, Check, Sprout } from 'lucide';
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';
import { BEAN_COUNT, CYCLE, SETTINGS_KEY, TEAMS, parseSettings } from './config';
import { FrogGame } from './game';
import { FrogScene } from './scene';
import { GameAudio } from './audio';
import { fullscreenControl } from './fullscreen';
import './style.css';

const icons = { ArrowLeft, ArrowRight, CircleHelp, Settings2, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, LocateFixed, Pause, Play, X, Users, Bot, UserRound, Trophy, Hand, Check, Sprout };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const glyph = (name: string) => `<i data-lucide="${name}"></i>`;
const tool = (id: string, label: string, icon: string) => `<button type="button" class="icon-button" id="${id}" aria-label="${label}" data-tooltip="${label}">${glyph(icon)}</button>`;
const frogIcon = (owner = 0) => `<span class="frog-icon" style="--frog:${TEAMS[owner].color}" aria-hidden="true"><span class="eye left"></span><span class="eye right"></span><span class="smile"></span></span>`;
const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.8 } });
let settings = parseSettings(null);
try { settings = parseSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')); } catch { /* Bad or unavailable storage must not block play. */ }
let game = new FrogGame(settings);
let scene: FrogScene | undefined;
const audio = new GameAudio();
let activeDialog: HTMLDialogElement | null = null;
let returnFocus: HTMLElement | null = null;
let userPaused = false, focusPaused = false, unavailable = false;
let session = 1, resultShown = false, resultDelay = 0;
let lastRevision = -1, lastRemaining = BEAN_COUNT, lastBites = 0, lastCountdown = 4;
let draftCount = settings.count, draftBots = [...settings.bots];
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const pressedPointers = new Map<number, number>();
const pressedKeys = new Set<number>();
const listeners = new AbortController();
const signal = listeners.signal;
recordVisit('frog-feast');

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="${libraryUrl(import.meta.env.BASE_URL)}" aria-label="返回游戏大厅" title="返回游戏大厅"><span class="back-arrow">${glyph('arrow-left')}</span><span class="brand-mark">${frogIcon()}</span><span><h1>青蛙吃豆豆</h1><span class="english">FROG FEAST</span></span></a>
    <span class="header-note"><span></span>把快乐，吃进肚子里</span>
    <nav class="header-tools" aria-label="游戏工具">${tool('rules-button', '游戏规则', 'circle-help')}${tool('sound-button', '关闭音效', 'volume-2')}${tool('fullscreen-button', '进入全屏', 'maximize')}${tool('settings-button', '游戏设置', 'settings-2')}<span class="tool-divider"></span><button id="restart-button" class="restart-button" aria-label="新的一局" data-tooltip="新的一局">${glyph('rotate-ccw')}<span>新的一局</span></button></nav>
  </header>
  <main class="game-layout">
    <section class="intro" aria-label="本局状态"><div class="intro-copy"><div class="eyebrow"><span class="live-dot"></span>同屏抢豆<span class="slash">/</span><span id="session-label">第 01 局</span></div><h2 id="status-heading">小青蛙，开饭啦！</h2><p id="status-description">按住你的青蛙，把彩豆统统吃掉。</p></div><div class="round-status"><div class="bean-counter"><span class="bean-dots" aria-hidden="true"><i></i><i></i><i></i></span><div><span class="counter-title">盘中还剩</span><div><strong id="remaining-count">60</strong><span class="counter-unit">颗豆豆</span></div></div></div><span class="status-divider"></span><button id="start-button" class="primary-button">${glyph('play')}<span>开始抢豆</span></button><div class="time-status" id="time-status" hidden><span>开饭时间</span><strong id="elapsed-time">00:00</strong></div></div></section>
    <section class="play-area" aria-label="青蛙抢豆场景"><div id="frog-scene" class="scene-host"><div id="loading" class="scene-loading">${frogIcon()}<strong>小青蛙正在摆好餐桌…</strong></div></div>
      <div class="scene-caption"><span class="caption-line"></span><span>一颗彩豆，一口快乐</span></div>
      <div class="scene-hint">${glyph('hand')}<span>轻触青蛙吃豆 · 拖动旋转 · 双指缩放</span></div>
      <div class="view-tools" role="group" aria-label="场景视角">${tool('view-left', '向左旋转视角', 'rotate-ccw')}${tool('view-reset', '恢复默认视角', 'locate-fixed')}${tool('view-right', '向右旋转视角', 'rotate-cw')}</div>
      <div id="countdown-state" class="countdown-state" hidden aria-live="polite"><strong id="countdown-number">3</strong><span>手指准备好，一起开吃！</span></div>
      <div id="paused-state" class="paused-state" hidden>${glyph('pause')}<h2>休息一下，豆豆等你</h2><button class="primary-button" id="resume-button">${glyph('play')}继续游戏</button></div>
    </section>
    <section class="game-dock" aria-label="玩家与吃豆按钮"><div class="dock-heading"><span>${glyph('users')}开饭小分队 <small id="roster-label"></small></span><span class="dock-tip">点按一口 · 长按连续吃</span>${tool('pause-button', '暂停游戏', 'pause')}</div><div class="players" id="players">${TEAMS.map((team, i) => `<article class="player" data-player="${i}" style="--team:${team.color};--ink:${team.ink};--pale:${team.pale}"><div class="player-info">${frogIcon(i)}<div class="player-name"><strong>${i + 1} 号${team.name}<span>${team.nickname}</span></strong><small id="role-${i}"></small></div><div class="player-score"><strong id="score-${i}">0</strong><span>颗</span></div></div><button class="eat-button" id="eat-${i}" data-eat="${i}" aria-label="${i + 1} 号${team.name}吃豆" aria-keyshortcuts="${team.key}"><span class="eat-label"></span><kbd>${team.key}</kbd></button></article>`).join('')}</div></section>
  </main>
  <footer class="footer"><span>${glyph('sprout')}一张桌子，装下好多快乐。</span><span>每颗 1 分 · 抢完结算 · 支持同时触控</span></footer>
  <dialog id="rules-dialog" aria-labelledby="rules-title"><div class="dialog-top"><span class="eyebrow">HOW TO PLAY</span>${tool('close-rules', '关闭规则', 'x')}</div><h2 id="rules-title">谁是今天的大胃王？</h2><div class="rules-frogs">${TEAMS.map((_, i) => frogIcon(i)).join('')}</div><ol class="rules-list"><li><strong>选好你的小青蛙</strong><p>2–4 个席位一起抢豆，可以和朋友同屏玩，也可以加入机器人。</p></li><li><strong>按住，开吃！</strong><p>点击「开始抢豆」，倒计时结束后按住自己的吃豆按钮，或键盘 A / L / Z / M。也可以轻触场景中的青蛙，吃一口。</p></li><li><strong>豆豆最多就是赢家</strong><p>60 颗彩豆，每颗 1 分，每口最多 3 颗。只有嘴里实际抓到的豆子才计分；盘底会轻轻摇动，让剩余豆子滚起来。抢完结算，最高分并列则一起获胜。</p></li></ol><button class="primary-button wide" id="rules-ready">${glyph('check')}知道啦，开饭！</button></dialog>
  <dialog id="settings-dialog" aria-labelledby="settings-title"><form id="settings-form"><div class="dialog-top"><span class="eyebrow">GATHER YOUR FRIENDS</span>${tool('close-settings', '关闭设置', 'x')}</div><h2 id="settings-title">游戏设置</h2><p class="dialog-description">叫上朋友，给每只青蛙安排一位小伙伴。</p><fieldset><legend>玩家人数</legend><div class="count-options" role="group" aria-label="玩家人数">${[2, 3, 4].map(count => `<button type="button" data-count="${count}" aria-pressed="false">${count} 人</button>`).join('')}</div></fieldset><div class="roster-settings">${TEAMS.map((team, i) => `<div class="roster-row" data-seat="${i}" style="--team:${team.color}">${frogIcon(i)}<strong>${i + 1} 号${team.name}</strong><div class="seat-roles" role="group" aria-label="${i + 1} 号${team.name}席位类型">${[false, true].map(bot => `<button type="button" data-owner="${i}" data-bot="${bot}" aria-label="${i + 1} 号${team.name}设为${bot ? '机器人' : '真人'}" aria-pressed="false">${glyph(bot ? 'bot' : 'user-round')}<span>${bot ? '机器人' : '真人'}</span></button>`).join('')}</div></div>`).join('')}</div><p id="roster-summary" class="roster-summary" aria-live="polite"></p><p class="setting-note">确认后开始新的一局，当前进度会重新计算。</p><button type="submit" class="primary-button wide">按此设置开始新局${glyph('arrow-right')}</button></form></dialog>
  <dialog id="restart-dialog" aria-labelledby="restart-title"><div class="dialog-top"><span class="eyebrow">ONE MORE FEAST</span>${tool('close-restart', '取消重开', 'x')}</div><h2 id="restart-title">重新开始这一局？</h2><p class="dialog-description">沿用当前阵容，重新倒入 60 颗豆豆。当前分数将清零。</p><div class="dialog-actions"><button class="secondary-button" id="cancel-restart">继续这局</button><button class="primary-button" id="confirm-restart">重新开局${glyph('arrow-right')}</button></div></dialog>
  <dialog id="result-dialog" aria-labelledby="result-title"><div class="dialog-top"><span class="eyebrow">HAPPY TUMMIES</span>${tool('close-result', '查看棋盘', 'x')}</div><div class="result-trophy">${glyph('trophy')}</div><h2 id="result-title">今天的大胃王</h2><p id="result-description" class="dialog-description"></p><div id="result-scores" class="result-scores"></div><p id="result-time" class="roster-summary"></p><button id="play-again" class="primary-button wide">再来一局${glyph('arrow-right')}</button><button id="change-roster" class="text-button">换个阵容</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Optional preferences. */ } }
function toast(message: string) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200); }
function releaseAll() {
  pressedPointers.clear(); pressedKeys.clear(); game.releaseAll(); scene?.cancelGesture();
  document.querySelectorAll('.eat-button').forEach(button => button.classList.remove('pressed'));
}
function syncPause() {
  game.paused = userPaused || focusPaused || Boolean(activeDialog) || document.hidden || unavailable;
  if (game.paused) releaseAll();
  audio.suspend(game.paused);
  $('#paused-state').hidden = !(userPaused || focusPaused) || Boolean(activeDialog) || unavailable;
  const label = userPaused || focusPaused ? '继续游戏' : '暂停游戏';
  $('#pause-button').innerHTML = glyph(userPaused || focusPaused ? 'play' : 'pause');
  $('#pause-button').setAttribute('aria-label', label); $('#pause-button').dataset.tooltip = label;
  refreshIcons(); render();
}
function openDialog(selector: string) {
  if (!activeDialog) returnFocus = document.activeElement as HTMLElement;
  activeDialog?.close(); activeDialog = $<HTMLDialogElement>(selector); activeDialog.showModal(); syncPause();
}
function closeDialog() {
  activeDialog?.close(); activeDialog = null; syncPause();
  if (returnFocus?.isConnected && !returnFocus.hidden && !(returnFocus instanceof HTMLButtonElement && returnFocus.disabled)) returnFocus.focus();
  else $('#settings-button').focus();
}
function soundPreference() {
  audio.enabled = settings.sound;
  const label = settings.sound ? '关闭音效' : '开启音效';
  $('#sound-button').innerHTML = glyph(settings.sound ? 'volume-2' : 'volume-x');
  $('#sound-button').setAttribute('aria-label', label); $('#sound-button').dataset.tooltip = label;
  $('#sound-button').setAttribute('aria-pressed', String(settings.sound)); refreshIcons();
}
function clockLabel(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function render() {
  lastRevision = game.revision;
  $('#remaining-count').textContent = String(game.remaining).padStart(2, '0');
  $('#session-label').textContent = `第 ${String(session).padStart(2, '0')} 局`;
  $('#status-heading').textContent = game.phase === 'finished' ? '豆豆吃光啦！' : game.phase === 'playing' ? (game.remaining < 10 ? '最后几颗，加把劲！' : '啊呜！快乐吃不停') : game.phase === 'countdown' ? '准备好，一起开吃！' : '小青蛙，开饭啦！';
  $('#status-description').textContent = game.phase === 'finished' ? '每一口快乐，都算数。' : '按住你的青蛙，把彩豆统统吃掉。';
  $('#start-button').hidden = game.phase === 'playing';
  $<HTMLButtonElement>('#start-button').disabled = game.paused || unavailable || game.phase === 'countdown';
  $('#start-button').innerHTML = `${glyph(game.phase === 'finished' ? 'trophy' : 'play')}<span>${game.phase === 'finished' ? '查看结果' : game.phase === 'countdown' ? '准备开吃' : '开始抢豆'}</span>`;
  $('#time-status').hidden = game.phase !== 'playing';
  $('#countdown-state').hidden = game.phase !== 'countdown' || game.paused;
  const bots = settings.bots.slice(0, settings.count).filter(Boolean).length;
  $('#roster-label').textContent = `${settings.count - bots} 真人 · ${bots} 机器人`;
  $('#players').style.setProperty('--count', String(settings.count));
  TEAMS.forEach((team, i) => {
    $(`[data-player="${i}"]`).hidden = i >= settings.count;
    $(`#score-${i}`).textContent = String(game.frogs[i].score);
    $(`#role-${i}`).innerHTML = `${glyph(settings.bots[i] ? 'bot' : 'user-round')}${settings.bots[i] ? '机器人' : '真人玩家'}`;
    const button = $<HTMLButtonElement>(`#eat-${i}`);
    button.disabled = unavailable || game.paused || settings.bots[i] || i >= settings.count || game.phase === 'finished';
    button.querySelector('.eat-label')!.innerHTML = `${glyph(settings.bots[i] ? 'bot' : 'hand')}<span>${settings.bots[i] ? (game.phase === 'playing' ? '正在抢豆' : '机器人就位') : game.phase === 'finished' ? '吃饱啦' : '按住 · 吃豆'}</span>`;
    button.querySelector('kbd')!.textContent = team.key;
    (button.querySelector('kbd') as HTMLElement).hidden = settings.bots[i];
  });
  refreshIcons();
}
function showResult() {
  resultShown = true;
  const winners = game.winners;
  $('#result-title').textContent = winners.length > 1 ? '并列大胃王！' : `${TEAMS[winners[0]].name}，今天的大胃王！`;
  $('#result-description').textContent = `${winners.map(i => `${i + 1} 号${TEAMS[i].name}`).join('、')}吃到了 ${game.frogs[winners[0]].score} 颗豆豆。`;
  $('#result-scores').innerHTML = game.frogs.slice(0, settings.count).map((frog, i) => `<div class="result-row ${winners.includes(i) ? 'winner' : ''}">${frogIcon(i)}<span>${i + 1} 号${TEAMS[i].name}</span>${winners.includes(i) ? glyph('trophy') : ''}<strong>${frog.score}<small>颗</small></strong></div>`).join('');
  $('#result-time').textContent = `60 颗豆豆全部吃光 · 用时 ${clockLabel(game.time)}`;
  openDialog('#result-dialog');
}
function frame(delta: number) {
  const count = Math.ceil(game.countdown), bites = game.frogs.reduce((sum, frog) => sum + frog.bites, 0);
  if (!game.paused) {
    if (game.remaining < lastRemaining) audio.play('catch');
    else if (bites > lastBites) audio.play('bite');
    if (game.phase === 'countdown' && count !== lastCountdown) audio.play('count');
  }
  lastRemaining = game.remaining; lastBites = bites; lastCountdown = count;
  $('#countdown-number').textContent = String(Math.max(1, count));
  $('#elapsed-time').textContent = clockLabel(game.time);
  TEAMS.forEach((_, i) => {
    const age = game.time - game.frogs[i].startedAt;
    $(`[data-player="${i}"]`).classList.toggle('chomping', game.phase === 'playing' && age < CYCLE && !game.paused);
  });
  if (lastRevision !== game.revision) render();
  if (game.phase === 'finished' && !resultShown && !game.paused) {
    resultDelay += delta;
    if (resultDelay > 1) { audio.play('win'); showResult(); }
  }
}
function restart() {
  releaseAll(); audio.stop(); closeDialog(); game.dispose(); game = new FrogGame(settings);
  userPaused = false; focusPaused = false; session++; resultShown = false; resultDelay = 0;
  lastRemaining = BEAN_COUNT; lastBites = 0; lastCountdown = 4;
  scene?.setGame(game); syncPause(); exposeDiagnostics();
}
function begin() { audio.unlock(); if (game.phase === 'finished') showResult(); else game.start(); render(); }
function singleBite(owner: number) {
  audio.unlock();
  if (game.phase === 'ready') game.start(); else game.bite(owner);
  render();
}
function rosterDraft() {
  document.querySelectorAll<HTMLElement>('[data-seat]').forEach(row => { row.hidden = Number(row.dataset.seat) >= draftCount; });
  document.querySelectorAll<HTMLElement>('[data-count]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === draftCount)));
  document.querySelectorAll<HTMLElement>('[data-owner]').forEach(button => button.setAttribute('aria-pressed', String(draftBots[Number(button.dataset.owner)] === (button.dataset.bot === 'true'))));
  const bots = draftBots.slice(0, draftCount).filter(Boolean).length;
  $('#roster-summary').textContent = `${draftCount - bots} 真人 · ${bots} 机器人${bots === draftCount ? ' · 看小青蛙们自动比一局' : ''}`;
}
function showSettings() { draftCount = settings.count; draftBots = [...settings.bots]; rosterDraft(); openDialog('#settings-dialog'); }
function updateHold(owner: number) {
  const down = pressedKeys.has(owner) || [...pressedPointers.values()].includes(owner);
  const accepted = game.hold(owner, down); $(`#eat-${owner}`).classList.toggle('pressed', down && accepted);
}

$('#start-button').addEventListener('click', begin);
$('#rules-button').addEventListener('click', () => openDialog('#rules-dialog'));
$('#settings-button').addEventListener('click', showSettings);
$('#change-roster').addEventListener('click', showSettings);
for (const id of ['close-rules', 'rules-ready', 'close-settings', 'close-restart', 'cancel-restart', 'close-result']) $(`#${id}`).addEventListener('click', closeDialog);
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
$('#restart-button').addEventListener('click', () => game.phase === 'ready' || game.phase === 'finished' ? restart() : openDialog('#restart-dialog'));
$('#confirm-restart').addEventListener('click', restart); $('#play-again').addEventListener('click', restart);
$('#sound-button').addEventListener('click', () => { settings.sound = !settings.sound; soundPreference(); saveSettings(); audio.unlock(); audio.suspend(game.paused); });
$('#pause-button').addEventListener('click', () => { userPaused = !(userPaused || focusPaused); focusPaused = false; syncPause(); });
$('#resume-button').addEventListener('click', () => { userPaused = focusPaused = false; audio.unlock(); syncPause(); });
for (const action of ['left', 'reset', 'right']) $(`#view-${action}`).addEventListener('click', () => scene?.view(action));
document.querySelectorAll<HTMLElement>('[data-count]').forEach(button => button.addEventListener('click', () => { draftCount = Number(button.dataset.count); rosterDraft(); }));
document.querySelectorAll<HTMLElement>('[data-owner]').forEach(button => button.addEventListener('click', () => { draftBots[Number(button.dataset.owner)] = button.dataset.bot === 'true'; rosterDraft(); }));
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault(); settings = parseSettings({ version: 1, count: draftCount, bots: draftBots, sound: settings.sound }); saveSettings(); restart();
});
document.querySelectorAll<HTMLButtonElement>('[data-eat]').forEach(button => {
  const owner = Number(button.dataset.eat);
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault(); audio.unlock(); button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId); pressedPointers.set(event.pointerId, owner); updateHold(owner); render();
  });
  const release = (event: PointerEvent) => { pressedPointers.delete(event.pointerId); updateHold(owner); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('click', event => { if (event.detail === 0) singleBite(owner); });
});
window.addEventListener('keydown', event => {
  if (activeDialog || event.altKey || event.metaKey || event.ctrlKey || event.target instanceof HTMLInputElement) return;
  const owner = TEAMS.findIndex(team => team.code === event.code);
  if (owner < 0) return;
  event.preventDefault(); if (event.repeat) return;
  audio.unlock(); pressedKeys.add(owner); updateHold(owner); render();
}, { signal });
window.addEventListener('keyup', event => {
  const owner = TEAMS.findIndex(team => team.code === event.code);
  if (owner >= 0) { pressedKeys.delete(owner); updateHold(owner); }
}, { signal });
document.addEventListener('visibilitychange', syncPause, { signal });
window.addEventListener('blur', () => { focusPaused = true; syncPause(); }, { signal });
window.addEventListener('focus', () => { focusPaused = false; syncPause(); }, { signal });

function exposeDiagnostics() {
  if (import.meta.env.DEV) Object.assign(window, { __frog: { game, diagnostics: () => scene?.diagnostics(), state: () => ({ phase: game.phase, paused: game.paused, time: game.time, countdown: game.countdown, remaining: game.remaining, scores: game.frogs.map(frog => frog.score), bites: game.frogs.map(frog => frog.bites), settings, winners: game.winners, session }) } });
}
function showError() {
  unavailable = true; syncPause();
  $('#frog-scene').innerHTML = `<div class="scene-loading error-state">${frogIcon()}<strong>小青蛙暂时无法登场</strong><span>请使用支持 WebGL 的浏览器，或重新加载试试。</span><button class="primary-button" id="reload-button">重新加载</button></div>`;
  $('#reload-button').addEventListener('click', () => location.reload());
}
soundPreference(); render();
const disposeFullscreen = fullscreenControl($<HTMLButtonElement>('#fullscreen-button'), full => { $('#fullscreen-button').innerHTML = glyph(full ? 'minimize' : 'maximize'); refreshIcons(); }, () => toast('暂时无法切换全屏，请再试一次。'));
try {
  scene = new FrogScene($('#frog-scene'), game, frame, singleBite, showError);
  $('#loading').remove(); exposeDiagnostics(); syncPause();
} catch (error) { console.error(error); showError(); }
window.addEventListener('pagehide', event => {
  saveSettings(); releaseAll();
  if (event.persisted) { game.paused = true; audio.suspend(true); }
  else dispose();
}, { signal });
window.addEventListener('pageshow', syncPause, { signal });
function dispose() {
  clearTimeout(toastTimer); listeners.abort(); disposeFullscreen(); scene?.dispose(); game.dispose(); audio.dispose();
}
if (import.meta.hot) import.meta.hot.dispose(dispose);
