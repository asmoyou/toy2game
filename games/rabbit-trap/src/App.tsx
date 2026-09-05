import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';
import { Client } from "boardgame.io/client";
import type { State as EngineState } from "boardgame.io";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Carrot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudLightning,
  Bot,
  UserRound,
  Eye,
  Flag,
  Flower2,
  Footprints,
  Focus,
  Layers3,
  Leaf,
  Maximize2,
  Maximize,
  Minimize,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  Rabbit,
  RotateCcw,
  RotateCw,
  Settings2,
  Sparkles,
  Star,
  ShieldCheck,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  chooseToken,
  COLORS,
  FINISH,
  NAMES,
  RabbitGame,
  routeFor,
  upgradeSavedGame,
  resolveLanding,
  effectText,
  isStunned,
  movableTokens,
  weatherText,
  type Mode,
  type PlayerConfig,
  type RabbitState,
  type Token,
} from "./game";
import { RabbitScene } from "./scene";
import { isSoundEnabled, playSound, setSound } from "./sound";
import {
  DISCOVERIES,
  DISCOVERY_NAMES,
  GROUND_COUNT,
  zoneFor,
  type Discovery,
  FEATURE_INFO,
  type FeatureKind,
} from "./world";

type GameClient = ReturnType<typeof Client<RabbitState>>;
type State = NonNullable<ReturnType<GameClient["getState"]>>;
type SavedGame = {
  version: 1;
  mode?: Mode;
  players?: PlayerConfig[];
  state: EngineState<RabbitState>;
};
type ModalType = "settings" | "restart" | "rules" | "history" | "win" | null;
const SAVE_KEY = "little-rabbit-match-v1";
recordVisit('rabbit-trap');
const DEFAULT_PLAYERS: PlayerConfig[] = [
  { bot: false },
  { bot: true },
  { bot: true },
];

function getFullscreenApi() {
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void | Promise<void>;
  };
  const doc = document as Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => void | Promise<void>;
  };
  if (
    doc.fullscreenEnabled &&
    typeof root.requestFullscreen === "function" &&
    typeof doc.exitFullscreen === "function"
  ) {
    return {
      element: doc.fullscreenElement,
      enter: () => root.requestFullscreen(),
      exit: () => doc.exitFullscreen(),
    };
  }
  if (
    (doc.webkitFullscreenEnabled ?? doc.fullscreenEnabled) !== false &&
    typeof root.webkitRequestFullscreen === "function" &&
    typeof doc.webkitExitFullscreen === "function"
  ) {
    return {
      element: doc.webkitFullscreenElement,
      enter: () => root.webkitRequestFullscreen!(),
      exit: () => doc.webkitExitFullscreen!(),
    };
  }
}

function readSaved(): SavedGame | undefined {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SAVE_KEY) ?? "null",
    ) as SavedGame | null;
    if (!saved || saved.version !== 1) return;
    const legacyCount =
      saved.mode === "solo" ? 3 : saved.mode === "duo" ? 2 : 4;
    const participants =
      saved.players ??
      Array.from({ length: legacyCount }, (_, i) => ({
        bot: saved.mode === "solo" && i > 0,
      }));
    if (
      !Array.isArray(participants) ||
      participants.length < 2 ||
      participants.length > 4 ||
      !participants.every((participant) => typeof participant.bot === "boolean")
    )
      return;
    saved.players = participants;
    const count = participants.length;
    const state = saved.state;
    if (
      state.ctx.numPlayers !== count ||
      state.G.tokens.length !== count * 3 ||
      !Array.isArray(state.G.deck) ||
      !Array.isArray(state.G.holes) ||
      !state.plugins.random?.data?.seed
    )
      return;
    upgradeSavedGame(state.G, count);
    if (
      !["draw", "select", "rotate"].includes(state.G.stage) ||
      !state.G.tokens.every(
        (t) =>
          Number.isInteger(t.position) &&
          t.position >= -2 &&
          t.position <= FINISH,
      )
    )
      return;
    return saved;
  } catch {
    return;
  }
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-tooltip={label}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <IconButton label="关闭" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}

