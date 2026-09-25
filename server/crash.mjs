import { randomUUID } from 'node:crypto';
import { hash, crashPoint } from './fairness.mjs';
import { requireValue, requireRequestId, findRequest, sameRequest, requireQuote, requireAmount, requireClientSeed } from './common.mjs';
import { withMoments } from './stats.mjs';

// The multiplier shown at t ms after the start is floor(100·e^(g·t)) hundredths.
// The round has crashed as soon as it exceeds the crash point C; cashing out at M ≤ C wins.
export const CRASH_GROWTH = 0.00006;
export const CRASH_MAX = 100000; // ×1000.00: the round cashes out automatically here.
export const multiplierAt = ms => Math.min(CRASH_MAX, Math.floor(100 * Math.exp(CRASH_GROWTH * Math.max(0, ms))));

export function startCrash(s, b, now = Date.now()) {
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, 'crash', ['amount', 'target', 'clientSeed', 'version', 'commitment']);
  requireValue(!s.activeCrash, 'Дождитесь конца текущего полёта');
  requireQuote(s, b);
  requireAmount(b.amount);
  requireValue(b.target === undefined || b.target === null || (Number.isInteger(b.target) && b.target >= 101 && b.target <= CRASH_MAX), 'Автовывод: от ×1.01 до ×1000');
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  s.balance -= b.amount;
  s.activeCrash = {
    id: randomUUID(), requestId: b.requestId, game: 'crash', protocol: 'crash-v1',
    amount: b.amount, target: b.target ?? null, clientSeed: b.clientSeed, nonce: s.nonce++,
    version: s.version, commitment: hash(s.seed), rtpBps: s.rtpBps, startedAt: now,
    status: 'active', cashout: null, payout: 0, multiplier: 0, won: false, createdAt: new Date(now).toISOString(),
  };
  return s.activeCrash;
}
function finish(s, r, crash, cashout) {
  r.crashPoint = crash;
  r.status = cashout ? 'cashed' : 'lost';
  r.cashout = cashout;
  r.won = Boolean(cashout);
  r.payout = cashout ? Math.floor(r.amount * cashout / 100) : 0;
  r.multiplier = cashout ? cashout / 100 : 0;
  r.finishedAt = new Date().toISOString();
  s.balance += r.payout;
  r.balance = s.balance;
  s.rounds.push(withMoments(r));
  s.activeCrash = null;
  return r;
}
// Settles the active round if its auto-cashout or crash moment has already passed.
function resolve(s, now) {
  const r = s.activeCrash;
  if (!r) return null;
  const crash = crashPoint(s.seed, r.clientSeed, r.nonce, r.rtpBps);
  const target = Math.min(r.target ?? CRASH_MAX, CRASH_MAX);
  const shown = multiplierAt(now - r.startedAt);
  if (target <= crash && shown >= target) return finish(s, r, crash, target);
  if (shown > crash) return finish(s, r, crash, null);
  return null;
}
export function crashDue(s, now = Date.now()) {
  const r = s.activeCrash;
  if (!r) return false;
  const crash = crashPoint(s.seed, r.clientSeed, r.nonce, r.rtpBps), shown = multiplierAt(now - r.startedAt);
  return shown > crash || shown >= Math.min(r.target ?? CRASH_MAX, CRASH_MAX);
}
export const tickCrash = (s, now = Date.now()) => resolve(s, now);
export function cashoutCrash(s, b, now = Date.now()) {
  requireValue(typeof b.roundId === 'string', 'Не указан раунд');
  const settled = s.rounds.find(r => r.id === b.roundId && r.game === 'crash');
  if (settled) return settled; // Retry after settlement returns the same outcome.
  const r = s.activeCrash;
  requireValue(r?.id === b.roundId, 'Раунд не найден');
  const done = resolve(s, now);
  if (done) return done;
  const shown = multiplierAt(now - r.startedAt);
  requireValue(shown >= 101, 'Вывод доступен с ×1.01');
  return finish(s, r, crashPoint(s.seed, r.clientSeed, r.nonce, r.rtpBps), shown);
}
