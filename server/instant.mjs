import { randomUUID } from 'node:crypto';
import { hash, rouletteRoll, rouletteHit, roulettePayout, rouletteWinners, upgradeRoll, upgradeOutcomes, UPGRADE_SPACE, PLINKO_SHAPES, plinkoPath, plinkoPayout, plinkoMultipliers } from './fairness.mjs';
import { MAX_BET, requireValue, requireRequestId, findRequest, sameRequest, requireQuote, requireAmount, requireClientSeed } from './common.mjs';
import { withMoments } from './stats.mjs';

function settleRound(s, round) {
  s.balance += round.payout - round.amount;
  round.balance = s.balance;
  s.rounds.push(withMoments(round));
  return round;
}
const base = (s, b, game, protocol, amount) => ({
  id: randomUUID(), game, protocol, requestId: b.requestId, amount, clientSeed: b.clientSeed,
  version: s.version, commitment: hash(s.seed), nonce: s.nonce++, rtpBps: s.rtpBps, createdAt: new Date().toISOString(),
});

// Several chips per spin: colours pay RTP·15/7, a single number (0 is green) pays RTP·15.
const validTarget = t => t === 'red' || t === 'black' || (Number.isInteger(t) && t >= 0 && t <= 14);
export function spinRoulette(s, b) {
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, 'roulette', ['bets', 'clientSeed', 'version', 'commitment']);
  requireQuote(s, b);
  requireValue(Array.isArray(b.bets) && b.bets.length >= 1 && b.bets.length <= 17, 'Поставьте хотя бы одну фишку');
  for (const bet of b.bets) {
    requireValue(bet && typeof bet === 'object' && Object.keys(bet).length === 2 && validTarget(bet.target), 'Некорректное поле ставки');
    requireAmount(bet.amount, 'Каждая фишка: от 1 до 1 000 CR');
  }
  requireValue(new Set(b.bets.map(bet => bet.target)).size === b.bets.length, 'Одно поле указано дважды');
  const amount = b.bets.reduce((a, bet) => a + bet.amount, 0);
  requireValue(amount <= MAX_BET, 'Сумма фишек за спин: до 1 000 CR');
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= amount, 'Недостаточно кредитов');
  const round = base(s, b, 'roulette', 'roulette-v1', amount);
  const result = rouletteRoll(s.seed, b.clientSeed, round.nonce);
  const bets = b.bets.map(bet => ({
    target: bet.target, amount: bet.amount, multiplier: s.rtpBps * 15 / (10000 * rouletteWinners(bet.target)),
    payout: rouletteHit(bet.target, result) ? roulettePayout(bet.amount, s.rtpBps, bet.target) : 0,
  }));
  const payout = bets.reduce((a, bet) => a + bet.payout, 0);
  // Stored chips keep only the request fields so a retried request compares equal.
  return settleRound(s, { ...round, bets: b.bets.map(({ target, amount }) => ({ target, amount })), settled: bets, result, payout, won: payout > 0, multiplier: payout / amount });
}

// Upgrade: target is the payout (cents) the player wants; chance = W / 10^6 ≤ RTP·A/T.
export function upgrade(s, b) {
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, 'upgrade', ['amount', 'target', 'clientSeed', 'version', 'commitment']);
  requireQuote(s, b);
  requireAmount(b.amount);
  requireValue(Number.isSafeInteger(b.target) && b.target * 10 >= b.amount * 11 && b.target <= b.amount * 1000, 'Цель: от ×1.10 до ×1000 от ставки');
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  const round = base(s, b, 'upgrade', 'upgrade-v1', b.amount);
  const outcomes = upgradeOutcomes(b.amount, b.target, s.rtpBps);
  const result = upgradeRoll(s.seed, b.clientSeed, round.nonce);
  const won = result < outcomes;
  return settleRound(s, { ...round, target: b.target, outcomes, chance: outcomes / UPGRADE_SPACE * 100, result, won, payout: won ? b.target : 0, multiplier: won ? b.target / b.amount : 0 });
}

export function dropPlinko(s, b) {
  requireRequestId(b);
  const previous = findRequest(s, b.requestId);
  if (previous) return sameRequest(previous, b, 'plinko', ['amount', 'rows', 'risk', 'clientSeed', 'version', 'commitment']);
  requireQuote(s, b);
  requireAmount(b.amount);
  requireValue(Number.isInteger(b.rows) && b.rows >= 8 && b.rows <= 16, 'Рядов: от 8 до 16');
  requireValue(Object.hasOwn(PLINKO_SHAPES, b.risk), 'Выберите риск');
  requireClientSeed(b.clientSeed);
  requireValue(s.balance >= b.amount, 'Недостаточно кредитов');
  const round = base(s, b, 'plinko', 'plinko-v1', b.amount);
  const path = plinkoPath(s.seed, b.clientSeed, round.nonce, b.rows);
  const bucket = path.reduce((a, bit) => a + bit, 0);
  const payout = plinkoPayout(b.amount, b.rows, b.risk, s.rtpBps, bucket);
  return settleRound(s, { ...round, rows: b.rows, risk: b.risk, path, bucket, payout, won: payout > b.amount, multiplier: plinkoMultipliers(b.rows, b.risk, s.rtpBps)[bucket] });
}
