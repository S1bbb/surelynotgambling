// Independent browser implementation of roulette-v1, upgrade-v1, crash-v1, plinko-v1,
// mines-v1 and chicken-v1. No API or server module imports: the tests transpile this file
// alone and compare it with the server. The game screens reuse the same formulas.

const enc = new TextEncoder();
async function hmacKey(serverSeed: string) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}
const sign = async (key: CryptoKey, parts: unknown[]) =>
  new DataView(
    await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(parts))),
  );
export async function sha256(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function uniform(
  key: CryptoKey,
  protocol: string,
  clientSeed: string,
  nonce: number,
  n: number,
) {
  const limit = Math.floor(4294967296 / n) * n;
  for (let cursor = 0; ; cursor++) {
    const view = await sign(key, [protocol, clientSeed, nonce, cursor]);
    for (let offset = 0; offset < 32; offset += 4) {
      const value = view.getUint32(offset, false);
      if (value < limit) return value % n;
    }
  }
}

// ---- Shared formulas (amounts in cents, RTP in basis points) ----
export const ROULETTE_ORDER = [0, 1, 14, 2, 13, 3, 12, 4, 11, 5, 10, 6, 9, 7, 8];
export type RouletteTarget = 'red' | 'black' | number;
export const rouletteColor = (n: number) =>
  n === 0 ? 'green' : n <= 7 ? 'red' : 'black';
export const rouletteWinners = (t: RouletteTarget) =>
  t === 'red' || t === 'black' ? 7 : 1;
export const rouletteHit = (t: RouletteTarget, n: number) =>
  t === 'red' ? n >= 1 && n <= 7 : t === 'black' ? n >= 8 : t === n;
export const rouletteMultiplier = (t: RouletteTarget, rtpBps: number) =>
  (rtpBps * 15) / (10000 * rouletteWinners(t));
export const roulettePayout = (
  amount: number,
  rtpBps: number,
  t: RouletteTarget,
) => Math.floor((amount * rtpBps * 15) / (10000 * rouletteWinners(t)));

export const UPGRADE_SPACE = 1000000;
export const upgradeOutcomes = (
  amount: number,
  target: number,
  rtpBps: number,
) =>
  Number(
    (BigInt(UPGRADE_SPACE) * BigInt(amount) * BigInt(rtpBps)) /
      (10000n * BigInt(target)),
  );

export const CRASH_GROWTH = 0.00006;
export const CRASH_MAX = 100000;
export const crashMultiplierAt = (ms: number) =>
  Math.min(CRASH_MAX, Math.floor(100 * Math.exp(CRASH_GROWTH * Math.max(0, ms))));
export const crashTimeFor = (hundredths: number) =>
  Math.log(hundredths / 100) / CRASH_GROWTH;
// Exact P(crash point ≥ m) for m ≥ 101 hundredths.
export const crashChance = (rtpBps: number, m: number) =>
  Number((BigInt(rtpBps) * 2n ** 52n) / (100n * BigInt(m))) / 2 ** 52;

export const MINES_CELLS = 25;
export const CHICKEN_DIFFICULTY = { easy: 1, medium: 3, hard: 5, daredevil: 10 };
export type ChickenDifficulty = keyof typeof CHICKEN_DIFFICULTY;
export function minesPayout(
  amount: number,
  rtpBps: number,
  bombs: number,
  hits: number,
) {
  if (hits === 0) return 0;
  let cells = 1n,
    safe = 1n;
  for (let i = 0; i < hits; i++) {
    cells *= BigInt(MINES_CELLS - i);
    safe *= BigInt(MINES_CELLS - bombs - i);
  }
  return Number(
    (BigInt(amount) * BigInt(rtpBps) * cells) / (10000n * safe),
  );
}
export function minesMultiplier(rtpBps: number, bombs: number, hits: number) {
  let m = rtpBps / 10000;
  for (let i = 0; i < hits; i++)
    m = (m * (MINES_CELLS - i)) / (MINES_CELLS - bombs - i);
  return m;
}
// Chance to survive the next step after `hits` safe ones.
export const minesStepChance = (bombs: number, hits: number) =>
  (MINES_CELLS - bombs - hits) / (MINES_CELLS - hits);

export type PlinkoRisk = 'low' | 'medium' | 'high';
const PLINKO_SHAPES: Record<PlinkoRisk, Record<number, number[]>> = {
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
export function binomial(n: number, k: number) {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}
const plinkoShape = (rows: number, risk: PlinkoRisk) =>
  Array.from(
    { length: rows + 1 },
    (_, i) => PLINKO_SHAPES[risk][rows][Math.abs(i - rows / 2) | 0],
  );
const plinkoWeight = (rows: number, risk: PlinkoRisk) =>
  plinkoShape(rows, risk).reduce((a, s, i) => a + binomial(rows, i) * s, 0);
export const plinkoMultipliers = (
  rows: number,
  risk: PlinkoRisk,
  rtpBps: number,
) =>
  plinkoShape(rows, risk).map(
    (s) => ((rtpBps / 10000) * s * 2 ** rows) / plinkoWeight(rows, risk),
  );
export const plinkoPayout = (
  amount: number,
  rows: number,
  risk: PlinkoRisk,
  rtpBps: number,
  bucket: number,
) =>
  Number(
    (BigInt(amount) *
      BigInt(rtpBps) *
      BigInt(plinkoShape(rows, risk)[bucket]) *
      2n ** BigInt(rows)) /
      (10000n * BigInt(plinkoWeight(rows, risk))),
  );

// ---- Replays from revealed seeds ----
export type SeedInput = {
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  commitment: string;
};
async function prepare(input: SeedInput) {
  if (!/^[a-f0-9]{64}$/.test(input.serverSeed))
    throw Error('Server seed: 64 символа 0–9 и a–f.');
  if (!input.clientSeed.length || input.clientSeed.length > 128)
    throw Error('Client seed: от 1 до 128 символов.');
  if (!/^\d+$/.test(input.nonce) || !Number.isSafeInteger(Number(input.nonce)))
    throw Error('Nonce: целое неотрицательное число.');
  if (input.commitment && !/^[a-fA-F0-9]{64}$/.test(input.commitment))
    throw Error('SHA-256: 64 шестнадцатеричных символа.');
  const commitment = await sha256(input.serverSeed);
  return {
    key: await hmacKey(input.serverSeed),
    nonce: Number(input.nonce),
    commitment,
    hashMatches: input.commitment
      ? commitment === input.commitment.toLowerCase()
      : null,
  };
}
export async function replayRoulette(input: SeedInput) {
  const p = await prepare(input);
  return { ...p, result: await uniform(p.key, 'roulette-v1', input.clientSeed, p.nonce, 15) };
}
export async function replayUpgrade(input: SeedInput) {
  const p = await prepare(input);
  return { ...p, result: await uniform(p.key, 'upgrade-v1', input.clientSeed, p.nonce, UPGRADE_SPACE) };
}
export async function replayCrash(input: SeedInput, rtpBps: number) {
  if (!Number.isInteger(rtpBps) || rtpBps < 8000 || rtpBps > 9900)
    throw Error('RTP: от 80 до 99%.');
  const p = await prepare(input);
  const view = await sign(p.key, ['crash-v1', input.clientSeed, p.nonce]);
  const hex = Array.from({ length: 7 }, (_, i) =>
    view.getUint8(i).toString(16).padStart(2, '0'),
  )
    .join('')
    .slice(0, 13);
  const raw = (BigInt(rtpBps) * 2n ** 52n) / (100n * (BigInt('0x' + hex) + 1n));
  const result = raw < 101n ? 100 : Number(raw > 100000000n ? 100000000n : raw);
  return { ...p, result };
}
export async function replayPlinko(input: SeedInput, rows: number) {
  if (!Number.isInteger(rows) || rows < 8 || rows > 16)
    throw Error('Рядов: от 8 до 16.');
  const p = await prepare(input);
  const view = await sign(p.key, ['plinko-v1', input.clientSeed, p.nonce]);
  const path = Array.from(
    { length: rows },
    (_, i) => (view.getUint8(i >> 3) >> (7 - (i & 7))) & 1,
  );
  return { ...p, path, result: path.reduce((a, b) => a + b, 0) };
}
export async function replayMines(
  input: SeedInput,
  bombs: number,
  protocol: 'mines-v1' | 'chicken-v1',
) {
  if (!Number.isInteger(bombs) || bombs < 1 || bombs > 24)
    throw Error('Бомб: от 1 до 24.');
  const p = await prepare(input);
  const cells = Array.from({ length: MINES_CELLS }, (_, i) => i);
  for (let i = MINES_CELLS - 1; i > 0; i--) {
    const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
    for (let cursor = 0; ; cursor++) {
      const value = (
        await sign(p.key, [protocol, input.clientSeed, p.nonce, bombs, i, cursor])
      ).getUint32(0, false);
      if (value >= limit) continue;
      const j = value % (i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
      break;
    }
  }
  return { ...p, result: cells.slice(0, bombs).sort((a, b) => a - b) };
}
