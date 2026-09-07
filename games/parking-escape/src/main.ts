import { createIcons, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, CarFront, CircleHelp, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Undo2, Redo2, Lightbulb, Pause, Play, X, Check, Flag, Settings2, LocateFixed, Grid2X2, Trophy, Star, ChevronRight } from 'lucide';
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';
import { createGame, LEVELS, type ParkingClient, type ParkingState } from './game';
import { appearance, bounds, DIFFICULTIES, EXIT, legalMove, starsFor, type Move } from './rules';
import { loadSave, persist, loadSound, saveSound } from './storage';
import { ParkingScene } from './scene';
import { ParkingAudio } from './audio';
import type { Solution } from './solver';
import './style.css';

const icons = { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, CarFront, CircleHelp, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Undo2, Redo2, Lightbulb, Pause, Play, X, Check, Flag, Settings2, LocateFixed, Grid2X2, Trophy, Star, ChevronRight };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const button = (id: string, name: string, glyph: string, extra = '') => `<button type="button" id="${id}" class="icon-button ${extra}" aria-label="${name}" data-tooltip="${name}">${icon(glyph)}</button>`;
const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } });
const number = (value: number) => String(value).padStart(2, '0');
const initial = loadSave();
let level = LEVELS[initial.level - 1];
let client: ParkingClient = createGame(level, initial.game);
let game: ParkingState = client.getState()!.G;
let seconds = initial.seconds;
const best = initial.best;
const audio = new ParkingAudio(); audio.enabled = loadSound();
let scene: ParkingScene | undefined;
let selected = 0, draftLevel = level.id, draftDifficulty = level.difficulty, userPaused = false, resultShown = false;
let activeDialog: HTMLDialogElement | null = null, lastFocus: HTMLElement | null = null;
let worker: Worker | null = null, hint: Move | null = null, searching = false, task = 0;
let unsubscribe: (() => void) | undefined;
let lastSecond = -1, wasAnimating = false, destroyed = false;
const listeners = new AbortController();
recordVisit('parking-escape');

