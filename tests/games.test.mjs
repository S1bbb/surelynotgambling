import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import {
  hash, crashPoint, crashChance, rouletteRoll, roulettePayout, upgradeRoll, upgradeOutcomes, UPGRADE_SPACE,
  plinkoPath, plinkoPayout, plinkoMultipliers, PLINKO_SHAPES, binomial, minesBoard, minesPayout, minesMultiplier,
} from '../server/fairness.mjs';
import { initialState, snapshot, rotate } from '../server/service.mjs';
import { startCrash, cashoutCrash, tickCrash, crashDue, CRASH_GROWTH } from '../server/crash.mjs';
import { startMines, stepMines, cashoutMines, startChicken, stepChicken, cashoutChicken } from '../server/mines.mjs';
import { spinRoulette, upgrade, dropPlinko } from '../server/instant.mjs';
import { moments, summarize } from '../server/stats.mjs';

const SEED = 'e'.repeat(64);
let counter = 0;
const id = () => 'games-test-' + String(++counter).padStart(8, '0');
function fresh() { const s = initialState(); s.seed = SEED; return s; }
const quote = s => ({ requestId: id(), clientSeed: 'stats', version: s.version, commitment: hash(s.seed) });
const timeFor = m => Math.log(m / 100) / CRASH_GROWTH + 1;
// Deterministic pseudo-random strategy choices, independent of the game RNG.
function lcg(seed) { let x = seed >>> 0; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32; }

test('reference tables: mines 3 bombs at 95% and chicken daredevil at 96%', () => {
  assert.deepEqual([1,2,3,4,5,6,7,8].map(n => Math.floor(minesMultiplier(9500, 3, n) * 100) / 100), [1.07,1.23,1.41,1.64,1.91,2.25,2.67,3.21]);
  // The chicken reference rounds to nearest: 1.60 2.74 4.85 8.90 16.98 33.97.
  assert.deepEqual([1,2,3,4,5,6].map(n => (minesMultiplier(9600, 10, n)).toFixed(2)), ['1.60','2.74','4.85','8.90','16.98','33.97']);
});

test('crash distribution: P(C ≥ m) = RTP / m exactly and empirically', () => {
  for (const m of [101, 150, 200, 1000, 100000]) assert.ok(Math.abs(crashChance(9700, m) - 97 / m) < 1e-15);
  const n = 20000; let over2 = 0, instant = 0;
  for (let nonce = 0; nonce < n; nonce++) { const c = crashPoint(SEED, 'dist', nonce, 9700); over2 += Number(c >= 200); instant += Number(c === 100); }
  // 4σ binomial bands.
  assert.ok(Math.abs(over2 / n - 0.485) < 4 * Math.sqrt(0.485 * 0.515 / n), `P(C≥2) = ${over2 / n}`);
  const pInstant = 1 - crashChance(9700, 101);
  assert.ok(Math.abs(instant / n - pInstant) < 4 * Math.sqrt(pInstant * (1 - pInstant) / n));
});

test('crash flow: hidden point, manual cashout by server time, auto target, lazy settle', () => {
  const s = fresh(), t0 = 1_000_000;
  const r = startCrash(s, { ...quote(s), amount: 10000 }, t0);
  assert.equal(s.balance, 990000); assert.equal(r.crashPoint, undefined);
  assert.equal(JSON.stringify(snapshot(s)).includes('crashPoint'), false);
  assert.throws(() => rotate(s));
  const crash = crashPoint(SEED, 'stats', r.nonce, 9700);
  const done = cashoutCrash(s, { roundId: r.id }, t0 + timeFor(150));
  if (crash >= 150) { assert.equal(done.status, 'cashed'); assert.equal(done.cashout, 150); assert.equal(done.payout, 15000); }
  else { assert.equal(done.status, 'lost'); assert.equal(done.payout, 0); }
  assert.equal(done.crashPoint, crash);
  assert.deepEqual(cashoutCrash(s, { roundId: r.id }, t0 + 999999), done); // retry is idempotent
  // Auto target: nothing happens before its time, then the read settles it.
  for (let nonce = 0; nonce < 30; nonce++) {
    const q = fresh(); q.nonce = nonce;
    const a = startCrash(q, { ...quote(q), amount: 10000, target: 200 }, t0);
    const point = crashPoint(SEED, 'stats', nonce, 9700);
    assert.equal(crashDue(q, t0 + 10), false); // still ×1.00 on screen
    const settled = tickCrash(q, t0 + timeFor(Math.min(point + 1, 200)));
    assert.ok(settled);
    assert.equal(settled.status, point >= 200 ? 'cashed' : 'lost');
    assert.equal(settled.payout, point >= 200 ? 20000 : 0);
    assert.equal(a.id, settled.id);
  }
});

