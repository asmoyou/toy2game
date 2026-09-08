import type { Game } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import { INVALID_MOVE } from 'boardgame.io/core';
import { canFlip, chooseBot, flip, initialState, observation, settle, winners, type Actor, type MatchState, type Settings } from './rules';

function definition(initial: MatchState): Game<MatchState> {
  return {
    name: 'flip-match', minPlayers: 2, maxPlayers: 4, disableUndo: true,
    setup: () => structuredClone(initial),
    // Turn ownership is part of the replayable rule state, including the reveal/settle boundary.
    moves: {
      flip: ({ G }, id: number, actor: Actor) => { if (!flip(G, id, actor)) return INVALID_MOVE; },
      settle: ({ G }) => { if (!settle(G)) return INVALID_MOVE; },
    },
    endIf: ({ G }) => G.phase === 'finished' ? { winners: winners(G) } : undefined,
  };
}

export class MatchGame {
  private client;
  paused = false;
  private delay: number;
  private disposed = false;

  constructor(settings: Settings, seed = crypto.getRandomValues(new Uint32Array(1))[0], restored?: MatchState) {
    const initial = restored ?? initialState(settings, seed);
    this.client = Client<MatchState>({ game: definition(initial), numPlayers: initial.settings.count, debug: false });
    this.client.start();
    this.delay = initial.phase === 'settling' ? 1.5 : initial.settings.bots[initial.current] ? 0.85 : 0;
  }
  get state() { return this.client.getState()!.G; }
  get isBot() { return this.state.settings.bots[this.state.current]; }
  get ready() { return !this.paused && !this.disposed && this.delay <= 0 && ['first', 'second'].includes(this.state.phase); }
  get waiting() { return this.delay; }

  flip(id: number, actor: Actor = 'human') {
    if (!this.ready || !canFlip(this.state, id, actor)) return false;
    this.client.moves.flip(id, actor);
    this.delay = this.state.phase === 'settling' ? 1.5 : this.isBot ? 0.85 : 0.36;
    return true;
  }

  update(delta: number) {
    if (this.paused || this.disposed || this.state.phase === 'finished' || !Number.isFinite(delta) || delta < 0) return;
    // Clamp resumed/slow frames instead of advancing several computer moves at once.
    this.delay = Math.max(0, this.delay - Math.min(delta, 0.05));
    if (this.delay > 0) return;
    if (this.state.phase === 'settling') {
      this.client.moves.settle(); this.delay = this.isBot ? 0.85 : 0.38;
    } else if (this.isBot) {
      const id = chooseBot(observation(this.state));
      if (id !== null) this.flip(id, 'bot');
    }
  }
  dispose() { this.disposed = true; this.client.stop(); }
}