$('#app').innerHTML = `
  <header class="header">
    <a class="brand" href="${libraryUrl(import.meta.env.BASE_URL)}" aria-label="返回游戏大厅" title="返回游戏大厅">
      <span class="back-mark">${icon('arrow-left')}</span><span class="parking-mark">P<span></span></span>
      <span><h1>益智移车出库</h1><small>PARKING ESCAPE</small></span>
    </a>
    <nav class="header-tools" aria-label="游戏工具">
      ${button('rules', '游戏规则', 'circle-help')}${button('sound', '关闭音效', 'volume-2')}${button('fullscreen', '进入全屏', 'maximize')}${button('pause', '暂停游戏', 'pause')}
      <span class="divider"></span>${button('settings', '游戏设置', 'settings-2')}
      <button id="restart" class="restart-button" aria-label="新的一局">${icon('rotate-ccw')}<span>新的一局</span></button>
    </nav>
  </header>
  <main class="play-area">
    <section class="game-space" aria-label="停车场">
      <div class="challenge-bar"><div><div class="eyebrow"><span id="level-number">第 01 关</span><span class="slash">/</span><span id="difficulty">初来乍到</span></div><h2 id="level-name">清晨出发</h2></div><div class="traffic-status" id="traffic-status"><span></span><span id="traffic-label">出口待疏通</span>${icon('flag')}</div></div>
      <div id="parking-scene"><div class="scene-loading" id="loading">停车场准备中</div></div>
      <div class="scene-tools"><span class="board-caption">城市停车场 <span>06 × 06</span></span><div class="view-tools" role="group" aria-label="停车场视角">${button('view-left', '向左旋转视角', 'rotate-ccw')}${button('view-top', '俯视停车场', 'grid2-x2')}${button('view-reset', '恢复默认视角', 'locate-fixed')}${button('view-right', '向右旋转视角', 'rotate-cw')}</div></div>
      <div class="pause-overlay" id="pause-overlay" hidden>${icon('pause')}<h2>休息一下</h2><button class="primary-button" id="resume">${icon('play')}继续游戏</button></div>
    </section>
    <aside class="sidebar" aria-label="本关状态与操作">
      <div class="mission"><span class="eyebrow">本关目标</span><div><span class="police-mark">${icon('car-front')}<i></i></span><h2>警车出库</h2><span class="solo-label">单人</span></div></div>
      <div class="stats"><div class="move-stat"><span class="eyebrow">已用步数</span><strong id="move-count">00</strong></div><div class="secondary-stats"><div><span>最少步数</span><strong id="minimum">4</strong></div><div><span>个人最佳</span><strong id="best">未通关</strong></div><div><span>本局用时</span><strong id="timer">00:00</strong></div></div></div>
      <div class="puzzle-tools" role="group" aria-label="移车工具">${button('undo', '撤销一步', 'undo-2')}${button('redo', '重做一步', 'redo-2')}<button id="hint" class="hint-button" aria-label="提示" data-tooltip="提示">${icon('lightbulb')}<span>提示</span></button></div>
      <div class="move-panel"><label class="eyebrow" for="vehicle-select">当前车辆</label><div class="vehicle-select-wrap"><span id="car-swatch"></span><select id="vehicle-select" aria-label="当前车辆"></select></div><div class="direction-controls" role="group" aria-label="移动车辆">${button('move-back', '向左移动一格', 'arrow-left', 'direction-button')}${button('move-forward', '向右移动一格', 'arrow-right', 'direction-button')}<button id="exit" class="primary-button" aria-label="警车出库">出库${icon('arrow-right')}</button></div></div>
      <div class="hint-result" id="hint-result" hidden><span id="hint-label" role="status"></span><button id="apply-hint" class="icon-button" aria-label="执行提示这一步" data-tooltip="执行提示这一步">${icon('arrow-right')}</button></div>
      <div class="chapter-progress"><div class="progress-heading"><span class="eyebrow">出库旅程</span><span id="completed">0 / ${LEVELS.length}</span></div><div class="progress-track"><span id="progress-fill"></span></div><div class="chapter-title"><span id="chapter-name">初来乍到</span><button id="all-levels" aria-label="选择关卡">全部关卡${icon('chevron-right')}</button></div><div class="chapter-levels" id="chapter-levels"></div></div>
    </aside>
  </main>
  <footer class="garage"><div class="garage-heading">${icon('car-front')}<span>本关车辆</span><strong id="car-count">9</strong></div><div class="garage-cars" id="garage-cars" role="group" aria-label="选择车辆"></div><span class="garage-end">${icon('flag')}出发有序，路路畅通</span></footer>
  <dialog id="rules-dialog" aria-labelledby="rules-title"><div class="dialog-top"><span class="eyebrow">PARKING ESCAPE</span>${button('close-rules', '关闭规则', 'x', 'close-dialog')}</div><h2 id="rules-title">游戏规则</h2><ol class="rules-list"><li><strong>各行其道</strong><p>车辆只能沿车身方向前后移动，不能转弯、横移或越过其他车辆。</p></li><li><strong>让出一条路</strong><p>黑白警车从右侧出口完全驶出，即为通关。</p></li><li><strong>少一步，更精彩</strong><p>一次连续滑动计一步，出库也计一步。达到最少步数得三星，多五步以内得二星，其余通关得一星。</p></li></ol><button class="primary-button wide close-dialog">${icon('check')}开始挑战</button></dialog>
  <dialog id="settings-dialog" aria-labelledby="settings-title"><form id="settings-form"><div class="dialog-top"><span class="eyebrow">${LEVELS.length} 个停车场</span>${button('close-settings', '关闭设置', 'x', 'close-dialog')}</div><h2 id="settings-title">选择关卡</h2><div class="difficulty-options" id="difficulty-options" role="group" aria-label="关卡难度"></div><div id="level-grid"></div><div class="settings-footer"><div class="draft-summary" id="draft-summary" role="status"></div><button type="submit" class="primary-button wide">按此关卡开始新局${icon('arrow-right')}</button></div></form></dialog>
  <dialog id="restart-dialog" aria-labelledby="restart-title"><div class="dialog-top"><span class="eyebrow">重新出发</span>${button('close-restart', '取消重开', 'x', 'close-dialog')}</div><h2 id="restart-title">重新开始这一关？</h2><p>本关车辆将回到初始位置。</p><div class="dialog-actions"><button class="secondary-button close-dialog">继续这局</button><button class="primary-button" id="confirm-restart">${icon('rotate-ccw')}重新开局</button></div></dialog>
  <dialog id="result-dialog" aria-labelledby="result-title"><div class="dialog-top"><span class="eyebrow">PARKING COMPLETE</span>${button('close-result', '查看停车场', 'x', 'close-dialog')}</div><div class="result-trophy">${icon('trophy')}</div><h2 id="result-title">顺利出库！</h2><p id="result-level"></p><div class="result-stars" id="result-stars"></div><div class="result-stats"><div><strong id="result-moves"></strong><span>移车步数</span></div><div><strong id="result-time"></strong><span>本局用时</span></div><div><strong id="result-best"></strong><span>个人最佳</span></div></div><button class="primary-button wide" id="next-level">下一关${icon('arrow-right')}</button><button class="text-button" id="play-again">${icon('rotate-ccw')}再来一局</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

const won = () => game.positions[0] === EXIT;
const paused = () => userPaused || !!activeDialog || document.hidden;
const locked = () => paused() || !!scene?.animating || destroyed;
const save = () => persist({ version: 2, level: level.id, game, seconds, best });
const timeLabel = () => `${number(Math.floor(seconds / 60))}:${number(Math.floor(seconds) % 60)}`;

function cancelHint() {
  task++; worker?.terminate(); worker = null; hint = null; searching = false;
  scene?.showHint(null); $('#hint-result').hidden = true;
}

function syncPause() {
  scene?.setPaused(paused());
  audio.suspend(document.hidden || userPaused || (!!activeDialog && activeDialog.id !== 'result-dialog'));
  $('#pause-overlay').hidden = !userPaused;
  const label = userPaused ? '继续游戏' : '暂停游戏';
  $('#pause').setAttribute('aria-label', label); $('#pause').dataset.tooltip = label;
  $('#pause').innerHTML = icon(userPaused ? 'play' : 'pause');
  renderControls();
}

function openDialog(id: string, trigger?: HTMLElement) {
  cancelHint();
  if (!activeDialog) lastFocus = trigger ?? document.activeElement as HTMLElement;
  activeDialog?.close(); activeDialog = $<HTMLDialogElement>(id); activeDialog.showModal(); syncPause();
}

function closeDialog() {
  activeDialog?.close(); activeDialog = null; syncPause();
  const target = lastFocus?.isConnected && !lastFocus.closest('[hidden]') && !lastFocus.hasAttribute('disabled') ? lastFocus : $('#restart');
  target.focus();
}

function notify(message: string) {
  $('#toast').textContent = message; $('#toast').hidden = false;
}

function getFullscreenApi() {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
  const doc = document as Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => void | Promise<void>;
  };
  if (doc.fullscreenEnabled && typeof root.requestFullscreen === 'function' && typeof doc.exitFullscreen === 'function') {
    return { element: doc.fullscreenElement, enter: () => root.requestFullscreen(), exit: () => doc.exitFullscreen() };
  }
  if ((doc.webkitFullscreenEnabled ?? doc.fullscreenEnabled) !== false && typeof root.webkitRequestFullscreen === 'function' && typeof doc.webkitExitFullscreen === 'function') {
    return { element: doc.webkitFullscreenElement, enter: () => root.webkitRequestFullscreen!(), exit: () => doc.webkitExitFullscreen!() };
  }
}

function renderFullscreen() {
  const api = getFullscreenApi(), full = Boolean(api?.element), label = full ? '退出全屏' : '进入全屏';
  $('#fullscreen').hidden = !api;
  $('#fullscreen').setAttribute('aria-label', label);
  $('#fullscreen').setAttribute('aria-pressed', String(full));
  $('#fullscreen').dataset.tooltip = label;
  $('#fullscreen').innerHTML = icon(full ? 'minimize' : 'maximize');
  refreshIcons();
}

async function toggleFullscreen() {
  const api = getFullscreenApi();
  if (!api) { renderFullscreen(); return; }
  try {
    if (api.element) await api.exit();
    else await api.enter();
  } catch { if (!destroyed) notify('暂时无法切换全屏，请稍后再试'); }
}

function renderGarage() {
  $('#garage-cars').innerHTML = level.cars.map((car, index) => `<button class="garage-car" type="button" data-car="${index}" aria-label="选择${index === 0 ? '警车' : `${number(index)} ${appearance(car.id).name}`}" aria-pressed="${index === selected}" data-tooltip="${appearance(car.id).name}" style="--car:${appearance(car.id).color}"><span class="mini-car">${icon('car-front')}</span><span>${index === 0 ? '警车' : number(index)}</span></button>`).join('');
  $('#vehicle-select').innerHTML = level.cars.map((car, index) => `<option value="${index}">${index === 0 ? '' : `${number(index)} `}${appearance(car.id).name}</option>`).join('');
  $('#car-count').textContent = String(level.cars.length);
  refreshIcons();
}

function renderProgress() {
  const completed = Object.keys(best).length;
  $('#completed').textContent = `${completed} / ${LEVELS.length}`;
  $('#progress-fill').style.width = `${completed / LEVELS.length * 100}%`;
  $('#chapter-name').textContent = DIFFICULTIES[level.difficulty];
  const start = Math.floor((level.id - 1) / 6) * 6;
  $('#chapter-levels').innerHTML = LEVELS.slice(start, start + 6).map(item => `<button type="button" data-level="${item.id}" aria-label="第 ${item.id} 关 ${item.name}" ${item.id === level.id ? 'aria-current="step"' : ''} class="${best[item.id] ? 'completed' : ''}">${number(item.id)}${best[item.id] ? icon('check') : ''}</button>`).join('');
}

function renderControls() {
  wasAnimating = !!scene?.animating;
  const disabled = locked(), finished = won(), car = level.cars[selected], range = bounds(level.cars, game.positions, selected);
  $<HTMLButtonElement>('#undo').disabled = disabled || finished || !game.past.length;
  $<HTMLButtonElement>('#redo').disabled = disabled || finished || !game.future.length;
  $<HTMLButtonElement>('#hint').disabled = disabled || finished || searching;
  $('#hint span').textContent = searching ? '思考中' : '提示';
  $<HTMLButtonElement>('#move-back').disabled = disabled || finished || range.min >= game.positions[selected];
  $<HTMLButtonElement>('#move-forward').disabled = disabled || finished || range.max <= game.positions[selected];
  $<HTMLButtonElement>('#exit').disabled = disabled || finished || bounds(level.cars, game.positions, 0).max !== EXIT;
  $<HTMLButtonElement>('#apply-hint').disabled = disabled || !hint;
  for (const [id, direction, glyph] of [['move-back', car.axis === 'x' ? '左' : '上', car.axis === 'x' ? 'arrow-left' : 'arrow-up'], ['move-forward', car.axis === 'x' ? '右' : '下', car.axis === 'x' ? 'arrow-right' : 'arrow-down']]) {
    const label = `向${direction}移动一格`;
    $(`#${id}`).setAttribute('aria-label', label); $(`#${id}`).dataset.tooltip = label; $(`#${id}`).innerHTML = icon(glyph);
  }
  $<HTMLSelectElement>('#vehicle-select').value = String(selected);
  $<HTMLSelectElement>('#vehicle-select').disabled = disabled || finished;
  $('#car-swatch').style.background = appearance(car.id).color;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-car]')) { button.setAttribute('aria-pressed', String(Number(button.dataset.car) === selected)); button.disabled = disabled || finished; }
  if (scene) scene.inputLocked = disabled || finished;
  refreshIcons();
}