test('mines and chicken: payouts, loss, completion, idempotent retries', () => {
  const s = fresh();
  const b = { ...quote(s), amount: 10000, bombs: 3 };
  const r = startMines(s, b);
  assert.deepEqual(startMines(s, b), r); assert.equal(s.balance, 990000);
  const board = minesBoard(SEED, 'stats', r.nonce, 3);
  const safe = [...Array(25).keys()].filter(c => !board.includes(c));
  stepMines(s, { roundId: r.id, step: 0, cell: safe[0] });
  stepMines(s, { roundId: r.id, step: 0, cell: safe[0] });
  assert.equal(r.hits, 1);
  assert.throws(() => stepMines(s, { roundId: r.id, step: 1, cell: safe[0] })); // already open
  const cashed = cashoutMines(s, { roundId: r.id, hits: 1 });
  assert.equal(cashed.payout, minesPayout(10000, 9700, 3, 1)); assert.equal(cashed.payout, 11022);
  assert.deepEqual(cashed.board, board);
  const lose = startMines(s, { ...quote(s), amount: 10000, bombs: 24 });
  const all = minesBoard(SEED, 'stats', lose.nonce, 24);
  const only = [...Array(25).keys()].find(c => !all.includes(c));
  const won = stepMines(s, { roundId: lose.id, step: 0, cell: only });
  assert.equal(won.status, 'completed'); assert.equal(won.payout, minesPayout(10000, 9700, 24, 1)); // ×24.25
  for (const patch of [{ bombs: 0 }, { bombs: 25 }, { amount: 99 }]) assert.throws(() => startMines(fresh(), { ...quote(s), amount: 10000, bombs: 3, ...patch }));
  // Chicken walks lanes in order; the first car ends the run.
  const c = fresh();
  const run = startChicken(c, { ...quote(c), amount: 10000, difficulty: 'daredevil' });
  const cars = minesBoard(SEED, 'stats', run.nonce, 10, 'chicken-v1'), first = Math.min(...cars);
  for (let lane = 0; lane <= first; lane++) stepChicken(c, { roundId: run.id, step: lane });
  assert.equal(run.status, 'lost'); assert.equal(run.hits, first); assert.equal(run.maxHits, 15);
  assert.throws(() => startChicken(fresh(), { ...quote(c), amount: 10000, difficulty: 'insane' }));
  const e = fresh(); e.nonce = 1;
  const easy = startChicken(e, { ...quote(e), amount: 10000, difficulty: 'easy' });
  const car = minesBoard(SEED, 'stats', easy.nonce, 1, 'chicken-v1')[0];
  if (car > 0) { stepChicken(e, { roundId: easy.id, step: 0 }); assert.equal(cashoutChicken(e, { roundId: easy.id, hits: 1 }).payout, minesPayout(10000, 9700, 1, 1)); }
});

test('roulette: uniform result, exact payouts, several chips per spin', () => {
  const counts = Array(15).fill(0), n = 15000;
  for (let nonce = 0; nonce < n; nonce++) counts[rouletteRoll(SEED, 'wheel', nonce)]++;
  const chi = counts.reduce((a, c) => a + (c - n / 15) ** 2 / (n / 15), 0);
  assert.ok(chi < 36.1, `chi-square ${chi.toFixed(1)} with 14 d.f. exceeds p = 0.001`);
  for (const target of ['red', 'black', 0, 7]) {
    const ev = [...Array(15).keys()].reduce((a, x) => a + (roulettePayout(10000, 9700, target) * Number(target === 'red' ? x >= 1 && x <= 7 : target === 'black' ? x >= 8 : x === target)), 0) / 15;
    assert.ok(ev <= 9700 && ev > 9699);
  }
  const s = fresh();
  const bets = [{ target: 'red', amount: 10000 }, { target: 0, amount: 500 }];
  const r = spinRoulette(s, { ...quote(s), bets });
  const color = r.result === 0 ? 0 : r.result <= 7 ? 'red' : 'black';
  const expected = (color === 'red' ? 20785 : 0) + (r.result === 0 ? 7275 : 0);
  assert.equal(r.payout, expected); assert.equal(s.balance, 1000000 - 10500 + expected);
  for (const bad of [[], [{ target: 'red', amount: 100 }, { target: 'red', amount: 100 }], [{ target: 15, amount: 100 }], [{ target: 'red', amount: 60000 }, { target: 'black', amount: 60000 }], [{ target: 'red', amount: 100, x: 1 }]])
    assert.throws(() => spinRoulette(fresh(), { ...quote(s), bets: bad }));
});

