import { hash } from './fairness.mjs';

export const MIN_BET = 100;
export const MAX_BET = 100000;
export const requireValue = (ok, message) => { if (!ok) throw Object.assign(new Error(message), { status: 400 }); };
export function requireRequestId(b) {
  requireValue(typeof b.requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(b.requestId), 'Некорректный идентификатор ставки');
}
export const ACTIVE = ['activeLadder', 'activeMines', 'activeChicken', 'activeCrash'];
// Settled rounds plus the rounds still in play: one request id may be spent only once.
export function findRequest(s, requestId) {
  return s.rounds.find(r => r.requestId === requestId)
    ?? ACTIVE.map(key => s[key]).find(r => r?.requestId === requestId) ?? null;
}
export function sameRequest(previous, b, game, keys) {
  requireValue((previous.game ?? 'hilo') === game, 'Идентификатор уже использован для другой игры');
  requireValue(keys.every(k => JSON.stringify(previous[k] ?? null) === JSON.stringify(b[k] ?? null)), 'Идентификатор уже использован для другой ставки');
  return previous;
}
export function requireQuote(s, b) {
  requireValue(b.version === s.version && b.commitment === hash(s.seed), 'Условия изменились. Обновите данные и повторите ставку.');
}
export function requireAmount(amount, message = 'Ставка: от 1 до 1 000 CR') {
  requireValue(Number.isSafeInteger(amount) && amount >= MIN_BET && amount <= MAX_BET, message);
}
export function requireClientSeed(seed) {
  requireValue(typeof seed === 'string' && seed.length >= 1 && seed.length <= 128, 'Client seed: от 1 до 128 символов');
}