function render() {
  $('#level-number').textContent = `第 ${number(level.id)} 关`; $('#level-name').textContent = level.name;
  $('#difficulty').textContent = DIFFICULTIES[level.difficulty];
  $('#move-count').textContent = number(game.past.length);
  $('#minimum').textContent = String(level.minimum);
  $('#best').textContent = best[level.id] ? `${best[level.id]} 步` : '未通关';
  $('#timer').textContent = timeLabel();
  const clear = bounds(level.cars, game.positions, 0).max === EXIT;
  $('#traffic-status').classList.toggle('clear', clear || won());
  $('#traffic-label').textContent = won() ? '顺利出库' : clear ? '出口已畅通' : '出口待疏通';
  renderControls();
}

function subscribe() {
  unsubscribe = client.subscribe(state => {
    if (!state) return;
    const changed = state.G.positions.some((p, i) => p !== game.positions[i]);
    game = state.G;
    if (changed) scene?.sync(game.positions);
    if (won()) best[level.id] = Math.min(best[level.id] ?? Infinity, game.past.length);
    render(); save();
  });
  client.start();
}

function startLevel(id: number) {
  cancelHint(); unsubscribe?.(); client.stop();
  level = LEVELS[id - 1]; selected = 0; seconds = 0; lastSecond = -1; resultShown = false; userPaused = false;
  client = createGame(level); game = client.getState()!.G;
  scene?.setLevel(level, game.positions); scene?.resetView();
  closeDialog(); $('#toast').hidden = true;
  renderGarage(); renderProgress(); subscribe(); render(); save();
}