test('upgrade: chance W/10^6 keeps EV within one outcome below RTP', () => {
  for (const [amount, target] of [[100, 110], [10000, 20000], [12345, 1234500], [100000, 333333]]) {
    const W = upgradeOutcomes(amount, target, 9700);
    assert.ok(target * W <= amount * 9700 * 100 && target * (W + 1) > amount * 9700 * 100);
  }
  const s = fresh();
  const r = upgrade(s, { ...quote(s), amount: 10000, target: 25000 });
  assert.equal(r.outcomes, 388000); assert.equal(r.won, r.result < 388000);
  assert.equal(r.result, upgradeRoll(SEED, 'stats', r.nonce));
  for (const target of [10999, 10000001, 1.5]) assert.throws(() => upgrade(fresh(), { ...quote(s), amount: 10000, target }));
});

test('plinko: every table returns exactly RTP; bounces are fair bits', () => {
  for (const risk of Object.keys(PLINKO_SHAPES)) for (let rows = 8; rows <= 16; rows++) {
    const m = plinkoMultipliers(rows, risk, 9700);
    assert.ok(Math.abs(m.reduce((a, x, i) => a + binomial(rows, i) * x, 0) / 2 ** rows - 0.97) < 1e-12);
    assert.deepEqual(m, [...m].reverse());
    const paid = m.reduce((a, _, i) => a + binomial(rows, i) * plinkoPayout(10000, rows, risk, 9700, i), 0) / 2 ** rows;
    assert.ok(paid <= 9700 && paid > 9699);
  }
  const n = 8192, counts = Array(9).fill(0);
  for (let nonce = 0; nonce < n; nonce++) counts[plinkoPath(SEED, 'balls', nonce, 8).reduce((a, b) => a + b, 0)]++;
  const chi = counts.reduce((a, c, i) => a + (c - n * binomial(8, i) / 256) ** 2 / (n * binomial(8, i) / 256), 0);
  assert.ok(chi < 26.1, `chi-square ${chi.toFixed(1)} with 8 d.f. exceeds p = 0.001`);
  const s = fresh();
  const r = dropPlinko(s, { ...quote(s), amount: 10000, rows: 12, risk: 'high' });
  assert.equal(r.bucket, r.path.reduce((a, b) => a + b, 0));
  assert.equal(r.payout, plinkoPayout(10000, 12, 'high', 9700, r.bucket));
});

test('stepped moments: compensator averages to the exact EV of any fixed stopping rule', () => {
  // Mines, cash out after n diamonds: enumerate "hit on step j" and "survive n" outcomes.
  for (const bombs of [1, 3, 10, 24]) for (let n = 1; n <= Math.min(5, 25 - bombs); n++) {
    let alive = 1, meanEv = 0, meanVar = 0;
    for (let j = 1; j <= n; j++) {
      const q = (25 - bombs - j + 1) / (25 - j + 1), p = alive * (1 - q);
      const m = moments({ game: 'mines', amount: 12345, rtpBps: 9700, bombs, hits: j - 1, status: 'lost' });
      meanEv += p * m.ev; meanVar += p * m.variance; alive *= q;
    }
    const F = minesPayout(12345, 9700, bombs, n);
    const m = moments({ game: 'mines', amount: 12345, rtpBps: 9700, bombs, hits: n, status: 'cashed' });
    meanEv += alive * m.ev; meanVar += alive * m.variance;
    // E[compensator] = E[payout]; E[<M>] = E[(payout − compensator)²].
    assert.ok(Math.abs(meanEv - alive * F) < 1e-6);
    let lossSq = 0; alive = 1;
    for (let j = 1; j <= n; j++) {
      const q = (25 - bombs - j + 1) / (25 - j + 1);
      lossSq += alive * (1 - q) * moments({ game: 'mines', amount: 12345, rtpBps: 9700, bombs, hits: j - 1, status: 'lost' }).ev ** 2; alive *= q;
    }
    const residual = lossSq + alive * (F - m.ev) ** 2;
    assert.ok(Math.abs(residual - meanVar) < 1e-6 * Math.max(1, meanVar));
  }
  // Crash with target T: C = 100 with 1 − p(101), C = c with p(c) − p(c + 1), else cash at T.
  for (const T of [101, 137, 250]) {
    let ev = 0, prev = 1;
    for (let c = 100; c < T; c++) {
      const reach = crashChance(9700, c + 1), p = (c === 100 ? 1 : crashChance(9700, c)) - reach;
      ev += p * moments({ game: 'crash', amount: 10000, rtpBps: 9700, status: 'lost', crashPoint: c }).ev;
      prev = reach;
    }
    ev += prev * moments({ game: 'crash', amount: 10000, rtpBps: 9700, status: 'cashed', cashout: T }).ev;
    assert.ok(Math.abs(ev - crashChance(9700, T) * Math.floor(10000 * T / 100)) < 1e-6, `T=${T}`);
  }
});

