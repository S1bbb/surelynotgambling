import { randomUUID } from 'node:crypto';
import { hash, MINES_CELLS, minesBoard, minesPayout, minesMultiplier } from './fairness.mjs';
import { requireValue, requireRequestId, findRequest, sameRequest, requireQuote, requireAmount, requireClientSeed } from './common.mjs';
import { withMoments } from './stats.mjs';

// Mines and Chicken share one draw: b hazards on a uniform b-subset of 25 slots.
// Mines lets the player open any closed cell; Chicken walks slots 0, 1, 2… in order.
export const CHICKEN_DIFFICULTY = { easy: 1, medium: 3, hard: 5, daredevil: 10 };
const GAMES = {
  mines: { key: 'activeMines', protocol: 'mines-v1', request: ['amount', 'bombs', 'clientSeed', 'version', 'commitment'] },
  chicken: { key: 'activeChicken', protocol: 'chicken-v1', request: ['amount', 'difficulty', 'clientSeed', 'version', 'commitment'] },
};

function start(game, s, b) {
  const { key, protocol, request } = GAMES[game];
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, game, request);
  requireValue(!s[key], 'Сначала завершите текущий раунд');
  requireQuote(s, b);
  requireAmount(b.amount);
  let bombs;
  if (game === 'mines') {
    requireValue(Number.isInteger(b.bombs) && b.bombs >= 1 && b.bombs <= 24, 'Выберите от 1 до 24 бомб');
    bombs = b.bombs;
  } else {
    requireValue(Object.hasOwn(CHICKEN_DIFFICULTY, b.difficulty), 'Выберите сложность');
    bombs = CHICKEN_DIFFICULTY[b.difficulty];
  }
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  s.balance -= b.amount;
  s[key] = {
    id: randomUUID(), requestId: b.requestId, game, protocol,
    amount: b.amount, bombs, ...(game === 'chicken' ? { difficulty: b.difficulty } : {}),
    clientSeed: b.clientSeed, nonce: s.nonce++, version: s.version, commitment: hash(s.seed), rtpBps: s.rtpBps,
    maxHits: MINES_CELLS - bombs, moves: [], hits: 0, status: 'active', payout: 0, multiplier: 0, won: false,
    createdAt: new Date().toISOString(),
  };
  return s[key];
}
function getRound(game, s, b) {
  requireValue(typeof b.roundId === 'string', 'Не указан раунд');
  const active = s[GAMES[game].key];
  const r = active?.id === b.roundId ? active : s.rounds.find(r => r.id === b.roundId && r.game === game);
  requireValue(Boolean(r), 'Раунд не найден');
  return r;
}
function finish(s, r, status) {
  r.status = status;
  r.won = status !== 'lost';
  r.payout = r.won ? minesPayout(r.amount, r.rtpBps, r.bombs, r.hits) : 0;
  r.multiplier = r.won ? minesMultiplier(r.rtpBps, r.bombs, r.hits) : 0;
  r.board = minesBoard(s.seed, r.clientSeed, r.nonce, r.bombs, r.protocol);
  r.finishedAt = new Date().toISOString();
  s.balance += r.payout;
  r.balance = s.balance;
  s.rounds.push(withMoments(r));
  s[GAMES[r.game].key] = null;
  return r;
}
function step(game, s, b) {
  const r = getRound(game, s, b);
  requireValue(Number.isInteger(b.step) && b.step >= 0 && b.step < MINES_CELLS, 'Некорректный ход');
  // Chicken has no choice: move n always enters slot n.
  const cell = game === 'chicken' ? b.step : b.cell;
  if (b.step < r.moves.length) {
    requireValue(r.moves[b.step] === cell, 'Этот ход уже сделан с другой клеткой');
    return r; // Retry of a completed move never advances a second time.
  }
  requireValue(r.status === 'active' && b.step === r.moves.length, 'Раунд завершён или ход уже изменился');
  requireValue(Number.isInteger(cell) && cell >= 0 && cell < MINES_CELLS && !r.moves.includes(cell), 'Выберите закрытую клетку');
  r.moves.push(cell);
  if (minesBoard(s.seed, r.clientSeed, r.nonce, r.bombs, r.protocol).includes(cell)) return finish(s, r, 'lost');
  r.hits++;
  if (r.hits === r.maxHits) return finish(s, r, 'completed');
  return r;
}
function cashout(game, s, b) {
  const r = getRound(game, s, b);
  requireValue(Number.isInteger(b.hits) && b.hits >= 1 && b.hits === r.hits, 'Число открытых клеток изменилось');
  if (r.status === 'cashed' || r.status === 'completed') return r;
  requireValue(r.status === 'active', 'Раунд уже завершён');
  return finish(s, r, 'cashed');
}
export const startMines = (s, b) => start('mines', s, b);
export const stepMines = (s, b) => step('mines', s, b);
export const cashoutMines = (s, b) => cashout('mines', s, b);
export const startChicken = (s, b) => start('chicken', s, b);
export const stepChicken = (s, b) => step('chicken', s, b);
export const cashoutChicken = (s, b) => cashout('chicken', s, b);