function select(index: number) {
  if (locked() || won() || !level.cars[index]) return;
  selected = index; scene?.select(index); renderControls();
}

function move(action: Move) {
  if (locked() || !legalMove(level.cars, game.positions, action)) return;
  cancelHint(); $('#toast').hidden = true; audio.unlock();
  selected = action.car; scene?.select(selected); client.moves.slide(action); audio.play();
}

function step(direction: number) {
  let to = game.positions[selected] + direction;
  if (selected === 0 && to === 5) to = EXIT;
  move({ car: selected, to });
}

function settings(id = level.id, trigger = $('#settings')) {
  draftLevel = id;
  draftDifficulty = LEVELS[id - 1].difficulty;
  $('#difficulty-options').innerHTML = DIFFICULTIES.map((name, difficulty) => {
    const challenges = LEVELS.filter(item => item.difficulty === difficulty);
    return `<button type="button" data-difficulty="${difficulty}" aria-label="${name}" aria-pressed="${difficulty === draftDifficulty}">${name}<small>${challenges.filter(item => best[item.id]).length} / ${challenges.length}</small></button>`;
  }).join('');
  renderLevelOptions(); openDialog('#settings-dialog', trigger);
  $(`[data-draft="${draftLevel}"]`).scrollIntoView({ block: 'nearest' });
}