test('z-score is calibrated: random cash-out strategies give N(0, 1) deviations', () => {
  const rand = lcg(20260925), zs = [];
  for (let batch = 0; batch < 60; batch++) {
    const s = fresh(); s.balance = 1e12;
    for (let i = 0; i < 60; i++) {
      const game = ['mines', 'chicken', 'crash', 'plinko'][i % 4];
      if (game === 'mines' || game === 'chicken') {
        const start = game === 'mines' ? startMines : startChicken, step = game === 'mines' ? stepMines : stepChicken;
        const r = start(s, { ...quote(s), amount: 100 + Math.floor(rand() * 99900), ...(game === 'mines' ? { bombs: 1 + Math.floor(rand() * 10) } : { difficulty: ['easy', 'medium', 'hard', 'daredevil'][Math.floor(rand() * 4)] }) });
        const stopAt = 1 + Math.floor(rand() * Math.min(8, r.maxHits));
        const closed = [...Array(25).keys()];
        while (r.status === 'active' && r.hits < stopAt) {
          const cell = game === 'mines' ? closed.splice(Math.floor(rand() * closed.length), 1)[0] : r.moves.length;
          step(s, { roundId: r.id, step: r.moves.length, cell });
        }
        if (r.status === 'active') (game === 'mines' ? cashoutMines : cashoutChicken)(s, { roundId: r.id, hits: r.hits });
      } else if (game === 'crash') {
        const target = 101 + Math.floor(rand() * 400);
        startCrash(s, { ...quote(s), amount: 10000, target }, 0);
        tickCrash(s, 1e7);
      } else {
        dropPlinko(s, { ...quote(s), amount: 100 + Math.floor(rand() * 99900), rows: 8 + Math.floor(rand() * 9), risk: ['low', 'medium', 'high'][Math.floor(rand() * 3)] });
      }
      s.seed = hash(s.seed + i); // fresh randomness per round, like new server seeds
    }
    const t = summarize(s.rounds);
    zs.push((t.paid - t.expected) / Math.sqrt(t.variance));
  }
  const mean = zs.reduce((a, z) => a + z, 0) / zs.length;
  const variance = zs.reduce((a, z) => a + (z - mean) ** 2, 0) / (zs.length - 1);
  // 60 batches: mean ~ N(0, 1/60), sample variance ~ 1 ± 0.18 (4σ bands below).
  assert.ok(Math.abs(mean) < 4 / Math.sqrt(zs.length), `mean z = ${mean.toFixed(3)}`);
  assert.ok(variance > 0.35 && variance < 1.9, `var z = ${variance.toFixed(3)}`);
});

test('independent browser verifier reproduces every new game', async () => {
  const source = readFileSync(new URL('../web/lib/verify-games.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  const v = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
  for (const clientSeed of ['student', 'проверка 🎲']) for (const nonce of [0, 7, 12345]) {
    const input = { serverSeed: SEED, clientSeed, nonce: String(nonce), commitment: hash(SEED) };
    assert.equal((await v.replayRoulette(input)).result, rouletteRoll(SEED, clientSeed, nonce));
    assert.equal((await v.replayUpgrade(input)).result, upgradeRoll(SEED, clientSeed, nonce));
    assert.equal((await v.replayCrash(input, 9700)).result, crashPoint(SEED, clientSeed, nonce, 9700));
    assert.deepEqual((await v.replayPlinko(input, 16)).path, plinkoPath(SEED, clientSeed, nonce, 16));
    assert.deepEqual((await v.replayMines(input, 5, 'mines-v1')).result, minesBoard(SEED, clientSeed, nonce, 5));
    assert.deepEqual((await v.replayMines(input, 10, 'chicken-v1')).result, minesBoard(SEED, clientSeed, nonce, 10, 'chicken-v1'));
    assert.equal((await v.replayRoulette(input)).hashMatches, true);
    assert.equal((await v.replayRoulette({ ...input, commitment: '0'.repeat(64) })).hashMatches, false);
  }
  for (let hits = 1; hits <= 5; hits++) assert.equal(v.minesPayout(12345, 9700, 3, hits), minesPayout(12345, 9700, 3, hits));
  for (let i = 0; i <= 16; i++) assert.equal(v.plinkoPayout(10000, 16, 'high', 9700, i), plinkoPayout(10000, 16, 'high', 9700, i));
  assert.equal(v.upgradeOutcomes(10000, 25000, 9700), upgradeOutcomes(10000, 25000, 9700));
  assert.equal(v.crashChance(9700, 200), crashChance(9700, 200));
  await assert.rejects(v.replayCrash({ serverSeed: 'x', clientSeed: 'a', nonce: '0', commitment: '' }, 9700));
  assert.equal(UPGRADE_SPACE, v.UPGRADE_SPACE);
});
