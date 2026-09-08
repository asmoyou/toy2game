import { createIcons, ArrowLeft, ArrowRight, CircleHelp, Settings2, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Scan, Pause, Play, X, Users, Bot, UserRound, Trophy, Hand, Check, Sprout, Flower2, Cloud, Sun, Grid3x3, Ellipsis, Sparkles, ChevronDown, ListOrdered } from 'lucide';
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';
import { BOT_LEVELS, DIFFICULTIES, TEAMS, parseSettings, winners, type Difficulty } from './rules';
import { MatchGame } from './game';
import { MatchScene } from './scene';
import { FACES, faceImage } from './art';
import { GameAudio } from './audio';
import { loadMatch, loadPreferences, saveMatch, savePreferences } from './storage';
import { fullscreenControl } from './fullscreen';
import './style.css';

const icons = { ArrowLeft, ArrowRight, CircleHelp, Settings2, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Scan, Pause, Play, X, Users, Bot, UserRound, Trophy, Hand, Check, Sprout, Flower2, Cloud, Sun, Grid3x3, Ellipsis, Sparkles, ChevronDown, ListOrdered };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const glyph = (name: string) => `<i data-lucide="${name}"></i>`;
const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.8 } });
const tool = (id: string, label: string, icon: string) => `<button type="button" class="icon-button" id="${id}" aria-label="${label}" data-tooltip="${label}">${glyph(icon)}</button>`;
const avatar = (i: number) => `<span class="avatar" style="--team:${TEAMS[i].color};--pale:${TEAMS[i].pale};--ink:${TEAMS[i].ink}" aria-hidden="true">${glyph(TEAMS[i].symbol)}</span>`;
const teamName = (i: number) => `${i + 1} 号${TEAMS[i].name}`;
const preferences = loadPreferences(), restored = loadMatch();
let settings = restored?.settings ?? preferences.settings, sound = preferences.sound;
let game = new MatchGame(settings, undefined, restored ?? undefined), scene: MatchScene | undefined;
let activeDialog: HTMLDialogElement | null = null, returnFocus: HTMLElement | null = null;
let userPaused = false, unavailable = false, resultShown = false, resultDelay = 0, lastTime = 0;
let lastRevision = -1, lastReady = false;
let draftCount = settings.count, draftPairs = settings.pairs, draftBots = [...settings.bots], draftDifficulty = settings.difficulty;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const audio = new GameAudio(), listeners = new AbortController(), signal = listeners.signal;
recordVisit('flip-match');

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="${libraryUrl(import.meta.env.BASE_URL)}" aria-label="返回游戏大厅" title="返回游戏大厅">${glyph('arrow-left')}<span class="brand-mark" aria-hidden="true"><i></i><i>✦</i></span><span><h1>翻棋对对碰</h1><small>FLIP & MATCH</small></span></a>
    <span class="header-note">一翻，一对，好记性。</span>
    <nav class="header-tools" aria-label="游戏工具">${tool('rules-button', '游戏规则', 'circle-help')}${tool('sound-button', '关闭音效', 'volume-2')}${tool('fullscreen-button', '进入全屏', 'maximize')}${tool('settings-button', '游戏设置', 'settings-2')}<span class="tool-divider"></span><button id="restart-button" class="restart-button" aria-label="新的一局" data-tooltip="新的一局">${glyph('rotate-ccw')}<span>新的一局</span></button></nav>
  </header>
  <main class="game-layout">
    <section class="round-bar" aria-label="当前回合">
      <div class="turn-copy"><div class="eyebrow"><span class="live-dot"></span><span id="turn-label">薄荷队的回合</span><span class="small-separator">/</span><span id="turn-role">真人</span></div><h2 id="status-heading">翻开两枚，找到好朋友</h2><p id="status-description">记住每一次相遇，下一对也许就在那里。</p></div>
      <div class="reveals" aria-label="本回合翻开的棋子"><span class="reveal" id="reveal-0"></span><span class="pair-link">${glyph('ellipsis')}</span><span class="reveal" id="reveal-1"></span></div>
      <div class="counters"><div><span>已找到</span><p><strong id="matched-count">00</strong><small> / <span id="total-pairs">24</span> 对</small></p></div><div><span>尝试次数</span><p><strong id="attempt-count">00</strong><small> 次</small></p></div></div>
    </section>
    <section class="play-area" aria-label="翻棋配对场景"><div id="match-scene"><div id="loading" class="scene-loading"><span class="brand-mark"><i></i><i>✦</i></span><strong>正在摆好小棋子…</strong></div></div>
      <div class="scene-caption"><span></span>动物 × 水果 · 记忆力小派对</div>
      <div class="scene-bottom"><span class="scene-hint">${glyph('hand')}轻触翻棋 · 拖动旋转 · 双指缩放</span><div class="view-tools">${tool('view-left', '向左旋转视角', 'rotate-ccw')}${tool('view-reset', '恢复默认视角', 'scan')}${tool('view-top', '俯视棋盘', 'grid-3x3')}${tool('view-right', '向右旋转视角', 'rotate-cw')}<span></span><button id="tiles-button" class="list-button" aria-expanded="false" aria-controls="tile-panel">${glyph('list-ordered')}<span>棋子列表</span></button></div></div>
      <section id="tile-panel" class="tile-panel" aria-label="棋子列表" hidden><div class="tile-panel-top"><strong>点编号，也能翻棋</strong>${tool('close-tiles', '收起棋子列表', 'chevron-down')}</div><p>编号与棋盘位置一一对应，已翻开的图案会显示在这里。</p><div id="tile-grid" class="tile-grid"></div></section>
      <div id="paused-state" class="paused-state" hidden>${glyph('pause')}<h2>休息一下，好记性等你</h2><p>棋子和回合都替你留好了。</p><button class="primary-button" id="resume-button">${glyph('play')}继续游戏</button></div>
    </section>
    <section class="game-dock" aria-label="玩家得分"><div class="dock-heading"><span>${glyph('users')}配对小分队<small id="roster-label"></small></span><span class="dock-tip" id="dock-tip">找到一对，再翻一次</span>${tool('pause-button', '暂停游戏', 'pause')}</div><div class="players" id="players"></div></section>
  </main>
  <footer class="footer"><span>${glyph('sprout')}把小小的相遇，装进口袋。</span><span>每对 1 分 · 配完结算 · 自动保存进度</span></footer>
  <dialog id="rules-dialog" aria-labelledby="rules-title"><div class="dialog-top"><span class="eyebrow">LITTLE TILES, HAPPY PAIRS</span>${tool('close-rules', '关闭规则', 'x')}</div><h2 id="rules-title">把好朋友，找成一对</h2><div class="rule-pair"><img src="${faceImage(0)}" alt="小兔棋子"/><span>+</span><img src="${faceImage(0)}" alt="相同的小兔棋子"/><span>=</span><strong>1 分</strong></div><ol class="rules-list"><li><strong>轮到你，翻两枚</strong><p>棋子开始都背面朝上。依次点击两枚，记住它们的图案和位置。</p></li><li><strong>相同收走，不同盖回</strong><p>找到相同图案就得 1 分，并继续翻两枚；不同则展示片刻后盖回，换下一位。</p></li><li><strong>找到最多，就是赢家</strong><p>全部棋子配完后结算，得分最高者获胜，并列最高就一起庆祝！机器人只观察公开翻过的棋子，普通难度会漏看、遗忘和失误。</p></li></ol><p class="rule-note">可在设置中选择 12 对或 24 对棋子，邀请 2–4 位真人或机器人。机器人可选轻松、普通、困难或完美记忆，默认普通。不用抢时间，慢慢记就好。</p><button class="primary-button wide" id="rules-ready">${glyph('check')}记住啦，开始配对</button></dialog>
  <dialog id="settings-dialog" aria-labelledby="settings-title"><form id="settings-form"><div class="dialog-top"><span class="eyebrow">MAKE ROOM FOR FRIENDS</span>${tool('close-settings', '关闭设置', 'x')}</div><h2 id="settings-title">游戏设置</h2><p class="dialog-description">选好小伙伴，开始一场记忆力小派对。</p><fieldset><legend>棋盘大小</legend><div class="size-options" role="group" aria-label="棋盘大小"><button type="button" data-pairs="12"><strong>12 对</strong><small>动物朋友 · 轻松记</small></button><button type="button" data-pairs="24"><strong>24 对</strong><small>动物与水果 · 挑战记</small></button></div></fieldset><fieldset class="difficulty-setting"><legend>机器人难度</legend><select id="bot-difficulty" aria-label="机器人难度" aria-describedby="difficulty-description">${DIFFICULTIES.map(level => `<option value="${level}">${BOT_LEVELS[level].label}${level === 'normal' ? '（默认）' : ''}</option>`).join('')}</select><p id="difficulty-description"></p></fieldset><fieldset><legend>玩家人数</legend><div class="count-options" role="group" aria-label="玩家人数">${[2, 3, 4].map(count => `<button type="button" data-count="${count}">${count} 人</button>`).join('')}</div></fieldset><div class="roster-settings">${TEAMS.map((_, i) => `<div class="roster-row" data-seat="${i}">${avatar(i)}<strong>${teamName(i)}</strong><div class="seat-roles" role="group" aria-label="${teamName(i)}席位类型">${[false, true].map(bot => `<button type="button" data-owner="${i}" data-bot="${bot}" aria-label="${teamName(i)}设为${bot ? '机器人' : '真人'}">${glyph(bot ? 'bot' : 'user-round')}<span>${bot ? '机器人' : '真人'}</span></button>`).join('')}</div></div>`).join('')}</div><p id="roster-summary" class="roster-summary" aria-live="polite"></p><div class="settings-submit"><p class="setting-note">确认后重新洗牌，当前进度将清零。</p><button type="submit" class="primary-button wide">按此设置开始新局${glyph('arrow-right')}</button></div></form></dialog>
  <dialog id="restart-dialog" aria-labelledby="restart-title"><div class="dialog-top"><span class="eyebrow">SHUFFLE & SMILE</span>${tool('close-restart', '取消重开', 'x')}</div><h2 id="restart-title">重新开始这一局？</h2><p class="dialog-description">沿用当前人数、阵容、棋盘大小和机器人难度。重新洗牌，当前得分和进度会清零。</p><div class="dialog-actions"><button class="secondary-button" id="cancel-restart">继续这局</button><button class="primary-button" id="confirm-restart">重新开局${glyph('arrow-right')}</button></div></dialog>
  <dialog id="result-dialog" aria-labelledby="result-title"><div class="dialog-top"><span class="eyebrow">A POCKET FULL OF PAIRS</span>${tool('close-result', '查看棋盘', 'x')}</div><div class="result-trophy">${glyph('trophy')}</div><h2 id="result-title">今天的记忆小高手</h2><p id="result-description" class="dialog-description"></p><div id="result-scores" class="result-scores"></div><p id="result-attempts" class="roster-summary"></p><button id="play-again" class="primary-button wide">再来一局${glyph('arrow-right')}</button><button id="change-roster" class="text-button">换个阵容</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div><div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
