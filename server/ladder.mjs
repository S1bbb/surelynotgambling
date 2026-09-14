import { createHmac, randomUUID } from 'node:crypto';
import { hash } from './fairness.mjs';

export const LADDER_ROWS = 8;
export const LADDER_COLUMNS = 5;
// Domain separation + unbiased Fisher-Yates: every subset of rocks is equally likely.
export function ladderBoard(serverSeed, clientSeed, nonce, rocks) {
  return Array.from({ length: LADDER_ROWS }, (_, row) => {
    const cells = [0, 1, 2, 3, 4];
    for (let i = 4; i > 0; i--) {
      const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
      for (let cursor = 0; ; cursor++) {
        const value = createHmac('sha256', serverSeed)
          .update(JSON.stringify(['stairs-v1', clientSeed, nonce, rocks, row, i, cursor]))
          .digest().readUInt32BE(0);
        if (value >= limit) continue;
        const j = value % (i + 1);
        [cells[i], cells[j]] = [cells[j], cells[i]];
        break;
      }
    }
    return cells.slice(0, rocks).sort((a, b) => a - b);
  });
}
export function ladderPayout(amount, rtpBps, rocks, steps) {
  if (steps === 0) return 0;
  return Number(BigInt(amount) * BigInt(rtpBps) * 5n ** BigInt(steps)
    / (10000n * BigInt(5 - rocks) ** BigInt(steps)));
}
const requireValue = (ok, message) => { if (!ok) throw Object.assign(new Error(message), { status: 400 }); };
export function startLadder(s, b) {
  requireValue(typeof b.requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(b.requestId), 'Некорректный идентификатор ставки');
  const previous = s.rounds.find(r => r.requestId === b.requestId) || (s.activeLadder?.requestId === b.requestId ? s.activeLadder : null);
  if (previous) {
    requireValue(previous.game === 'ladder' && ['amount', 'rocks', 'clientSeed', 'version', 'commitment'].every(k => previous[k] === b[k]), 'Идентификатор уже использован для другой ставки');
    return previous;
  }
  requireValue(!s.activeLadder, 'Сначала завершите текущую лестницу');
  requireValue(b.version === s.version && b.commitment === hash(s.seed), 'Условия изменились. Обновите данные и начните снова.');
  requireValue(Number.isSafeInteger(b.amount) && b.amount >= 100 && b.amount <= 100000, 'Ставка: от 1 до 1 000 CR');
  requireValue(Number.isInteger(b.rocks) && b.rocks >= 1 && b.rocks <= 4, 'Выберите от 1 до 4 камней');
  requireValue(typeof b.clientSeed === 'string' && b.clientSeed.length > 0 && b.clientSeed.length <= 128, 'Client seed: от 1 до 128 символов');
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  s.balance -= b.amount;
  s.activeLadder = {
    id: randomUUID(), requestId: b.requestId, game: 'ladder', protocol: 'stairs-v1',
    amount: b.amount, rocks: b.rocks, clientSeed: b.clientSeed, nonce: s.nonce++,
    version: s.version, commitment: hash(s.seed), rtpBps: s.rtpBps,
    rows: LADDER_ROWS, columns: LADDER_COLUMNS, moves: [], revealed: [],
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
function finish(s, r, status, board) {
  r.status = status;
  r.won = status !== 'lost';
  r.payout = r.won ? ladderPayout(r.amount, r.rtpBps, r.rocks, r.steps) : 0;
  r.multiplier = r.won ? r.rtpBps / 10000 * (5 / (5 - r.rocks)) ** r.steps : 0;
  r.board = board;
  r.finishedAt = new Date().toISOString();
  s.balance += r.payout;
  r.balance = s.balance;
  s.rounds.push(r);
  s.activeLadder = null;
  return r;
}
export function stepLadder(s, b) {
  const r = getRound(s, b);
  requireValue(Number.isInteger(b.step) && b.step >= 0 && b.step < LADDER_ROWS, 'Некорректная ступень');
  requireValue(Number.isInteger(b.column) && b.column >= 0 && b.column < LADDER_COLUMNS, 'Выберите клетку от 1 до 5');
  if (b.step < r.moves.length) {
    requireValue(r.moves[b.step] === b.column, 'На этой ступени уже выбрана другая клетка');
    return r; // Retry of a completed move never advances a second time.
  }
  requireValue(r.status === 'active' && b.step === r.moves.length, 'Раунд завершён или ступень уже изменилась');
  const board = ladderBoard(s.seed, r.clientSeed, r.nonce, r.rocks);
  r.moves.push(b.column);
  r.revealed.push(board[b.step]);
  if (board[b.step].includes(b.column)) return finish(s, r, 'lost', board);
  r.steps++;
  if (r.steps === LADDER_ROWS) return finish(s, r, 'completed', board);
  return r;
}
export function cashoutLadder(s, b) {
  const r = getRound(s, b);
  requireValue(Number.isInteger(b.steps) && b.steps >= 1 && b.steps <= LADDER_ROWS && b.steps === r.steps, 'Число пройденных ступеней изменилось');
  if (r.status === 'cashed' || r.status === 'completed') return r;
  requireValue(r.status === 'active', 'Раунд уже завершён');
  return finish(s, r, 'cashed', ladderBoard(s.seed, r.clientSeed, r.nonce, r.rocks));
}
