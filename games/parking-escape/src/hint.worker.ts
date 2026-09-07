import { solve } from './solver';
import type { Vehicle } from './rules';

self.onmessage = (event: MessageEvent<{ cars: Vehicle[]; positions: number[] }>) => {
  self.postMessage(solve(event.data.cars, event.data.positions));
};
