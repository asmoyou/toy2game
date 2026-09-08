import { BEAN_COUNT, CYCLE, STEP, TEAMS, parseSettings, seededRandom, type Settings } from './config.ts';
import { PondPhysics } from './physics.ts';

export type Phase = 'ready' | 'countdown' | 'playing' | 'finished';
export type Actor = 'human' | 'bot';
type Frog = { startedAt: number; catches: number; bites: number; score: number; lastCatch: number };

export class FrogGame {
  readonly settings: Settings;
  readonly physics: PondPhysics;
  readonly frogs: Frog[] = TEAMS.map(() => ({ startedAt: -CYCLE, catches: 0, bites: 0, score: 0, lastCatch: -10 }));
  phase: Phase = 'ready';
  paused = false;
  time = 0;
  countdown = 3;
  revision = 0;
  private accumulator = 0;
  private random: () => number;
  private held = new Set<number>();
  private botAt: number[];
  private disposed = false;

  constructor(settings: Settings, seed = Date.now()) {
    this.settings = parseSettings(settings);
    this.random = seededRandom(seed);
    this.physics = new PondPhysics(this.random);
    this.botAt = TEAMS.map(() => 0.15 + this.random() * 0.65);
  }

  get remaining() { return BEAN_COUNT - this.frogs.reduce((sum, frog) => sum + frog.score, 0); }
  get winners() {
    if (this.phase !== 'finished') return [];
    const best = Math.max(...this.frogs.slice(0, this.settings.count).map(frog => frog.score));
    return this.frogs.flatMap((frog, i) => i < this.settings.count && frog.score === best ? [i] : []);
  }

  start() {
    if (this.disposed || this.paused || this.phase !== 'ready') return false;
    this.phase = 'countdown'; this.revision++;
    return true;
  }

  private allowed(owner: number, actor: Actor) {
    return !this.disposed && !this.paused && Number.isInteger(owner) && owner >= 0 && owner < this.settings.count && this.settings.bots[owner] === (actor === 'bot');
  }

  bite(owner: number, actor: Actor = 'human') {
    if (!this.allowed(owner, actor) || this.phase !== 'playing') return false;
    const frog = this.frogs[owner];
    if (this.time - frog.startedAt < CYCLE - 1e-6) return false;
    frog.startedAt = this.time; frog.catches = 0; frog.bites++; this.revision++;
    return true;
  }

  hold(owner: number, down: boolean) {
    if (!down) { this.held.delete(owner); return true; }
    if (!this.allowed(owner, 'human') || this.phase === 'finished') return false;
    this.held.add(owner);
    if (this.phase === 'ready') this.start();
    this.bite(owner);
    return true;
  }

  releaseAll() { this.held.clear(); }

  update(delta: number) {
    if (this.disposed || this.paused || this.phase === 'ready' || this.phase === 'finished' || !Number.isFinite(delta)) return;
    this.accumulator += Math.max(0, Math.min(delta, 0.05));
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.tick();
      if (this.remaining === 0) { this.accumulator = 0; break; }
    }
  }

  private tick() {
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - STEP);
      if (this.countdown < 1e-6) { this.countdown = 0; this.phase = 'playing'; this.revision++; }
      return;
    }
    this.time += STEP;
    this.physics.step(this.time);
    for (let i = 0; i < this.settings.count; i++) {
      const frog = this.frogs[i];
      if (this.settings.bots[i] && this.time >= this.botAt[i]) {
        this.bite(i, 'bot');
        this.botAt[i] = this.time + CYCLE + 0.12 + this.random() * 0.38;
      } else if (this.held.has(i)) this.bite(i);
      const age = this.time - frog.startedAt;
      if (age >= 0.25 && age <= 0.39 && frog.catches < 3) {
        const caught = this.physics.capture(i, age, this.time, 3 - frog.catches);
        if (caught.length) {
          frog.catches += caught.length; frog.score += caught.length;
          frog.lastCatch = this.time; this.revision++;
        }
      }
    }
    if (this.remaining === 0) {
      this.phase = 'finished'; this.releaseAll(); this.revision++;
    }
  }

  dispose() { this.disposed = true; this.releaseAll(); this.physics.dispose(); }
}
