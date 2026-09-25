import { createHash, createHmac, randomBytes } from 'node:crypto';

export const hash = seed => createHash('sha256').update(seed).digest('hex');
export const newSeed = () => randomBytes(32).toString('hex');
export const hmac = (serverSeed, parts) => createHmac('sha256', serverSeed).update(JSON.stringify(parts)).digest();
// Uniform integer in [0, n): uint32 words of HMAC(protocol, clientSeed, nonce, cursor);
// words ≥ floor(2^32 / n)·n are rejected, which removes modulo bias.
export function uniformRoll(serverSeed, protocol, clientSeed, nonce, n) {
  const limit = Math.floor(4294967296 / n) * n;
  for (let cursor = 0; ; cursor++) {
    const digest = hmac(serverSeed, [protocol, clientSeed, nonce, cursor]);
    for (let offset = 0; offset < 32; offset += 4) {
      const value = digest.readUInt32BE(offset);
      if (value < limit) return value % n;
    }
  }
}
export const roll = (serverSeed, clientSeed, nonce) => uniformRoll(serverSeed, 'hilo-v1', clientSeed, nonce, 10000);
export function terms(direction, threshold, rtpBps) {
  const outcomes = direction === 'under' ? threshold * 100 : 10000 - threshold * 100;
  return { outcomes, chance: outcomes / 100, multiplier: rtpBps / outcomes };
}
export function settle({ direction, threshold, amount, rtpBps, result }) {
  const { outcomes } = terms(direction, threshold, rtpBps);
  const won = direction === 'under' ? result < threshold * 100 : result >= threshold * 100;
  return { won, payout: won ? Math.floor(amount * rtpBps / outcomes) : 0 };
}

// stairs-v1: 8 steps × 5 cells (legacy rounds). stairs-v2: 12 steps, step n has 20 − n cells,
// so upper steps are narrower and riskier. k rocks fall on a uniform k-subset of each step.
export const LADDER = {
  'stairs-v1': { widths: Array(8).fill(5), maxRocks: 4 },
  'stairs-v2': { widths: Array.from({ length: 12 }, (_, i) => 19 - i), maxRocks: 7 },
};
// Domain separation + unbiased Fisher-Yates: every subset of rocks is equally likely.
export function ladderBoard(serverSeed, clientSeed, nonce, rocks, protocol = 'stairs-v2') {
  return LADDER[protocol].widths.map((width, row) => {
    const cells = Array.from({ length: width }, (_, i) => i);
    for (let i = width - 1; i > 0; i--) {
      const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
      for (let cursor = 0; ; cursor++) {
        const value = hmac(serverSeed, [protocol, clientSeed, nonce, rocks, row, i, cursor]).readUInt32BE(0);
        if (value >= limit) continue;
        const j = value % (i + 1);
        [cells[i], cells[j]] = [cells[j], cells[i]];
        break;
      }
    }
    return cells.slice(0, rocks).sort((a, b) => a - b);
  });
}
// Payout after `steps` safe steps: stake · RTP / P(survive), floored to 0.01 CR once.
export function ladderPayout(amount, rtpBps, rocks, steps, protocol = 'stairs-v2') {
  if (steps === 0) return 0;
  const widths = LADDER[protocol].widths.slice(0, steps);
  const cells = widths.reduce((a, w) => a * BigInt(w), 1n);
  const safe = widths.reduce((a, w) => a * BigInt(w - rocks), 1n);
  return Number(BigInt(amount) * BigInt(rtpBps) * cells / (10000n * safe));
}
export const ladderMultiplier = (rtpBps, rocks, steps, protocol = 'stairs-v2') =>
  LADDER[protocol].widths.slice(0, steps).reduce((m, w) => m * w / (w - rocks), rtpBps / 10000);