function GameScreen({
  players,
  weatherEnabled,
  saved,
  onNew,
}: {
  players: PlayerConfig[];
  weatherEnabled: boolean;
  saved?: SavedGame;
  onNew: (players: PlayerConfig[], weatherEnabled: boolean) => void;
}) {
  const numPlayers = players.length;
  const humanCount = players.filter((player) => !player.bot).length;
  const client = useMemo(() => {
    const gameClient = Client<RabbitState>({
      game: RabbitGame,
      numPlayers,
      debug: false,
    });
    if (saved)
      gameClient.store.dispatch({
        type: "RESET",
        state: saved.state,
        clientOnly: true,
      });
    else gameClient.moves.configureWeather(weatherEnabled);
    return gameClient;
  }, [numPlayers, saved, weatherEnabled]);
  const [state, setState] = useState<State>(() => client.getState()!);
  const [settledStrike, setSettledStrike] = useState(
    () => state.G.weather.lastStrike?.id ?? 0,
  );
  const handledStrike = useRef(settledStrike);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const weatherClock = useRef<{
    revision: number;
    accumulated: number;
    startedAt: number | null;
  }>({ revision: -1, accumulated: 0, startedAt: null });
  const canStrike = useRef(false);
  const [busy, setBusy] = useState(false);
  const [completedAction, setCompletedAction] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(
    () => Boolean(getFullscreenApi()?.element),
  );
  const [sound, updateSound] = useState(isSoundEnabled);
  const [rotating, setRotating] = useState(false);
  const [following, setFollowing] = useState(false);
  const [discoveryToast, setDiscoveryToast] = useState<Discovery | null>(null);
  const [effectNotice, setEffectNotice] = useState<string | null>(null);
  const [winnerPortrait, setWinnerPortrait] = useState<string>();
  const noticedAction = useRef(saved?.state.G.action.id ?? -1);
  const [modal, setModal] = useState<ModalType>(null);
  const [newPlayers, setNewPlayers] = useState<PlayerConfig[]>(
    players.map((player) => ({ ...player })),
  );
  const [newPlayerCount, setNewPlayerCount] = useState(numPlayers);
  const [newWeather, setNewWeather] = useState(weatherEnabled);
  const [sceneError, setSceneError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sceneHost = useRef<HTMLDivElement>(null);
  const board = useRef<RabbitScene | null>(null);
  const selectRef = useRef<(id: string) => void>(() => {});
  const exploreRef = useRef<(id: Discovery) => void>(() => {});
  const lastAction = useRef<number>(-1);
  const animationVersion = useRef(0);
  const winShown = useRef(false);
  const { G, ctx } = state;
  const player = Number(ctx.currentPlayer);
  const humanTurn = !players[player].bot;
  const animationComplete = completedAction === G.action.id;
  const displayPlayer = animationComplete ? player : G.action.player;
  const lightningComplete = settledStrike >= (G.weather.lastStrike?.id ?? 0);
  const canAct =
    animationComplete &&
    lightningComplete &&
    !busy &&
    !paused &&
    pageVisible &&
    !modal &&
    !ctx.gameover;
  canStrike.current = canAct;
  const selectable =
    G.stage === "select" && humanTurn && canAct ? movableTokens(G, player) : [];
  const mustRest =
    G.stage !== "rotate" && !movableTokens(G, player).length && !ctx.gameover;
  const openSettings = () => {
    setNewPlayers(players.map((player) => ({ ...player })));
    setNewPlayerCount(numPlayers);
    setNewWeather(G.weather.enabled);
    setModal("settings");
  };
  const restartMatch = () => onNew(players, G.weather.enabled);
  const requestRestart = () => {
    const hasProgress =
      G.action.id > 0 || G.discoveries.length > 0 || G.weather.strikes > 0;
    if (hasProgress && !ctx.gameover) setModal("restart");
    else restartMatch();
  };
  const playerName = (id: number) =>
    humanCount === 1 && !players[id].bot ? "你" : NAMES[id];
  selectRef.current = (id) => {
    if (selectable.some((token) => token.id === id)) client.moves.hop(id);
  };
  const previewToken = (token: Token) => {
    if (typeof G.card !== "number" || isStunned(G, token)) return;
    const route = routeFor(token, G.card);
    if (!route.length) return;
    board.current?.showPreview(
      route,
      resolveLanding(G, token, route[route.length - 1]).effects,
    );
  };
  exploreRef.current = (id) => {
    if (!paused && !modal && !ctx.gameover && !G.discoveries.includes(id)) {
      client.moves.discover(id);
      setDiscoveryToast(id);
    }
  };

  useEffect(() => {
    client.start();
    const unsubscribe = client.subscribe((next) => {
      if (next) setState(next);
    });
    return () => {
      unsubscribe();
      client.stop();
    };
  }, [client]);

  useEffect(() => {
    try {
      lastAction.current = -1;
      board.current = new RabbitScene(
        sceneHost.current!,
        (id) => selectRef.current(id),
        (id) => exploreRef.current(id),
        G.features,
        () => setFollowing(false),
      );
      setLoaded(true);
    } catch (error) {
      console.error("Unable to initialize the 3D board", error);
      setSceneError(true);
    }
    return () => {
      animationVersion.current++;
      board.current?.dispose();
      board.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ version: 1, players, state: client.store.getState() }),
      );
    } catch {
      /* The game also works when storage is unavailable. */
    }
    if (!board.current || lastAction.current === G.action.id) return;
    lastAction.current = G.action.id;
    const version = ++animationVersion.current;
    setBusy(true);
    void board.current
      .sync(G, numPlayers, ctx.gameover)
      .then(() => {
        if (version === animationVersion.current) {
          setCompletedAction(G.action.id);
          setBusy(false);
        }
      })
      .catch((error) => {
        console.error(error);
        setBusy(false);
      });
  }, [G, state, players, numPlayers, loaded, client]);

  useEffect(() => {
    board.current?.setSelectable(selectable.map((t) => t.id));
  }, [selectable]);

  useEffect(() => {
    board.current?.setDiscoveries(G.discoveries);
    board.current?.setSceneryEnabled(!paused && !modal && pageVisible);
    board.current?.setWeatherPaused(
      paused || Boolean(modal) || !pageVisible || Boolean(ctx.gameover),
    );
  }, [G.discoveries, paused, modal, loaded, pageVisible, ctx.gameover]);

  useEffect(() => {
    const change = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  useEffect(() => {
    const update = () =>
      setFullscreen(Boolean(getFullscreenApi()?.element));
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  useEffect(() => {
    board.current?.setWeatherState(G.weather);
  }, [G.weather, loaded]);

  useEffect(() => {
    const clock = weatherClock.current;
    if (clock.revision !== G.weather.revision) {
      clock.revision = G.weather.revision;
      clock.accumulated = 0;
      clock.startedAt = null;
    }
    if (
      !G.weather.enabled ||
      paused ||
      modal ||
      !pageVisible ||
      !loaded ||
      ctx.gameover
    )
      return;
    clock.startedAt = performance.now();
    const untilStrike = G.weather.strikeIn <= 0 ? 0.35 : G.weather.strikeIn;
    const untilEvent = Math.min(
      G.weather.duration - G.weather.elapsed,
      untilStrike,
    );
    const timer = window.setTimeout(
      () => {
        const elapsed = Math.min(
          60,
          clock.accumulated + (performance.now() - clock.startedAt!) / 1000,
        );
        clock.accumulated = 0;
        clock.startedAt = null;
        client.moves.weatherAdvance(elapsed, canStrike.current);
      },
      Math.max(0.05, untilEvent - clock.accumulated) * 1000,
    );
    return () => {
      window.clearTimeout(timer);
      if (clock.startedAt !== null)
        clock.accumulated += (performance.now() - clock.startedAt) / 1000;
      clock.startedAt = null;
    };
  }, [
    G.weather.revision,
    G.weather.enabled,
    paused,
    modal,
    pageVisible,
    loaded,
    ctx.gameover,
    client,
  ]);

  useEffect(() => {
    const strike = G.weather.lastStrike;
    if (
      !loaded ||
      !board.current ||
      !strike ||
      strike.id <= handledStrike.current
    )
      return;
    handledStrike.current = strike.id;
    const version = animationVersion.current;
    void board.current
      .animateLightning(strike, G)
      .then(() => {
        if (version === animationVersion.current) {
          setSettledStrike(strike.id);
          setEffectNotice(weatherText(G, strike));
        }
      })
      .catch((error) => {
        console.error(error);
        setSettledStrike(strike.id);
      });
  }, [G.weather.lastStrike?.id, loaded]);

  useEffect(() => {
    if (!discoveryToast) return;
    const timer = window.setTimeout(() => setDiscoveryToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [discoveryToast]);

  useEffect(() => {
    if (!animationComplete || noticedAction.current === G.action.id) return;
    noticedAction.current = G.action.id;
    const notices = [...new Set(G.action.effects?.map(effectText) ?? [])].slice(
      0,
      2,
    );
    if (G.action.recovered?.length && !notices.length)
      notices.push("小兔恢复精神啦");
    if (notices.length) setEffectNotice(notices.join(" · "));
  }, [animationComplete, G.action]);
  useEffect(() => {
    if (!effectNotice) return;
    const timer = window.setTimeout(() => setEffectNotice(null), 2700);
    return () => window.clearTimeout(timer);
  }, [effectNotice]);

  useEffect(() => {
    if (humanTurn || !canAct || !loaded || sceneError) return;
    const timer = window.setTimeout(
      () => {
        const current = client.getState();
        if (
          !current ||
          current.ctx.gameover ||
          current.ctx.currentPlayer !== String(player) ||
          current.G.action.id !== G.action.id ||
          current.G.weather.lastStrike?.id !== G.weather.lastStrike?.id
        )
          return;
        if (mustRest) client.moves.rest();
        else if (G.stage === "draw") {
          if (!movableTokens(G, player).length) client.moves.rest();
          else client.moves.draw();
        } else if (G.stage === "rotate") client.moves.rotate();
        else {
          const id = chooseToken(G, player);
          if (id) client.moves.hop(id);
        }
      },
      G.stage === "draw" ? 1100 : 1400,
    );
    return () => window.clearTimeout(timer);
  }, [G, canAct, humanTurn, client, player, loaded, sceneError]);

  useEffect(() => {
    if (ctx.gameover && animationComplete && !busy && !winShown.current) {
      winShown.current = true;
      setWinnerPortrait(board.current?.winnerPortrait());
      setModal("win");
      playSound("win");
    }
  }, [ctx.gameover, animationComplete, busy]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __rabbit: { client, diagnostics: () => board.current?.getDiagnostics() },
    });
  }, [client, loaded]);

  const act = () => {
    if (!canAct || !humanTurn) return;
    if (mustRest) {
      client.moves.rest();
      return;
    }
    if (G.stage === "draw") {
      if (mustRest) client.moves.rest();
      else client.moves.draw();
    }
    if (G.stage === "rotate") client.moves.rotate();
  };
  const toggleSound = () => {
    setSound(!sound);
    updateSound(!sound);
    if (!sound) playSound("hop");
  };
  const toggleFullscreen = async () => {
    const api = getFullscreenApi();
    if (!api) return;
    try {
      if (api.element) await api.exit();
      else await api.enter();
    } catch {
      setEffectNotice("暂时无法切换全屏");
    }
  };
  const round = Math.floor((ctx.turn - 1) / numPlayers) + 1;
  const pendingCard = G.card;
  const ranking = Array.from({ length: numPlayers }, (_, id) => ({
    id,
    progress: Math.max(
      0,
      ...G.tokens
        .filter((token) => token.player === id)
        .map((token) => token.position + 1),
    ),
    stars: G.stars[id],
    winner: ctx.gameover?.winner === String(id),
  })).sort(
    (a, b) =>
      Number(b.winner) - Number(a.winner) ||
      b.progress - a.progress ||
      b.stars - a.stars,
  );
  const leader = Math.max(
    -1,
    ...G.tokens
      .filter((t) => t.player === displayPlayer)
      .map((t) => t.position),
  );
  const actionTitle = ctx.gameover
    ? "冒险圆满结束"
    : mustRest
      ? "小兔需要休息"
      : paused
        ? "休息一下，再出发"
        : busy && G.action.kind === "rotate"
          ? "机关转动中…"
          : busy && G.action.kind === "move"
            ? "小兔前进中…"
            : pendingCard === "carrot"
              ? "惊喜？还是惊险？"
              : typeof pendingCard === "number"
                ? `前进 ${pendingCard} 格`
                : humanTurn
                  ? humanCount === 1
                    ? "轮到你出发啦！"
                    : `轮到${NAMES[player]}啦！`
                  : `${NAMES[player]}的回合`;
  const actionSubtitle = ctx.gameover
    ? "新的冒险，还在前方"
    : mustRest
      ? "眩晕一回合 · 休息后恢复"
      : paused
        ? "本局进度已保留"
        : pendingCard === "carrot"
          ? "胡萝卜机关卡"
          : typeof pendingCard === "number"
            ? `${NAMES[player]}的小兔整装待发`
            : `${G.deck.length} 张卡牌 · 山顶的胡萝卜在等你`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={libraryUrl(import.meta.env.BASE_URL)} aria-label="返回游戏大厅" title="返回游戏大厅">
          <span className="brand-symbol">
            <ArrowLeft size={26} strokeWidth={1.7} />
          </span>
          <span className="brand-wordmark">
            Little Rabbit<span>小兔闯关俱乐部</span>
          </span>
        </a>
        <div className="mode-indicator">
          <span className="live-dot" />
          <span>
            {humanCount === numPlayers
              ? `${numPlayers} 人对战`
              : `${humanCount} 真人 · ${numPlayers - humanCount} 机器人`}
          </span>
        </div>
        <div className="header-actions">
          {getFullscreenApi() && (
            <IconButton
              label={fullscreen ? "退出全屏" : "进入全屏"}
              active={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize size={21} /> : <Maximize size={21} />}
            </IconButton>
          )}
          <IconButton
            label={sound ? "关闭音效" : "开启音效"}
            active={sound}
            onClick={toggleSound}
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </IconButton>
          <IconButton label="游戏规则" onClick={() => setModal("rules")}>
            <CircleHelp size={19} />
          </IconButton>
          <IconButton label="游戏设置" onClick={openSettings}>
            <Settings2 size={19} />
          </IconButton>
          <span className="header-divider" />
          <button
            className="new-game-button"
            aria-label="新的一局"
            title="新的一局"
            onClick={requestRestart}
          >
            <RotateCcw size={15} />
            <span>新的一局</span>
          </button>
        </div>
      </header>

      <main className="game-space">
        <div className="scene-host" ref={sceneHost} data-testid="scene">
          {!loaded && !sceneError && (
            <div className="scene-loading">
              <Rabbit size={34} />
              <span>小兔正在集合…</span>
            </div>
          )}
          {sceneError && (
            <div className="scene-error">
              <Mountain size={36} />
              <h2>三维棋盘未能加载</h2>
              <p>请启用浏览器硬件加速后重试。</p>
              <button
                className="primary-button"
                onClick={() => location.reload()}
              >
                重新加载
              </button>
            </div>
          )}
        </div>

        <aside className="left-panel">
          <div className="world-heading">
            <div className="eyebrow">
              <span />
              花园大冒险
            </div>
            <h1>
              小兔闯关<span className="title-period">.</span>
            </h1>
            <p>环游花园，登上胡萝卜山</p>
            <div className="world-chips">
              <span>
                <Flower2 size={13} />
                春日花园
              </span>
              <span>{FINISH} 格大冒险</span>
            </div>
          </div>
          <section className="roster" aria-label="本局玩家">
            <div className="section-label">
              <span>冒险小队</span>
              <span>0{numPlayers}</span>
            </div>
            <div className="players">
              {Array.from({ length: numPlayers }, (_, id) => {
                const tokens = G.tokens.filter((t) => t.player === id);
                const best = Math.max(...tokens.map((t) => t.position));
                const active = displayPlayer === id && !ctx.gameover;
                const out = tokens.every((t) => t.position === -2);
                return (
                  <div
                    key={id}
                    className={`player-row ${active ? "current" : ""} ${out ? "eliminated" : ""}`}
                    style={
                      { "--player-color": COLORS[id] } as React.CSSProperties
                    }
                  >
                    <div className="player-avatar">
                      <Rabbit size={27} strokeWidth={1.6} />
                    </div>
                    <div className="player-info">
                      <div className="player-name">
                        {NAMES[id]}
                        <span className="player-kind">
                          {players[id].bot
                            ? "电脑"
                            : humanCount === 1
                              ? "你"
                              : `P${id + 1}`}
                        </span>
                        <span
                          className="player-stars"
                          aria-label={`${G.stars[id]} 颗星星`}
                        >
                          <Star size={13} fill="currentColor" />
                          {G.stars[id]}
                        </span>
                      </div>
                      <div
                        className="rabbit-lives"
                        aria-label={`${tokens.filter((t) => t.position >= -1).length} 只兔子剩余`}
                      >
                        {tokens.map((token) => (
                          <Rabbit
                            key={token.id}
                            size={13}
                            strokeWidth={2}
                            className={
                              token.position === -2
                                ? "lost"
                                : isStunned(G, token)
                                  ? "stunned-life"
                                  : ""
                            }
                          />
                        ))}
                        <span>
                          {out
                            ? "已出局"
                            : best >= FINISH
                              ? "已登顶"
                              : best < 0
                                ? "整装待发"
                                : `${best + 1} / ${FINISH}`}
                        </span>
                      </div>
                    </div>
                    {active && (
                      <ChevronRight className="player-chevron" size={16} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="activity-preview">
            <button
              className="section-label activity-title"
              onClick={() => setModal("history")}
            >
              <span>冒险动态</span>
              <Clock3 size={14} />
            </button>
            {G.history.length ? (
              G.history.slice(0, 2).map((log) => (
                <div className="activity-line" key={log.id}>
                  <span style={{ background: COLORS[log.player] }} />
                  <p>
                    <b>{playerName(log.player)}</b> {log.text}
                  </p>
                </div>
              ))
            ) : (
              <div className="activity-line">
                <span />
                <p>小队已集合，冒险即将开始</p>
              </div>
            )}
          </section>
          <div className="side-flower">
            <Flower2 size={27} strokeWidth={1.2} />
            <span>GOOD TIMES, LITTLE HOPS.</span>
          </div>
        </aside>

        <section className="discovery-dock" aria-label="花园探索">
          <div className="section-label">
            <span>花园徽章</span>
            <span>{G.discoveries.length} / 3</span>
          </div>
          <div className="discovery-buttons">
            {DISCOVERIES.map((id) => {
              const Icon =
                id === "mushroom" ? Flower2 : id === "pond" ? Waves : Wind;
              return (
                <button
                  key={id}
                  className={`discovery-button ${G.discoveries.includes(id) ? "discovered" : ""}`}
                  aria-label={DISCOVERY_NAMES[id]}
                  title={DISCOVERY_NAMES[id]}
                  disabled={paused || Boolean(modal)}
                  onClick={() => board.current?.explore(id)}
                >
                  <Icon size={25} />
                  {G.discoveries.includes(id) && (
                    <Check size={13} className="discovery-check" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="board-topline">
          <div
            className="turn-indicator"
            style={
              { "--player-color": COLORS[displayPlayer] } as React.CSSProperties
            }
          >
            <span />
            {ctx.gameover
              ? "本局已结束"
              : paused
                ? "游戏已暂停"
                : `${humanCount === 1 && !players[displayPlayer].bot ? "你的" : NAMES[displayPlayer] + "的"}回合`}
            <span className="turn-separator" />第{" "}
            {String(round).padStart(2, "0")} 回合
          </div>
          <div className="board-edition">
            <Mountain size={16} />
            <span>{zoneFor(leader)}</span>
            <b>{leader < GROUND_COUNT ? "草地" : "山路"}</b>
          </div>
        </div>

        <div className="scene-tools" aria-label="视角工具">
          <div className="mobile-pause">
            <IconButton
              label={paused ? "继续游戏" : "暂停游戏"}
              active={paused}
              disabled={Boolean(ctx.gameover)}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={20} /> : <Pause size={20} />}
            </IconButton>
          </div>
          <IconButton
            label="跟随小兔"
            active={following}
            onClick={() => {
              board.current?.setFollowing(!following);
              setFollowing(!following);
            }}
          >
            <Focus size={22} />
          </IconButton>
          <IconButton label="放大" onClick={() => board.current?.zoom(1)}>
            <Plus size={19} />
          </IconButton>
          <IconButton label="缩小" onClick={() => board.current?.zoom(-1)}>
            <Minus size={19} />
          </IconButton>
          <span />
          <IconButton
            label="重置视角"
            onClick={() => board.current?.resetView()}
          >
            <Maximize2 size={17} />
          </IconButton>
          <IconButton
            label={rotating ? "停止旋转" : "环绕查看"}
            active={rotating}
            onClick={() =>
              setRotating(board.current?.toggleRotation() ?? false)
            }
          >
            <RotateCw size={17} />
          </IconButton>
        </div>

        <div
          className={`weather-status ${G.weather.enabled ? "storm" : ""}`}
          aria-label={G.weather.enabled ? "雷云巡游" : "晴天"}
        >
          {G.weather.enabled ? <CloudLightning size={21} /> : <Sun size={21} />}
          <span>{G.weather.enabled ? "雷云" : "晴天"}</span>
        </div>

        <div className="bottom-status">
          <span className="status-leaf">
            <Leaf size={17} />
          </span>
          <div>
            <strong>{zoneFor(leader)}</strong>
            <span>
              {Math.max(0, leader + 1)} / {FINISH} 格 · {G.holes.length} 处陷阱
            </span>
          </div>
          <span className="bottom-status-divider" />
          <IconButton
            label={paused ? "继续游戏" : "暂停游戏"}
            active={paused}
            disabled={Boolean(ctx.gameover)}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </IconButton>
        </div>

        {effectNotice && !modal && (
          <div className="discovery-toast effect-toast" role="status">
            <Sparkles size={23} />
            <span>{effectNotice}</span>
          </div>
        )}
        {discoveryToast && !effectNotice && (
          <div className="discovery-toast" role="status">
            <Star size={22} fill="currentColor" />
            <span>
              {G.discoveries.length === 3
                ? "花园探索家！"
                : `发现${DISCOVERY_NAMES[discoveryToast]}`}
            </span>
          </div>
        )}

        <section
          className={`action-area ${paused ? "is-paused" : ""}`}
          aria-label="回合操作"
        >
          <button
            type="button"
            onClick={act}
            disabled={!canAct || !humanTurn || G.stage === "select" || mustRest}
            className={`playing-card ${pendingCard ? "revealed" : ""} ${pendingCard === "carrot" ? "trap-card" : ""}`}
            style={
              { "--card-color": COLORS[displayPlayer] } as React.CSSProperties
            }
            data-player={displayPlayer}
            key={pendingCard ? G.action.id : "deck"}
            aria-label={
              pendingCard === "carrot"
                ? "胡萝卜机关卡"
                : pendingCard
                  ? `前进${pendingCard}格卡牌`
                  : "待抽取的卡牌"
            }
          >
            <span className="card-corner">
              {pendingCard === "carrot" ? (
                <RotateCw size={12} />
              ) : (
                (pendingCard ?? <Sparkles size={12} />)
              )}
            </span>
            {typeof pendingCard === "number" ? (
              <>
                <Rabbit className="card-rabbit" size={43} strokeWidth={1.4} />
                <div className="card-steps">
                  {Array.from({ length: pendingCard }, (_, i) => (
                    <Carrot size={12} key={i} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <Carrot className="card-carrot" size={46} strokeWidth={1.25} />
                <span className="card-wordmark">
                  {pendingCard === "carrot" ? "TWIST!" : "LITTLE RABBIT"}
                </span>
              </>
            )}
            <span className="card-corner bottom">
              {pendingCard === "carrot" ? (
                <RotateCw size={12} />
              ) : (
                (pendingCard ?? <Sparkles size={12} />)
              )}
            </span>
            <span className="card-owner">{NAMES[displayPlayer]}</span>
          </button>
          <div className="action-content" aria-live="polite">
            <div className="action-kicker">
              <span />
              {ctx.gameover
                ? "FINISH LINE"
                : humanTurn
                  ? "YOUR LITTLE ADVENTURE"
                  : "A LITTLE PATIENCE"}
            </div>
            <h2>{actionTitle}</h2>
            <p>{actionSubtitle}</p>
            {ctx.gameover ? (
              <button
                className="primary-button"
                onClick={() => setModal("win")}
              >
                <Trophy size={17} />
                查看结算
                <ArrowRight size={17} />
              </button>
            ) : paused ? (
              <button
                className="primary-button"
                onClick={() => setPaused(false)}
              >
                <Play size={17} />
                继续冒险
                <ArrowRight size={17} />
              </button>
            ) : G.stage === "select" && humanTurn && !mustRest ? (
              <div className="token-choices" aria-label="选择兔子">
                {G.tokens
                  .filter((t) => t.player === player)
                  .map((token) => (
                    <button
                      key={token.id}
                      className={`token-choice ${isStunned(G, token) ? "token-is-stunned" : ""}`}
                      style={
                        {
                          "--player-color": COLORS[player],
                        } as React.CSSProperties
                      }
                      disabled={
                        !canAct || token.position === -2 || isStunned(G, token)
                      }
                      aria-label={`选择 ${token.index + 1} 号兔`}
                      onClick={() => selectRef.current(token.id)}
                      onPointerDown={() => previewToken(token)}
                      onMouseEnter={() => previewToken(token)}
                      onFocus={() => previewToken(token)}
                      onMouseLeave={() => board.current?.clearPreview()}
                      onBlur={() => board.current?.clearPreview()}
                    >
                      <Rabbit size={19} />
                      <span className="token-number">{token.index + 1}</span>
                      <span className="token-label">号兔</span>
                      {isStunned(G, token) && (
                        <span className="token-stun" aria-label="眩晕一回合">
                          <Zap size={13} />1
                        </span>
                      )}
                      {token.shield && (
                        <ShieldCheck
                          className="token-shield"
                          size={19}
                          aria-label="有护盾"
                        />
                      )}
                      {token.position === -2 ? (
                        <X size={13} />
                      ) : (
                        <ArrowRight size={13} />
                      )}
                    </button>
                  ))}
              </div>
            ) : (
              <button
                className={`primary-button ${G.stage === "rotate" ? "carrot-button" : ""}`}
                onClick={act}
                disabled={!canAct || !humanTurn || sceneError}
              >
                {!humanTurn ? (
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : G.stage === "rotate" ? (
                  <RotateCw size={17} />
                ) : (
                  <Layers3 size={17} />
                )}
                <span>
                  {!humanTurn
                    ? "小兔思考中"
                    : busy
                      ? "冒险进行中"
                      : G.stage === "rotate"
                        ? "转动胡萝卜"
                        : mustRest
                          ? "休息一回合"
                          : "抽一张卡牌"}
                </span>
                {humanTurn && <ArrowRight size={17} />}
              </button>
            )}
          </div>
        </section>

        <footer className="game-footer">
          <span>A SMALL WORLD. A BIG ADVENTURE.</span>
          <span>
            <span className="save-dot" />
            本局自动保存
          </span>
        </footer>
      </main>

      {modal === "restart" && (
        <Modal title="重新开始这一局？" onClose={() => setModal(null)}>
          <p className="restart-description">当前进度将被清除，人数、阵容和天气设置保持不变。</p>
          <div className="restart-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              <Play size={18} />
              继续这局
            </button>
            <button className="primary-button" onClick={restartMatch}>
              <RotateCcw size={18} />
              重新开局
            </button>
          </div>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal
          title="游戏设置"
          onClose={() => setModal(null)}
          className="settings-dialog"
        >
          <div className="modal-illustration">
            <Rabbit size={44} strokeWidth={1.3} />
            <Flower2 size={24} strokeWidth={1.3} />
          </div>
          <fieldset className="player-count-setting">
            <legend>几个人一起玩？</legend>
            <div className="segmented" role="group" aria-label="玩家人数">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={newPlayerCount === count}
                  onClick={() => {
                    setNewPlayerCount(count);
                    setNewPlayers((current) =>
                      Array.from(
                        { length: Math.max(count, current.length) },
                        (_, i) => current[i] ?? { bot: false },
                      ),
                    );
                  }}
                >
                  <Users size={18} />
                  {count} 人
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="participant-options">
            <legend>玩家阵容</legend>
            {newPlayers.slice(0, newPlayerCount).map((participant, id) => (
              <div className="participant-row" key={id}>
                <span
                  className="participant-rabbit"
                  style={{ color: COLORS[id] }}
                >
                  <Rabbit size={29} />
                </span>
                <strong>{NAMES[id]}</strong>
                <div
                  className="segmented role-control"
                  role="group"
                  aria-label={`${NAMES[id]}类型`}
                >
                  {[false, true].map((bot) => (
                    <button
                      key={String(bot)}
                      type="button"
                      aria-label={`${NAMES[id]}设为${bot ? "机器人" : "真人"}`}
                      aria-pressed={participant.bot === bot}
                      onClick={() =>
                        setNewPlayers((current) =>
                          current.map((entry, index) =>
                            index === id ? { bot } : entry,
                          ),
                        )
                      }
                    >
                      {bot ? <Bot size={18} /> : <UserRound size={18} />}
                      {bot ? "机器人" : "真人"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          <label className="weather-option">
            <CloudLightning size={23} />
            <span>雷云天气</span>
            <input
              type="checkbox"
              aria-label="雷云天气"
              checked={newWeather}
              onChange={(event) => setNewWeather(event.target.checked)}
            />
          </label>
          <p className="new-game-note">开始新的一局会替换当前进度。</p>
          <button
            className="primary-button"
            onClick={() => onNew(newPlayers.slice(0, newPlayerCount), newWeather)}
          >
            <Flag size={17} />
            按此设置开始新局
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}

      {modal === "rules" && (
        <Modal title="胡萝卜山的冒险约定" onClose={() => setModal(null)}>
          <div className="rules-list">
            <div>
              <CloudLightning />
              <section>
                <h3>雷云巡游，留心闪电</h3>
                <p>
                  乌云一直在花园上空巡游，随机向经过的位置落雷，也可能击中空地。同格兔子会一起受影响，护盾可抵挡一次。被击中者本队待执行的这一回合不能行动；全队无法行动时休息一回合。暂停时天气也会暂停。
                </p>
              </section>
            </div>
            {(Object.keys(FEATURE_INFO) as FeatureKind[]).map((kind) => {
              const feature = FEATURE_INFO[kind];
              const Icon =
                kind === "spring"
                  ? ArrowUpRight
                  : kind === "wind"
                    ? Wind
                    : kind === "slide"
                      ? RotateCcw
                      : ShieldCheck;
              return (
                <div key={kind}>
                  <Icon style={{ color: feature.color }} />
                  <section>
                    <h3>{feature.name}</h3>
                    <p>
                      {feature.description}
                      {kind === "shield"
                        ? "地洞打开时，护盾会把小兔送回后方安全格；每只兔子最多一层。"
                        : ""}
                    </p>
                  </section>
                </div>
              );
            })}
            <div>
              <Rabbit />
              <section>
                <h3>三只小兔，一颗胡萝卜</h3>
                <p>每队拥有三只兔子，任意一只率先登顶即获胜。</p>
              </section>
            </div>
            <div>
              <Footprints />
              <section>
                <h3>一步、两步、三步</h3>
                <p>
                  每回合按卡牌格数前进，多只兔子可以停在同一格。停到机关格后，单独结算额外移动；滑梯退回本段安全起点。
                </p>
              </section>
            </div>
            <div>
              <Carrot />
              <section>
                <h3>胡萝卜转转，陷阱变变</h3>
                <p>
                  抽到机关卡时，转动中央胡萝卜。地板与木桥会切换开合，同格的兔子会一起掉落；落到已开启的洞口也会出局。
                  所有玩家共用 52 张牌，包含 18 张前进 1 格、16 张前进 2 格、10
                  张前进 3 格和 8 张机关卡，随机洗牌。
                </p>
              </section>
            </div>
            <div>
              <Star />
              <section>
                <h3>星星和花园伙伴</h3>
                <p>
                  先走过外围草地，再进入山路。停在星星格会收集一颗星星，每颗只能收集一次；发现蘑菇、池塘和风车可获得花园徽章，奖励不会改变步数。
                </p>
              </section>
            </div>
            <div>
              <Trophy />
              <section>
                <h3>最后的小兔也有机会</h3>
                <p>
                  三只兔子全部出局的队伍退出比赛。只剩一支队伍时，该队直接获胜；所有队伍同时出局则平局。
                </p>
              </section>
            </div>
          </div>
          <button className="primary-button" onClick={() => setModal(null)}>
            回到冒险
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}

      {modal === "history" && (
        <Modal title="这一程的小故事" onClose={() => setModal(null)}>
          <div className="history-list">
            {G.history.length ? (
              G.history.map((log) => (
                <div key={log.id}>
                  <span
                    className="history-avatar"
                    style={{ color: COLORS[log.player] }}
                  >
                    <Rabbit size={22} />
                  </span>
                  <p>
                    <strong>{NAMES[log.player]}</strong>
                    {log.text}
                  </p>
                </div>
              ))
            ) : (
              <div className="empty-history">
                <Leaf size={32} />
                <p>旅程刚刚开始，故事即将发生。</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal === "win" && (
        <Modal
          title={
            ctx.gameover?.draw
              ? "这次冒险，惊险收场"
              : `${NAMES[Number(ctx.gameover?.winner)]}，摘得胡萝卜！`
          }
          onClose={() => setModal(null)}
          className="win-dialog"
        >
          <div
            className="winner-presentation"
            style={
              {
                "--winner-color": COLORS[Number(ctx.gameover?.winner ?? 0)],
              } as React.CSSProperties
            }
          >
            <div className="winner-ribbon">
              <Trophy size={16} />
              {ctx.gameover?.draw ? "下一次，再挑战" : "花园冒险冠军"}
            </div>
            {winnerPortrait ? (
              <img
                className="winner-portrait"
                src={winnerPortrait}
                alt={`${NAMES[Number(ctx.gameover?.winner)]}的获胜兔子`}
                width="164"
                height="164"
              />
            ) : (
              <Rabbit className="winner-portrait" size={130} />
            )}
            <span className="winner-medal">
              <Trophy size={25} />
            </span>
          </div>
          <p className="winner-description">
            {ctx.gameover?.draw
              ? "所有小兔都掉进了陷阱，下次一起再挑战。"
              : ctx.gameover?.reason === "survivor"
                ? "坚持到最后的小队，同样值得一颗胡萝卜。"
                : "每一个小小的跳跃，都算数。"}
          </p>
          <div className="winner-stats">
            <span>
              <strong>{round}</strong>冒险回合
            </span>
            <span>
              <strong>{G.mechanism}</strong>机关转动
            </span>
            <span>
              <strong>{G.weather.strikes}</strong>雷电来访
            </span>
          </div>
          <div className="result-table" role="table" aria-label="本局成绩">
            <div className="result-head" role="row">
              <span>冒险小队</span>
              <span>星星</span>
              <span>进度</span>
            </div>
            {ranking.map((entry, index) => (
              <div
                key={entry.id}
                className={`result-row ${entry.winner ? "champion" : ""}`}
                role="row"
                style={
                  { "--player-color": COLORS[entry.id] } as React.CSSProperties
                }
              >
                <div>
                  <span className="result-rank">
                    {entry.winner ? <Trophy size={17} /> : index + 1}
                  </span>
                  <Rabbit size={25} />
                  <strong>{NAMES[entry.id]}</strong>
                </div>
                <span>
                  <Star size={13} fill="currentColor" />
                  {entry.stars}
                </span>
                <span>
                  {Math.min(entry.progress, FINISH)} / {FINISH}
                </span>
              </div>
            ))}
          </div>
          <div className="result-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              <Eye size={18} />
              看看棋盘
            </button>
            <button className="primary-button" onClick={restartMatch}>
              <RotateCcw size={17} />
              再来一场冒险
              <ArrowRight size={17} />
            </button>
          </div>
          <button className="change-roster-button" onClick={openSettings}>
            <Settings2 size={18} />
            换个阵容
            <ChevronRight size={18} />
          </button>
        </Modal>
      )}
      <div className="sr-only">
        <AudioLines />
        {sound ? "音效已开启" : "音效已关闭"}
      </div>
    </div>
  );
}

export default function App() {
  const [initial] = useState(readSaved);
  const [players, setPlayers] = useState<PlayerConfig[]>(
    initial?.players ?? DEFAULT_PLAYERS,
  );
  const [weatherEnabled, setWeatherEnabled] = useState(
    initial?.state.G.weather.enabled ?? true,
  );
  const [saved, setSaved] = useState<SavedGame | undefined>(initial);
  const [generation, setGeneration] = useState(0);
  return (
    <GameScreen
      key={generation}
      players={players}
      weatherEnabled={weatherEnabled}
      saved={saved}
      onNew={(newPlayers, newWeather) => {
        setPlayers(newPlayers);
        setWeatherEnabled(newWeather);
        setSaved(undefined);
        setGeneration((value) => value + 1);
      }}
    />
  );
}
