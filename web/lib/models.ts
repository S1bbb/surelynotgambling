import type {
  ChickenDifficulty,
  PlinkoRisk,
  RouletteTarget,
} from './verify-games';

type Base = {
  id: string;
  requestId?: string;
  protocol?: string;
  amount: number;
  payout: number;
  won: boolean;
  clientSeed: string;
  nonce: number;
  commitment: string;
  rtpBps: number;
  multiplier: number;
  createdAt: string;
  ev?: number;
  variance?: number;
};
export type HiLoRound = Base & {
  game?: 'hilo';
  result: number;
  threshold: number;
  direction: string;
};
export type LadderRound = Base & {
  game: 'ladder';
  protocol: 'stairs-v1' | 'stairs-v2';
  rocks: number;
  rows: number;
  widths?: number[];
  steps: number;
  moves: number[];
  revealed: number[][];
  board?: number[][];
  status: 'active' | 'lost' | 'cashed' | 'completed';
};
export type MinesRound = Base & {
  game: 'mines' | 'chicken';
  protocol: 'mines-v1' | 'chicken-v1';
  bombs: number;
  difficulty?: ChickenDifficulty;
  maxHits: number;
  moves: number[];
  hits: number;
  board?: number[];
  status: 'active' | 'lost' | 'cashed' | 'completed';
};
export type CrashRound = Base & {
  game: 'crash';
  target: number | null;
  startedAt: number;
  status: 'active' | 'lost' | 'cashed';
  cashout: number | null;
  crashPoint?: number;
};
export type RouletteRound = Base & {
  game: 'roulette';
  bets: { target: RouletteTarget; amount: number }[];
  settled: {
    target: RouletteTarget;
    amount: number;
    multiplier: number;
    payout: number;
  }[];
  result: number;
};
export type UpgradeRound = Base & {
  game: 'upgrade';
  target: number;
  outcomes: number;
  chance: number;
  result: number;
};
export type PlinkoRound = Base & {
  game: 'plinko';
  rows: number;
  risk: PlinkoRisk;
  path: number[];
  bucket: number;
};
export type Round =
  | HiLoRound
  | LadderRound
  | MinesRound
  | CrashRound
  | RouletteRound
  | UpgradeRound
  | PlinkoRound;
export type GameId =
  | 'hilo'
  | 'crash'
  | 'roulette'
  | 'ladder'
  | 'mines'
  | 'chicken'
  | 'upgrade'
  | 'plinko';
export type GameStats = {
  count: number;
  wagered: number;
  paid: number;
  expected: number;
  variance: number;
  paying: number;
  profitable: number;
  best: number;
};
export type State = {
  balance: number;
  rtpBps: number;
  version: number;
  commitment: string;
  nonce: number;
  serverNow: number;
  rounds: Round[];
  activeLadder: LadderRound | null;
  activeMines: MinesRound | null;
  activeChicken: MinesRound | null;
  activeCrash: CrashRound | null;
  retired: { seed: string; commitment: string; bets: number }[];
  audit: { from: number; to: number; at: string; version: number }[];
  stats: GameStats & { games: Partial<Record<GameId, GameStats>> };
};
export const gameOf = (r: Round): GameId => r.game ?? 'hilo';