`;

function toast(message: string) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000); }
function syncPause() {
  game.paused = userPaused || Boolean(activeDialog) || document.hidden || unavailable;
  if (game.paused) scene?.cancelGesture(); audio.suspend(game.paused);
  $('#paused-state').hidden = !userPaused || Boolean(activeDialog) || unavailable;
  const label = userPaused ? '继续游戏' : '暂停游戏'; $('#pause-button').innerHTML = glyph(userPaused ? 'play' : 'pause');
  $('#pause-button').setAttribute('aria-label', label); $('#pause-button').dataset.tooltip = label;
  refreshIcons(); render();
}
function openDialog(selector: string, trigger?: HTMLElement) {
  // Safari does not focus buttons on a touch/click, so retain the explicit opener.
  if (!activeDialog) returnFocus = trigger ?? (document.activeElement === document.body ? $('#settings-button') : document.activeElement as HTMLElement);
  activeDialog?.close(); activeDialog = $<HTMLDialogElement>(selector); activeDialog.showModal(); syncPause();
}
function closeDialog() {
  activeDialog?.close(); activeDialog = null; syncPause();
  if (returnFocus?.isConnected && !returnFocus.closest('[hidden]') && !(returnFocus instanceof HTMLButtonElement && returnFocus.disabled)) returnFocus.focus();
  else $('#settings-button').focus();
}
function soundPreference() {
  audio.enabled = sound; const label = sound ? '关闭音效' : '开启音效';
  $('#sound-button').innerHTML = glyph(sound ? 'volume-2' : 'volume-x'); $('#sound-button').setAttribute('aria-label', label); $('#sound-button').dataset.tooltip = label;
  $('#sound-button').setAttribute('aria-pressed', String(sound)); refreshIcons();
}
function buildPlayers() {
  $('#players').style.setProperty('--count', String(settings.count));
  $('#players').innerHTML = TEAMS.slice(0, settings.count).map((team, i) => `<article class="player" data-player="${i}" style="--team:${team.color};--ink:${team.ink};--pale:${team.pale}"><div class="player-info">${avatar(i)}<div class="player-name"><strong>${teamName(i)}</strong><small>${glyph(settings.bots[i] ? 'bot' : 'user-round')}${settings.bots[i] ? `${settings.difficulty === 'perfect' ? '完美' : BOT_LEVELS[settings.difficulty].label}机器人` : '真人'}</small></div><div class="player-score"><strong id="score-${i}">0</strong><span>对</span></div></div><div class="player-bottom"><span class="player-state" id="player-state-${i}">等待回合</span><div class="collection" id="collection-${i}"></div></div></article>`).join('');
  const bots = settings.bots.filter(Boolean).length; $('#roster-label').textContent = `${settings.count - bots} 真人 · ${bots} 机器人`;
  $('#tile-grid').innerHTML = game.state.deck.map((_, id) => `<button class="tile-option" data-tile="${id}" type="button"><img alt=""/><span>${String(id + 1).padStart(2, '0')}</span></button>`).join('');
  refreshIcons();
}
function render() {
  const G = game.state, total = G.scores.reduce((a, b) => a + b, 0), current = G.current;
  lastRevision = G.actions.length; lastReady = game.ready;
  $('#matched-count').textContent = String(total).padStart(2, '0'); $('#total-pairs').textContent = String(settings.pairs); $('#attempt-count').textContent = String(G.attempts).padStart(2, '0');
  $('#turn-label').textContent = G.phase === 'finished' ? '所有好朋友都找到啦' : `${teamName(current)}的回合`;
  $('#turn-role').textContent = G.phase === 'finished' ? '已完成' : game.isBot ? `${BOT_LEVELS[settings.difficulty].label}机器人` : '真人';
  const isMatch = G.open.length === 2 && G.deck[G.open[0]] === G.deck[G.open[1]];
  const heading = G.phase === 'finished' ? '每一次相遇，都成了一对' : game.paused ? '棋子留在这里，等你回来' : G.phase === 'settling' ? isMatch ? '是一对！收进你的小口袋' : '记住它们，下次再相遇' : game.isBot ? '小机器人正在回忆…' : G.phase === 'second' ? '另一位好朋友，藏在哪里？' : G.last === 'match' ? '好记性！再找一对吧' : G.last === 'miss' ? '轮到你啦，翻开两枚棋子' : '翻开两枚，找到好朋友';
  $('#status-heading').textContent = heading;
  $('#status-description').textContent = G.phase === 'finished' ? `共找到 ${total} 对，尝试了 ${G.attempts} 次。` : G.phase === 'settling' ? isMatch ? '每对 1 分，配对成功可以继续翻。' : '稍后盖回棋子，轮到下一位小伙伴。' : G.phase === 'second' ? `已翻开${FACES[G.deck[G.open[0]]]}，再选一枚棋子。` : '记住每一次相遇，下一对也许就在那里。';
  $('#announcement').textContent = `${$('#turn-label').textContent}。${heading}。${$('#status-description').textContent}`;
  for (let i = 0; i < 2; i++) {
    const id = G.open[i], reveal = $(`#reveal-${i}`);
    reveal.innerHTML = id === undefined ? '<span>?</span>' : `<img src="${faceImage(G.deck[id])}" alt="${FACES[G.deck[id]]}"/>`;
    reveal.classList.toggle('open', id !== undefined);
  }
  for (let i = 0; i < settings.count; i++) {
    $(`[data-player="${i}"]`).classList.toggle('active', current === i && G.phase !== 'finished');
    $(`#score-${i}`).textContent = String(G.scores[i]);
    $(`#player-state-${i}`).textContent = G.phase === 'finished' ? winners(G).includes(i) ? '记忆小高手' : '配对完成' : current === i ? game.paused ? '暂停中' : game.isBot ? '正在回忆' : '轮到你啦' : '等待回合';
    const collected = [...new Set(G.deck.filter((_, id) => G.owners[id] === i))];
    $(`#collection-${i}`).innerHTML = collected.length ? collected.slice(-4).map(face => `<img src="${faceImage(face)}" alt="已找到${FACES[face]}一对"/>`).join('') + (collected.length > 4 ? `<small>+${collected.length - 4}</small>` : '') : '<span>小口袋等你装满</span>';
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tile]').forEach(button => {
    const id = Number(button.dataset.tile), removed = G.owners[id] >= 0, open = G.open.includes(id);
    button.disabled = !game.ready || game.isBot || removed || open;
    button.setAttribute('aria-label', `第 ${id + 1} 枚，${removed ? '已配对' : open ? FACES[G.deck[id]] : '背面'}`);
    button.classList.toggle('matched', removed); button.classList.toggle('face-up', open);
    const img = button.querySelector('img')!; img.src = faceImage(open || removed ? G.deck[id] : -1);
  });
}
function frame() {
  const now = performance.now(), dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0; lastTime = now;
  const G = game.state;
  if (G.actions.length !== lastRevision) {
    const action = G.actions.at(-1); if (!game.paused && action) audio.play(action.type === 'flip' ? 'flip' : G.last === 'match' ? 'match' : 'miss');
    saveMatch(G); render();
  } else if (lastReady !== game.ready) render();
  if (G.phase === 'finished' && !resultShown && !game.paused) { resultDelay += dt; if (resultDelay >= 0.75) { audio.play('win'); showResult(); } }
}
function showResult() {
  resultShown = true; const G = game.state, best = winners(G);
  $('#result-title').textContent = best.length > 1 ? '一起成为记忆小高手！' : `${TEAMS[best[0]].name}，好记性！`;
  $('#result-description').textContent = `${best.map(teamName).join('、')}找到 ${G.scores[best[0]]} 对好朋友。`;
  $('#result-scores').innerHTML = G.scores.map((score, i) => `<div class="result-row ${best.includes(i) ? 'winner' : ''}">${avatar(i)}<span>${teamName(i)}</span>${best.includes(i) ? glyph('trophy') : ''}<strong>${score}<small> 对</small></strong></div>`).join('');
  $('#result-attempts').textContent = `${settings.pairs} 对全部找到 · 共尝试 ${G.attempts} 次`; openDialog('#result-dialog'); refreshIcons();
}
function restart() {
  audio.stop(); audio.unlock(); game.dispose(); game = new MatchGame(settings); resultShown = false; resultDelay = 0; userPaused = false;
  lastRevision = -1; lastTime = 0; scene?.setGame(game); buildPlayers(); closeDialog(); saveMatch(game.state); exposeDiagnostics();
}
function flipTile(id: number) { audio.unlock(); if (game.flip(id)) { saveMatch(game.state); render(); audio.play('flip'); } }
function renderDraft() {
  document.querySelectorAll<HTMLElement>('[data-seat]').forEach(row => { row.hidden = Number(row.dataset.seat) >= draftCount; });
  document.querySelectorAll<HTMLElement>('[data-count]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === draftCount)));
  document.querySelectorAll<HTMLElement>('[data-pairs]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.pairs) === draftPairs)));
  document.querySelectorAll<HTMLElement>('[data-owner]').forEach(button => button.setAttribute('aria-pressed', String((draftBots[Number(button.dataset.owner)] ?? false) === (button.dataset.bot === 'true'))));
  const bots = draftBots.slice(0, draftCount).filter(Boolean).length; $('#roster-summary').textContent = `${draftCount - bots} 真人 · ${bots} 机器人${bots === draftCount ? ' · 看机器人比一局' : ''}`;
  $<HTMLSelectElement>('#bot-difficulty').value = draftDifficulty;
  $<HTMLSelectElement>('#bot-difficulty').disabled = bots === 0;
  $('#difficulty-description').textContent = `${BOT_LEVELS[draftDifficulty].description}${bots ? ' 本局所有机器人使用此难度。' : ' 加入机器人后生效。'}`;
}
function showSettings(event?: Event) { draftCount = settings.count; draftPairs = settings.pairs; draftBots = [...settings.bots, false, false].slice(0, 4); draftDifficulty = settings.difficulty; renderDraft(); openDialog('#settings-dialog', event?.currentTarget as HTMLElement | undefined); }
function toggleTiles(open: boolean) { $('#tile-panel').hidden = !open; $('#tiles-button').setAttribute('aria-expanded', String(open)); if (!open) $('#tiles-button').focus(); }

$('#rules-button').addEventListener('click', () => openDialog('#rules-dialog', $('#rules-button')));
$('#settings-button').addEventListener('click', showSettings); $('#change-roster').addEventListener('click', showSettings);
for (const id of ['close-rules', 'rules-ready', 'close-settings', 'close-restart', 'cancel-restart', 'close-result']) $(`#${id}`).addEventListener('click', closeDialog);
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); }));
$('#restart-button').addEventListener('click', () => !game.state.actions.length || game.state.phase === 'finished' ? restart() : openDialog('#restart-dialog', $('#restart-button')));
$('#confirm-restart').addEventListener('click', restart); $('#play-again').addEventListener('click', restart);
$('#pause-button').addEventListener('click', () => { userPaused = !userPaused; audio.unlock(); syncPause(); });
$('#resume-button').addEventListener('click', () => { userPaused = false; audio.unlock(); syncPause(); });
$('#sound-button').addEventListener('click', () => { sound = !sound; soundPreference(); savePreferences(settings, sound); audio.unlock(); audio.suspend(game.paused); });
for (const action of ['left', 'reset', 'top', 'right']) $(`#view-${action}`).addEventListener('click', () => scene?.view(action));
$('#tiles-button').addEventListener('click', () => toggleTiles($('#tile-panel').hidden)); $('#close-tiles').addEventListener('click', () => toggleTiles(false));
$('#tile-grid').addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tile]'); if (button && !button.disabled) flipTile(Number(button.dataset.tile)); });
document.querySelectorAll<HTMLElement>('[data-count]').forEach(button => button.addEventListener('click', () => { draftCount = Number(button.dataset.count); renderDraft(); }));
document.querySelectorAll<HTMLElement>('[data-pairs]').forEach(button => button.addEventListener('click', () => { draftPairs = Number(button.dataset.pairs) as 12 | 24; renderDraft(); }));
document.querySelectorAll<HTMLElement>('[data-owner]').forEach(button => button.addEventListener('click', () => { draftBots[Number(button.dataset.owner)] = button.dataset.bot === 'true'; renderDraft(); }));
$('#bot-difficulty').addEventListener('change', () => { draftDifficulty = $<HTMLSelectElement>('#bot-difficulty').value as Difficulty; renderDraft(); });
$('#settings-form').addEventListener('submit', event => { event.preventDefault(); settings = parseSettings({ count: draftCount, pairs: draftPairs, bots: draftBots, difficulty: draftDifficulty }); savePreferences(settings, sound); restart(); });
document.addEventListener('visibilitychange', syncPause, { signal });
window.addEventListener('keydown', event => { if (event.key === 'Escape' && !activeDialog && !$('#tile-panel').hidden) toggleTiles(false); }, { signal });
const stopFullscreen = fullscreenControl($<HTMLButtonElement>('#fullscreen-button'), active => { $('#fullscreen-button').innerHTML = glyph(active ? 'minimize' : 'maximize'); refreshIcons(); }, () => toast('暂时无法切换全屏，请稍后再试。'));