function renderLevelOptions() {
  document.querySelectorAll<HTMLElement>('[data-difficulty]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.difficulty) === draftDifficulty)));
  $('#level-grid').innerHTML = `<fieldset><legend>${DIFFICULTIES[draftDifficulty]} · 所有关卡均可挑战</legend><div class="level-options" role="group" aria-label="${DIFFICULTIES[draftDifficulty]}">${LEVELS.filter(item => item.difficulty === draftDifficulty).map(item => `<button type="button" data-draft="${item.id}" aria-label="第 ${item.id} 关 ${item.name}" aria-pressed="${item.id === draftLevel}" class="${best[item.id] ? 'completed' : ''}">${number(item.id)}<small>${best[item.id] ? icon('check') : `${item.minimum} 步`}</small></button>`).join('')}</div></fieldset>`;
  $('#level-grid').scrollTop = 0;
  renderDraft();
}

function renderDraft() {
  const draft = LEVELS[draftLevel - 1];
  document.querySelectorAll<HTMLElement>('[data-draft]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.draft) === draftLevel)));
  $('#draft-summary').textContent = `第 ${number(draft.id)} 关 · ${draft.name} · 最少 ${draft.minimum} 步`;
  refreshIcons();
}

function showResult() {
  resultShown = true;
  $('#result-level').textContent = `第 ${number(level.id)} 关 · ${level.name}`;
  const stars = starsFor(game.past.length, level.minimum);
  $('#result-stars').innerHTML = [1, 2, 3].map(n => `<span class="${n <= stars ? 'earned' : ''}">${icon('star')}</span>`).join('');
  $('#result-stars').setAttribute('aria-label', `${stars} 星`);
  $('#result-moves').textContent = String(game.past.length); $('#result-time').textContent = timeLabel(); $('#result-best').textContent = String(best[level.id]);
  $('#next-level').innerHTML = level.id === LEVELS.length ? `全部关卡${icon('grid2-x2')}` : `下一关${icon('arrow-right')}`;
  renderProgress(); audio.play(true); openDialog('#result-dialog'); refreshIcons();
}

function requestHint() {
  if (locked() || won() || searching) return;
  cancelHint(); searching = true; const currentTask = task;
  try {
    worker = new Worker(new URL('./hint.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Solution>) => {
      if (currentTask !== task || paused()) return;
      worker?.terminate(); worker = null; searching = false;
      if (event.data.status === 'solved' && event.data.moves.length) {
        hint = event.data.moves[0]; selected = hint.car; scene?.select(selected); scene?.showHint(hint);
        const car = level.cars[hint.car], delta = hint.to - game.positions[hint.car];
        const direction = car.axis === 'x' ? delta > 0 ? '向右' : '向左' : delta > 0 ? '向下' : '向上';
        $('#hint-label').textContent = hint.to === EXIT ? '警车可以出库了' : `${number(hint.car)} ${appearance(car.id).name} ${direction} ${Math.abs(delta)} 格`;
        $('#hint-result').hidden = false;
      } else notify(event.data.status === 'limit' ? '本次提示计算较久，请稍后再试' : '当前没有可用提示');
      renderControls();
    };
    worker.onerror = () => { if (currentTask !== task) return; cancelHint(); notify('提示暂不可用，请稍后再试'); renderControls(); };
    worker.postMessage({ cars: level.cars, positions: game.positions });
  } catch { cancelHint(); notify('提示暂不可用，请稍后再试'); }
  renderControls();
}

function frame(dt: number) {
  if (destroyed) return;
  if (!paused() && !won() && (game.past.length || game.future.length)) seconds += dt;
  if (Math.floor(seconds) !== lastSecond) { lastSecond = Math.floor(seconds); $('#timer').textContent = timeLabel(); if (lastSecond % 5 === 0) save(); }
  if (wasAnimating !== !!scene?.animating) { wasAnimating = !!scene?.animating; renderControls(); }
  if (won() && !resultShown && !scene?.animating && !paused()) showResult();
}

const on = (id: string, action: () => void) => $(id).addEventListener('click', action, { signal: listeners.signal });
on('#rules', () => openDialog('#rules-dialog', $('#rules'))); on('#settings', () => settings()); on('#all-levels', () => settings(level.id, $('#all-levels')));
on('#restart', () => { if ((game.past.length || game.future.length) && !won()) openDialog('#restart-dialog', $('#restart')); else startLevel(level.id); });
on('#confirm-restart', () => startLevel(level.id)); on('#play-again', () => startLevel(level.id));
on('#next-level', () => { if (level.id === LEVELS.length) settings(1); else startLevel(level.id + 1); });
on('#pause', () => { cancelHint(); userPaused = !userPaused; syncPause(); });
on('#resume', () => { userPaused = false; syncPause(); });
on('#undo', () => { if (!locked() && !won() && game.past.length) { cancelHint(); client.moves.back(); } });
on('#redo', () => { if (!locked() && !won() && game.future.length) { cancelHint(); client.moves.forward(); } });
on('#hint', requestHint); on('#apply-hint', () => { if (hint) move(hint); });
on('#move-back', () => step(-1)); on('#move-forward', () => step(1)); on('#exit', () => move({ car: 0, to: EXIT }));
on('#view-left', () => scene?.rotate(-1)); on('#view-right', () => scene?.rotate(1)); on('#view-top', () => scene?.topView()); on('#view-reset', () => scene?.resetView());
function renderSound() {
  const label = audio.enabled ? '关闭音效' : '开启音效';
  $('#sound').setAttribute('aria-label', label); $('#sound').setAttribute('aria-pressed', String(audio.enabled)); $('#sound').dataset.tooltip = label;
  $('#sound').innerHTML = icon(audio.enabled ? 'volume-2' : 'volume-x'); refreshIcons();
}
on('#sound', () => { audio.enabled = !audio.enabled; saveSound(audio.enabled); audio.unlock(); audio.suspend(paused()); renderSound(); });
on('#fullscreen', () => { void toggleFullscreen(); });
for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, renderFullscreen, { signal: listeners.signal });
for (const event of ['fullscreenerror', 'webkitfullscreenerror']) document.addEventListener(event, () => notify('暂时无法切换全屏，请稍后再试'), { signal: listeners.signal });
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', closeDialog, { signal: listeners.signal }));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); }, { signal: listeners.signal }));
$('#settings-form').addEventListener('submit', event => { event.preventDefault(); startLevel(draftLevel); }, { signal: listeners.signal });
$('#difficulty-options').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-difficulty]'); if (button) { draftDifficulty = Number(button.dataset.difficulty); renderLevelOptions(); } }, { signal: listeners.signal });
$('#level-grid').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-draft]'); if (button) { draftLevel = Number(button.dataset.draft); renderDraft(); } }, { signal: listeners.signal });
$('#chapter-levels').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-level]'); if (button) settings(Number(button.dataset.level), button); }, { signal: listeners.signal });
$('#garage-cars').addEventListener('click', event => { const button = (event.target as Element).closest<HTMLElement>('[data-car]'); if (button) select(Number(button.dataset.car)); }, { signal: listeners.signal });
$('#vehicle-select').addEventListener('change', event => select(Number((event.target as HTMLSelectElement).value)), { signal: listeners.signal });
document.addEventListener('pointerdown', () => { if (!paused()) audio.unlock(); }, { signal: listeners.signal });
document.addEventListener('visibilitychange', () => { cancelHint(); syncPause(); save(); }, { signal: listeners.signal });
document.addEventListener('keydown', event => {
  if (locked() || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.matches('input, select, textarea, button, a'))) return;
  const axis = level.cars[selected].axis;
  const direction = (axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']).indexOf(event.key);
  if (direction !== -1) { event.preventDefault(); step(direction ? 1 : -1); }
}, { signal: listeners.signal });

