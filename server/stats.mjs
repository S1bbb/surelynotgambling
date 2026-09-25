import { LADDER, ladderPayout, MINES_CELLS, minesPayout, crashChance, roulettePayout, rouletteHit, UPGRADE_SPACE, binomial, plinkoPayout } from './fairness.mjs';

// Expected payout and variance of one settled round, in cents and cents².
// Single-decision games use the exact outcome distribution. Games where the player decides
// step by step use the Doob decomposition of the cash value Y (Y₀ = 0, Y_τ = payout):
// Σ(q·next − held) is the compensator, i.e. the expected payout of the strategy the player
// actually followed, and Σ q(1 − q)·next² is its predictable quadratic variation. Under a
// correct game (payout − compensator) is a martingale, so the z-score below is valid for
// any cash-out strategy, including rounding down to 0.01 CR at every level.
function stepped(attempts, chance, value) {
  let ev = 0, variance = 0, held = 0;
  for (let j = 1; j <= attempts; j++) {
    const q = chance(j), next = value(j);
    ev += q * next - held;
    variance += q * (1 - q) * next * next;
    held = next;
  }
  return { ev, variance };
}
export function moments(r) {
  const R = r.rtpBps, A = r.amount;
  switch (r.game ?? 'hilo') {
    case 'hilo': {
      const p = r.outcomes / 10000, win = Math.floor(A * R / r.outcomes);
      return { ev: p * win, variance: p * (1 - p) * win * win };
    }
    case 'roulette': {
      let sum = 0, square = 0;
      for (let result = 0; result < 15; result++) {
        const paid = r.bets.reduce((a, b) => a + (rouletteHit(b.target, result) ? roulettePayout(b.amount, R, b.target) : 0), 0);
        sum += paid; square += paid * paid;
      }
      return { ev: sum / 15, variance: square / 15 - (sum / 15) ** 2 };
    }
    case 'plinko': {
      let sum = 0, square = 0;
      for (let i = 0; i <= r.rows; i++) {
        const p = binomial(r.rows, i) / 2 ** r.rows, paid = plinkoPayout(A, r.rows, r.risk, R, i);
        sum += p * paid; square += p * paid * paid;
      }
      return { ev: sum, variance: square - sum * sum };
    }
    case 'upgrade': {
      const p = r.outcomes / UPGRADE_SPACE;
      return { ev: p * r.target, variance: p * (1 - p) * r.target * r.target };
    }
    case 'ladder': {
      const widths = LADDER[r.protocol].widths;
      return stepped(r.steps + (r.status === 'lost' ? 1 : 0),
        j => (widths[j - 1] - r.rocks) / widths[j - 1],
        j => ladderPayout(A, R, r.rocks, j, r.protocol));
    }
    case 'mines':
    case 'chicken':
      return stepped(r.hits + (r.status === 'lost' ? 1 : 0),
        j => (MINES_CELLS - r.bombs - j + 1) / (MINES_CELLS - j + 1),
        j => minesPayout(A, R, r.bombs, j));
    case 'crash': {
      // Grid levels 1.01, 1.02, … : level j is multiplier (100 + j) hundredths.
      const attempts = r.status === 'cashed' ? r.cashout - 100 : r.crashPoint === 100 ? 1 : r.crashPoint + 1 - 100;
      let previous = 1;
      return stepped(attempts, j => {
        const reach = crashChance(R, 100 + j), q = reach / previous;
        previous = reach;
        return q;
      }, j => Math.floor(A * (100 + j) / 100));
    }
  }
  throw Error('Unknown game');
}
export const withMoments = r => Object.assign(r, moments(r));

const blank = () => ({ count: 0, wagered: 0, paid: 0, expected: 0, variance: 0, paying: 0, profitable: 0, best: 0 });
export function summarize(rounds) {
  const total = blank(), games = {};
  for (const r of rounds) {
    const { ev, variance } = r.ev === undefined ? moments(r) : r;
    for (const g of [total, games[r.game ?? 'hilo'] ??= blank()]) {
      g.count++; g.wagered += r.amount; g.paid += r.payout;
      g.expected += ev; g.variance += variance;
      g.paying += Number(r.payout > 0); g.profitable += Number(r.payout > r.amount);
      g.best = Math.max(g.best, r.payout / r.amount);
    }
  }
  return { ...total, games };
}