function exposeDiagnostics() { if (import.meta.env.DEV) Object.assign(window, { __flip: { game, scene, state: () => game.state, diagnostics: () => scene?.diagnostics() } }); }
function showError() {
  unavailable = true; syncPause();
  const brokenScene = scene; scene = undefined; brokenScene?.dispose();
  $('#match-scene').innerHTML = '<div class="scene-loading error-state"><strong>暂时无法打开 3D 棋盘</strong><span>请使用支持 WebGL 的浏览器，或重新加载试试。已保存的对局会保留。</span><button class="primary-button" id="retry-button">重新加载</button></div>';
  $('#retry-button').addEventListener('click', () => location.reload());
}
buildPlayers(); soundPreference(); syncPause(); saveMatch(game.state);
try { scene = new MatchScene($('#match-scene'), game, frame, flipTile, showError); $('#loading').remove(); exposeDiagnostics(); }
catch (error) { console.error(error); showError(); }
function dispose() { saveMatch(game.state); listeners.abort(); clearTimeout(toastTimer); stopFullscreen(); scene?.dispose(); game.dispose(); audio.dispose(); }
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); else { game.paused = true; audio.suspend(true); } }, { signal });
window.addEventListener('pageshow', event => { if (event.persisted) syncPause(); }, { signal });
if (import.meta.hot) import.meta.hot.dispose(dispose);