function sceneError() {
  $('#loading')?.remove();
  $('#parking-scene').insertAdjacentHTML('beforeend', '<div class="scene-error" role="alert"><h2>停车场暂时无法显示</h2><p>请重新加载页面，或使用支持 WebGL 的浏览器。</p><button class="primary-button" id="reload">重新加载</button></div>');
  on('#reload', () => location.reload());
}

renderGarage(); renderProgress(); renderSound(); renderFullscreen(); render();
try {
  scene = new ParkingScene($('#parking-scene'), { select, move, frame, error: sceneError });
  scene.setLevel(level, game.positions); $('#loading').remove();
} catch (error) { console.error(error); sceneError(); }
subscribe(); syncPause();

if (import.meta.env.DEV) {
  Object.assign(window, { __parking: {
    get state() { return game; }, get level() { return level; }, get paused() { return paused(); }, get animating() { return scene?.animating; }, get seconds() { return seconds; },
    move, scene, get hint() { return hint; },
  } });
}

function dispose() {
  if (destroyed) return;
  save(); destroyed = true; cancelHint(); unsubscribe?.(); client.stop(); listeners.abort(); scene?.dispose(); audio.dispose();
}
window.addEventListener('pagehide', event => { if (event.persisted) { cancelHint(); scene?.setPaused(true); audio.suspend(true); save(); } else dispose(); }, { signal: listeners.signal });
window.addEventListener('pageshow', event => { if (event.persisted) { syncPause(); renderFullscreen(); } }, { signal: listeners.signal });
if (import.meta.hot) import.meta.hot.dispose(dispose);
