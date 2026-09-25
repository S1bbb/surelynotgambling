import { randomUUID } from 'node:crypto';
import { hash, LADDER, ladderBoard, ladderPayout, ladderMultiplier } from './fairness.mjs';
import { requireValue, requireRequestId, findRequest, sameRequest, requireQuote, requireAmount, requireClientSeed } from './common.mjs';
import { withMoments } from './stats.mjs';

export { LADDER, ladderBoard, ladderPayout };
export const LADDER_PROTOCOL = 'stairs-v2';
const board = (s, r) => ladderBoard(s.seed, r.clientSeed, r.nonce, r.rocks, r.protocol);

export function startLadder(s, b) {
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, 'ladder', ['amount', 'rocks', 'clientSeed', 'version', 'commitment']);
  requireValue(!s.activeLadder, 'Сначала завершите текущую лестницу');
  requireQuote(s, b);
  requireAmount(b.amount);
  const { widths, maxRocks } = LADDER[LADDER_PROTOCOL];
  requireValue(Number.isInteger(b.rocks) && b.rocks >= 1 && b.rocks <= maxRocks, `Выберите от 1 до ${maxRocks} камней`);
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  s.balance -= b.amount;
  s.activeLadder = {
    id: randomUUID(), requestId: b.requestId, game: 'ladder', protocol: LADDER_PROTOCOL,
    amount: b.amount, rocks: b.rocks, clientSeed: b.clientSeed, nonce: s.nonce++,
    version: s.version, commitment: hash(s.seed), rtpBps: s.rtpBps,
    rows: widths.length, widths, moves: [], revealed: [],
    steps: 0, status: 'active', payout: 0, multiplier: 0, won: false,
    createdAt: new Date().toISOString(),
  };
  return s.activeLadder;
}
function getRound(s, b) {
  requireValue(typeof b.roundId === 'string', 'Не указан раунд');
  const r = s.activeLadder?.id === b.roundId ? s.activeLadder : s.rounds.find(r => r.id === b.roundId && r.game === 'ladder');
  requireValue(Boolean(r), 'Раунд не найден');
  return r;
}
function finish(s, r, status) {
  r.status = status;
  r.won = status !== 'lost';
  r.payout = r.won ? ladderPayout(r.amount, r.rtpBps, r.rocks, r.steps, r.protocol) : 0;
  r.multiplier = r.won ? ladderMultiplier(r.rtpBps, r.rocks, r.steps, r.protocol) : 0;
  r.board = board(s, r);
  r.finishedAt = new Date().toISOString();
  s.balance += r.payout;
  r.balance = s.balance;
  s.rounds.push(withMoments(r));
  s.activeLadder = null;
  return r;
}
export function stepLadder(s, b) {
  const r = getRound(s, b);
  const widths = LADDER[r.protocol].widths;
  requireValue(Number.isInteger(b.step) && b.step >= 0 && b.step < widths.length, 'Некорректная ступень');
  if (b.step < r.moves.length) {
    requireValue(r.moves[b.step] === b.column, 'На этой ступени уже выбрана другая клетка');
    return r; // Retry of a completed move never advances a second time.
  }
  requireValue(r.status === 'active' && b.step === r.moves.length, 'Раунд завершён или ступень уже изменилась');
  requireValue(Number.isInteger(b.column) && b.column >= 0 && b.column < widths[b.step], `Выберите клетку от 1 до ${widths[b.step]}`);
  const rocks = board(s, r)[b.step];
  r.moves.push(b.column);
  r.revealed.push(rocks);
  if (rocks.includes(b.column)) return finish(s, r, 'lost');
  r.steps++;
  if (r.steps === widths.length) return finish(s, r, 'completed');
  return r;
}
export function cashoutLadder(s, b) {
  const r = getRound(s, b);
  requireValue(Number.isInteger(b.steps) && b.steps >= 1 && b.steps === r.steps, 'Число пройденных ступеней изменилось');
  if (r.status === 'cashed' || r.status === 'completed') return r;
  requireValue(r.status === 'active', 'Раунд уже завершён');
  return finish(s, r, 'cashed');
}
