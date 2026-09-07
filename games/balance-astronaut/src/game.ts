import { SLOTS, parseSettings, type Settings } from './board.ts';
import { BalancePhysics, CREW_MASS, STEP } from './physics.ts';

export type Phase = 'roll' | 'rolling' | 'place' | 'settling' | 'finished';
export type Actor = 'human' | 'bot';
export const SETTLE_TIMEOUT = 8;

export class BalanceGame {
  readonly physics: BalancePhysics;
  readonly settings: Settings;
  phase: Phase;
  turn = 0;
  moves = 0;
  round = 1;
  selected: number | null = null;
  remaining = 1;
  dice = 1;
  loser: number | null = null;
  fallen: number[] = [];
  placed = [0, 0, 0, 0];
  time = 0;
  paused = false;
  peakTilt = 0;
  revision = 0;
  settleTimedOut = false;
  private randomState: number;
  private accumulator = 0;
  private phaseTime = 0;
  private botAt = 0.9;
  private lastPlacer: number | null = null;

  constructor(settings: Settings, seed = Date.now()) {
    this.settings = parseSettings(settings);
    this.randomState = (seed >>> 0) || 1;
    this.physics = new BalancePhysics();
    this.phase = this.settings.mode === 'dice' ? 'roll' : 'place';
  }

  private random() {
    let x = this.randomState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 4294967296;
  }

  get isBot() { return this.settings.bots[this.turn]; }
  get empty() { return SLOTS.filter(slot => !this.physics.crew.has(slot.id)); }
  get canPlace() { return !this.paused && this.phase === 'place'; }
  get settlingTime() { return this.phase === 'settling' ? this.time - this.phaseTime : 0; }

  private allowed(actor: Actor) { return !this.paused && (actor === 'bot') === this.isBot; }

  roll(actor: Actor = 'human') {
    if (!this.allowed(actor) || this.phase !== 'roll') return false;
    this.dice = 1 + Math.floor(this.random() * 6);
    this.phase = 'rolling';
    this.phaseTime = this.time;
    this.settleTimedOut = false;
    this.revision++;
    return true;
  }

  place(slot: number, actor: Actor = 'human') {
    if (!this.allowed(actor) || !this.canPlace || !this.physics.add(slot, this.turn)) return false;
    this.placed[this.turn]++;
    this.moves++;
    this.selected = null;
    this.phase = 'settling';
    this.phaseTime = this.time;
    this.settleTimedOut = false;
    this.lastPlacer = this.turn;
    this.revision++;
    return true;
  }

  chooseBotSlot() {
    const moment = this.physics.moment();
    return this.empty.map(slot => ({ id: slot.id, score: Math.hypot(moment.x + slot.x * CREW_MASS, moment.z + slot.z * CREW_MASS) + slot.ring * 0.012 }))
      .sort((a, b) => a.score - b.score || a.id - b.id)[0]?.id ?? null;
  }

  update(delta: number) {
    if (this.paused) return;
    this.accumulator += Math.max(0, Math.min(delta, 0.1));
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.tick();
    }
  }

  private tick() {
    this.physics.step();
    if (this.phase === 'finished') return;
    this.time += STEP;
    this.peakTilt = Math.max(this.peakTilt, this.physics.tilt);
    const fallen = this.physics.fallen;
    if (fallen.length) {
      this.fallen = fallen;
      // A timeout may have handed over input before a slow slide actually reaches the edge.
      this.loser = this.lastPlacer ?? this.turn;
      this.turn = this.loser;
      this.phase = 'finished';
      this.revision++;
      return;
    }
    if (this.phase === 'rolling' && this.time - this.phaseTime > 0.75) {
      this.remaining = Math.min(this.dice, this.empty.length);
      this.phase = 'place';
      this.botAt = this.time + 0.65;
      this.revision++;
    }
    if (this.phase === 'settling') {
      const stable = this.physics.stable;
      if (this.settlingTime > 0.8 && (stable || this.settlingTime >= SETTLE_TIMEOUT)) {
        this.settleTimedOut = !stable;
        this.remaining--;
        if (!this.empty.length) this.phase = 'finished';
        else if (this.remaining > 0) this.phase = 'place';
        else {
          this.turn = (this.turn + 1) % this.settings.count;
          if (this.turn === 0) this.round++;
          this.remaining = 1;
          this.phase = this.settings.mode === 'dice' ? 'roll' : 'place';
        }
        this.botAt = this.time + 0.9;
        this.revision++;
      }
    }
    if (this.isBot && this.time >= this.botAt) {
      if (this.phase === 'roll') this.roll('bot');
      else if (this.phase === 'place') {
        if (this.selected === null) {
          const slot = this.chooseBotSlot();
          if (slot !== null) { this.selected = slot; this.revision++; }
          this.botAt = this.time + 0.65;
        } else this.place(this.selected, 'bot');
      }
    }
  }

  dispose() { this.physics.dispose(); }
}