// mines-v1: 5×5 field, b bombs on a uniform b-subset (Fisher-Yates as above, one shuffle).
// chicken-v1 is the same draw walked in order: lane n is slot n − 1, so the chicken is hit
// on lane n with chance b / (26 − n) given it survived so far, and at most 25 − b lanes exist.
// After n diamonds (lanes) the payout is stake · RTP · C(25, n) / C(25 − b, n), floored once.
export const MINES_CELLS = 25;
export function minesBoard(serverSeed, clientSeed, nonce, bombs, protocol = 'mines-v1') {
  const cells = Array.from({ length: MINES_CELLS }, (_, i) => i);
  for (let i = MINES_CELLS - 1; i > 0; i--) {
    const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
    for (let cursor = 0; ; cursor++) {
      const value = hmac(serverSeed, [protocol, clientSeed, nonce, bombs, i, cursor]).readUInt32BE(0);
      if (value >= limit) continue;
      const j = value % (i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
      break;
    }
  }
  return cells.slice(0, bombs).sort((a, b) => a - b);
}
export function minesPayout(amount, rtpBps, bombs, hits) {
  if (hits === 0) return 0;
  let cells = 1n, safe = 1n;
  for (let i = 0; i < hits; i++) { cells *= BigInt(MINES_CELLS - i); safe *= BigInt(MINES_CELLS - bombs - i); }
  return Number(BigInt(amount) * BigInt(rtpBps) * cells / (10000n * safe));
}
export function minesMultiplier(rtpBps, bombs, hits) {
  let m = rtpBps / 10000;
  for (let i = 0; i < hits; i++) m = m * (MINES_CELLS - i) / (MINES_CELLS - bombs - i);
  return m;
}

// roulette-v1: one uniform number 0–14; 0 is green, 1–7 red, 8–14 black.
export const rouletteRoll = (serverSeed, clientSeed, nonce) => uniformRoll(serverSeed, 'roulette-v1', clientSeed, nonce, 15);
export const rouletteWinners = target => target === 'red' || target === 'black' ? 7 : 1;
export const rouletteHit = (target, result) =>
  target === 'red' ? result >= 1 && result <= 7 : target === 'black' ? result >= 8 : target === result;
export const roulettePayout = (amount, rtpBps, target) => Math.floor(amount * rtpBps * 15 / (10000 * rouletteWinners(target)));

// upgrade-v1: roll uniform on [0, 10^6). The player names the target payout T for stake A;
// winning outcomes W = floor(10^6·A·R / (10000·T)), so EV = T·W/10^6 never exceeds A·RTP.
export const UPGRADE_SPACE = 1000000;
export const upgradeRoll = (serverSeed, clientSeed, nonce) => uniformRoll(serverSeed, 'upgrade-v1', clientSeed, nonce, UPGRADE_SPACE);
export const upgradeOutcomes = (amount, target, rtpBps) =>
  Number(BigInt(UPGRADE_SPACE) * BigInt(amount) * BigInt(rtpBps) / (10000n * BigInt(target)));

// plinko-v1: one fair bit per row from HMAC(plinko-v1, clientSeed, nonce), MSB first;
// 1 = right. The bucket is the number of right bounces, Binomial(rows, 1/2).
// Shapes (tenths, centre → edge) are rescaled so that Σ P(i)·multiplier(i) = RTP exactly:
// multiplier(i) = RTP · shape(i) · 2^rows / Σ C(rows, j)·shape(j), floored to 0.01 CR on payout.
export const PLINKO_SHAPES = {
  low: {
    8: [5, 10, 11, 21, 56], 9: [7, 10, 16, 20, 56], 10: [5, 10, 11, 14, 30, 89], 11: [7, 10, 13, 19, 30, 84],
    12: [5, 10, 11, 14, 16, 30, 100], 13: [7, 9, 12, 19, 30, 40, 81], 14: [5, 10, 11, 13, 14, 19, 40, 71],
    15: [7, 10, 11, 15, 20, 30, 80, 150], 16: [5, 10, 11, 12, 14, 14, 20, 90, 160],
  },
  medium: {
    8: [4, 7, 13, 30, 130], 9: [5, 9, 17, 40, 180], 10: [4, 6, 14, 20, 50, 220], 11: [5, 7, 18, 30, 60, 240],
    12: [3, 6, 11, 20, 40, 110, 330], 13: [4, 7, 13, 30, 60, 130, 430], 14: [2, 5, 10, 19, 40, 70, 150, 580],
    15: [3, 5, 13, 30, 50, 110, 180, 880], 16: [3, 5, 10, 15, 30, 50, 100, 410, 1100],
  },
  high: {
    8: [2, 3, 15, 40, 290], 9: [2, 6, 20, 70, 430], 10: [2, 3, 9, 30, 100, 760], 11: [2, 4, 14, 52, 140, 1200],
    12: [2, 2, 7, 20, 81, 240, 1700], 13: [2, 2, 10, 40, 110, 370, 2600], 14: [2, 2, 3, 19, 50, 180, 560, 4200],
    15: [2, 2, 5, 30, 80, 270, 830, 6200], 16: [2, 2, 2, 20, 40, 90, 260, 1300, 10000],
  },
};
export const binomial = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return Math.round(c); };
export function plinkoShape(rows, risk) {
  const half = PLINKO_SHAPES[risk][rows];
  return Array.from({ length: rows + 1 }, (_, i) => half[Math.abs(i - rows / 2) | 0]);
}
const plinkoWeight = (rows, risk) => plinkoShape(rows, risk).reduce((a, s, i) => a + binomial(rows, i) * s, 0);
export const plinkoMultipliers = (rows, risk, rtpBps) =>
  plinkoShape(rows, risk).map(s => rtpBps / 10000 * s * 2 ** rows / plinkoWeight(rows, risk));
export const plinkoPayout = (amount, rows, risk, rtpBps, bucket) =>
  Number(BigInt(amount) * BigInt(rtpBps) * BigInt(plinkoShape(rows, risk)[bucket]) * 2n ** BigInt(rows) / (10000n * BigInt(plinkoWeight(rows, risk))));
export function plinkoPath(serverSeed, clientSeed, nonce, rows) {
  const digest = hmac(serverSeed, ['plinko-v1', clientSeed, nonce]);
  return Array.from({ length: rows }, (_, i) => (digest[i >> 3] >> (7 - (i & 7))) & 1);
}

// crash-v1: multipliers are integer hundredths. u is uniform on [0, 2^52), and
// C = floor(R·2^52 / (100·(u+1))) gives P(C ≥ M) = floor(R·2^52 / (100·M)) / 2^52
// for every M ≥ 101, i.e. RTP/m up to 2^-52. Below ×1.01 the round busts instantly.
export const CRASH_BITS = 2n ** 52n;
export const CRASH_CAP = 100000000;
export function crashPoint(serverSeed, clientSeed, nonce, rtpBps) {
  const u = BigInt('0x' + hmac(serverSeed, ['crash-v1', clientSeed, nonce]).toString('hex').slice(0, 13));
  const raw = BigInt(rtpBps) * CRASH_BITS / (100n * (u + 1n));
  return raw < 101n ? 100 : Number(raw > BigInt(CRASH_CAP) ? BigInt(CRASH_CAP) : raw);
}
// Exact probability that the crash point reaches M hundredths (M ≥ 101).
export const crashChance = (rtpBps, m) => Number(BigInt(rtpBps) * CRASH_BITS / (100n * BigInt(m))) / 2 ** 52;
