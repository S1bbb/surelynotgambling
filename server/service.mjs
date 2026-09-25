import { randomUUID } from 'node:crypto';
import { hash, newSeed, roll, settle, terms } from './fairness.mjs';
import { ACTIVE, requireValue, requireRequestId, findRequest, sameRequest, requireQuote, requireAmount, requireClientSeed } from './common.mjs';
import { summarize, withMoments } from './stats.mjs';

export function initialState() {
  return { balance: 1000000, rtpBps: 9700, version: 1, seed: newSeed(), nonce: 0, rounds: [], retired: [], audit: [], activeLadder: null, activeMines: null, activeChicken: null, activeCrash: null };
}
export function snapshot(s, now = Date.now()) {
  return {
    balance: s.balance, rtpBps: s.rtpBps, version: s.version, commitment: hash(s.seed), nonce: s.nonce, serverNow: now,
    ...Object.fromEntries(ACTIVE.map(key => [key, s[key] ?? null])),
    rounds: s.rounds.slice(-100).reverse(), retired: s.retired, audit: s.audit.slice(-50).reverse(),
    stats: summarize(s.rounds),
  };
}
export function placeBet(s, b) {
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, 'hilo', ['amount', 'threshold', 'direction', 'clientSeed', 'version', 'commitment']);
  requireQuote(s, b);
  requireAmount(b.amount, 'Ставка должна быть от 1 до 1 000 кредитов');
  requireValue(Number.isInteger(b.threshold) && b.threshold >= 5 && b.threshold <= 95, 'Порог должен быть от 5 до 95');
  requireValue(['under', 'over'].includes(b.direction), 'Некорректное направление');
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  const nonce = s.nonce++;
  const result = roll(s.seed, b.clientSeed, nonce);
  const outcome = settle({ ...b, rtpBps: s.rtpBps, result });
  s.balance += outcome.payout - b.amount;
  const round = { id: randomUUID(), game: 'hilo', protocol: 'hilo-v1', requestId: b.requestId, amount: b.amount, threshold: b.threshold, direction: b.direction, clientSeed: b.clientSeed, version: s.version, commitment: hash(s.seed), nonce, result, rtpBps: s.rtpBps, ...terms(b.direction, b.threshold, s.rtpBps), ...outcome, balance: s.balance, createdAt: new Date().toISOString() };
  s.rounds.push(withMoments(round));
  return round;
}
export function rotate(s) {
  requireValue(ACTIVE.every(key => !s[key]), 'Завершите начатые раунды перед раскрытием seed: иначе станут известны будущие исходы');
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
