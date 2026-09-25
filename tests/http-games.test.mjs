import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { minesBoard } from '../server/fairness.mjs';

test('HTTP: every new game round-trips through the real server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sng-games-'));
  const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_FILE: join(dir, 'state.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timed out')), 10000);
      child.stdout.on('data', d => { const m = d.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    });
    let n = 0;
    const get = async path => (await fetch(base + '/api/' + path)).json();
    const post = async (path, body) => {
      const s = await get('state');
      const response = await fetch(base + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'http-games-' + String(++n).padStart(8, '0'), clientSeed: 'http', version: s.version, commitment: s.commitment, ...body }) });
      return { status: response.status, ...(await response.json()) };
    };
    const secret = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).seed;

    // Crash: the point stays hidden in flight; an auto target at ×1.01 settles on the next read.
    const crash = await post('crash/start', { amount: 10000, target: 101 });
    assert.equal(crash.round.status, 'active');
    assert.equal('crashPoint' in crash.state.activeCrash, false);
    await new Promise(r => setTimeout(r, 400));
    const view = await get('crash');
    assert.equal(view.activeCrash, null);
    assert.equal(view.last.id, crash.round.id);
    assert.equal(view.last.status, view.last.crashPoint >= 101 ? 'cashed' : 'lost');

    // Mines: a safe cell, then cash out.
    const mines = await post('mines/start', { amount: 10000, bombs: 3 });
    const bombs = minesBoard(secret(), 'http', mines.round.nonce, 3);
    const cell = [...Array(25).keys()].find(c => !bombs.includes(c));
    assert.equal((await post('mines/step', { roundId: mines.round.id, step: 0, cell })).round.hits, 1);
    const cashed = await post('mines/cashout', { roundId: mines.round.id, hits: 1 });
    assert.equal(cashed.round.payout, 11022); assert.deepEqual(cashed.round.board, bombs);

    // Chicken: first lane, then cash out or accept the hit.
    const chicken = await post('chicken/start', { amount: 10000, difficulty: 'hard' });
    const lane = await post('chicken/step', { roundId: chicken.round.id, step: 0 });
    if (lane.round.status === 'active') assert.equal((await post('chicken/cashout', { roundId: chicken.round.id, hits: 1 })).round.status, 'cashed');

    const spin = await post('roulette/spin', { bets: [{ target: 'black', amount: 1000 }, { target: 7, amount: 100 }] });
    assert.equal(spin.round.amount, 1100); assert.ok(spin.round.result >= 0 && spin.round.result <= 14);
    const up = await post('upgrade', { amount: 1000, target: 5000 });
    assert.equal(up.round.outcomes, 194000);
    const ball = await post('plinko', { amount: 100, rows: 16, risk: 'high' });
    assert.equal(ball.round.path.length, 16);
    assert.equal((await post('plinko', { amount: 100, rows: 17, risk: 'high' })).status, 400);

    const state = await get('state');
    assert.deepEqual(Object.keys(state.stats.games).sort(), ['chicken', 'crash', 'mines', 'plinko', 'roulette', 'upgrade']);
    assert.equal(state.stats.count, 6);
    assert.equal(JSON.stringify(state).includes(secret()), false);
    assert.equal((await post('seeds/rotate', {})).status, 200);
  } finally {
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    rmSync(dir, { recursive: true, force: true });
  }
});
