import { randomUUID } from 'node:crypto';
import { hash, newSeed, roll, settle, terms } from './fairness.mjs';

export function initialState() {
  return { balance: 1000000, rtpBps: 9700, version: 1, seed: newSeed(), nonce: 0, rounds: [], retired: [], audit: [], activeLadder: null };
}
export function snapshot(s) {
  return { balance: s.balance, rtpBps: s.rtpBps, version: s.version, commitment: hash(s.seed), nonce: s.nonce, activeLadder: s.activeLadder ?? null, rounds: s.rounds.slice(-100).reverse(), retired: s.retired, audit: s.audit.slice(-50).reverse(), stats: { count: s.rounds.length, wagered: s.rounds.reduce((a,r)=>a+r.amount,0), paid: s.rounds.reduce((a,r)=>a+r.payout,0) } };
}
function requireValue(ok, message) { if (!ok) throw Object.assign(new Error(message), { status: 400 }); }
export function placeBet(s, b) {
  requireValue(typeof b.requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(b.requestId), 'Некорректный идентификатор ставки');
  const previous = s.rounds.find(r => r.requestId === b.requestId);
  requireValue(s.activeLadder?.requestId !== b.requestId, 'Идентификатор уже использован для другой игры');
  if (previous) {
    requireValue(previous.game !== 'ladder', 'Идентификатор уже использован для другой игры');
    requireValue(['amount','threshold','direction','clientSeed','version','commitment'].every(k=>previous[k]===b[k]), 'Идентификатор уже использован для другой ставки');
    return previous;
  }
  requireValue(b.version === s.version && b.commitment === hash(s.seed), 'Условия изменились. Обновите страницу и повторите ставку.');
  requireValue(Number.isSafeInteger(b.amount) && b.amount >= 100 && b.amount <= 100000, 'Ставка должна быть от 1 до 1 000 кредитов');
  requireValue(Number.isInteger(b.threshold) && b.threshold >= 5 && b.threshold <= 95, 'Порог должен быть от 5 до 95');
  requireValue(['under','over'].includes(b.direction), 'Некорректное направление');
  requireValue(typeof b.clientSeed === 'string' && b.clientSeed.length >= 1 && b.clientSeed.length <= 128, 'Client seed: от 1 до 128 символов');
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  const nonce = s.nonce++;
  const result = roll(s.seed, b.clientSeed, nonce);
  const outcome = settle({ ...b, rtpBps: s.rtpBps, result });
  s.balance += outcome.payout - b.amount;
  const round = { id: randomUUID(), game: 'hilo', requestId: b.requestId, amount: b.amount, threshold: b.threshold, direction: b.direction, clientSeed: b.clientSeed, version: s.version, commitment: hash(s.seed), nonce, result, rtpBps: s.rtpBps, ...terms(b.direction,b.threshold,s.rtpBps), ...outcome, balance: s.balance, createdAt: new Date().toISOString() };
  s.rounds.push(round);
  return round;
}
export function rotate(s) {
  requireValue(!s.activeLadder, 'Завершите лестницу или заберите выигрыш перед раскрытием seed');
  s.retired.push({ seed: s.seed, commitment: hash(s.seed), bets: s.nonce, revealedAt: new Date().toISOString() });
  s.seed = newSeed(); s.nonce = 0;
  return snapshot(s);
}
export function configure(s, b) {
  requireValue(b.version === s.version, 'Настройки уже изменились. Обновите страницу.');
  requireValue(Number.isInteger(b.rtpBps) && b.rtpBps >= 8000 && b.rtpBps <= 9900, 'RTP должен быть от 80 до 99%');
  s.audit.push({ from: s.rtpBps, to: b.rtpBps, at: new Date().toISOString(), version: ++s.version });
  s.rtpBps = b.rtpBps;
  return snapshot(s);
}
