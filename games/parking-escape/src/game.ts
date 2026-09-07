import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { Client } from 'boardgame.io/client';
import { EXIT, legalMove, nextPositions, type Level, type Move } from './rules';
import entries from './levels.json';

export const LEVELS = entries as Level[];
export type ParkingState = { positions: number[]; past: number[][]; future: number[][] };
export const initialState = (level: Level): ParkingState => ({ positions: [...level.positions], past: [], future: [] });

export function parkingGame(level: Level, restored?: ParkingState): Game<ParkingState> {
  return {
    name: 'parking-escape',
    minPlayers: 1,
    maxPlayers: 1,
    disableUndo: true,
    setup: () => structuredClone(restored ?? initialState(level)),
    moves: {
      slide: ({ G }, move: Move) => {
        if (!legalMove(level.cars, G.positions, move)) return INVALID_MOVE;
        G.past.push([...G.positions]);
        G.positions = nextPositions(G.positions, move);
        G.future = [];
      },
      back: ({ G }) => {
        if (!G.past.length) return INVALID_MOVE;
        G.future.push([...G.positions]);
        G.positions = G.past.pop()!;
      },
      forward: ({ G }) => {
        if (!G.future.length) return INVALID_MOVE;
        G.past.push([...G.positions]);
        G.positions = G.future.pop()!;
      },
    },
    endIf: ({ G }) => G.positions[0] === EXIT ? { winner: '0' } : undefined,
  };
}

export const createGame = (level: Level, restored?: ParkingState) => Client<ParkingState>({ game: parkingGame(level, restored), numPlayers: 1, debug: false });
export type ParkingClient = ReturnType<typeof createGame>;
