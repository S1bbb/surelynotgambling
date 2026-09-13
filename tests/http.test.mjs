import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { roll, hash } from '../server/fairness.mjs';

test('independent Web Crypto verifier matches server including Unicode seeds', async () => {
  const source = readFileSync(new URL('../web/lib/verify.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  const { verifyRoll } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
  for (const seed of ['student', 'проверка 🎲', '123']) for (const nonce of [0, 1, 99, 12345]) {
    const proof = await verifyRoll('a'.repeat(64), seed, nonce);
    assert.equal(proof.commitment, hash('a'.repeat(64)));
    assert.equal(proof.result, roll('a'.repeat(64), seed, nonce));
  }
});
test('HTTP flow: place, replay, stale quote, reveal, persistence and origin guard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sng-http-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_FILE: join(dir, 'state.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timed out')), 10000);
      child.once('error', reject);
      child.stdout.on('data', data => { const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
  }
  async function stop() { if (child.exitCode !== null) return; await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  try {
    let base = await start();
    const get = async () => (await fetch(base + '/api/state')).json();
    const post = (path, body, origin) => fetch(base + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    const s = await get();
    const b = { requestId: 'http-test-000000001', amount: 10000, direction: 'over', threshold: 50, clientSeed: 'coursework', version: s.version, commitment: s.commitment };
    const first = await (await post('bets', b)).json();
    assert.ok(first.round); assert.equal(first.state.stats.count, 1);
    const again = await (await post('bets', b)).json(); assert.equal(again.state.balance, first.state.balance);
    assert.equal((await post('bets', { ...b, amount: 0, requestId: 'http-test-000000002' })).status, 400);
    assert.equal((await post('admin/config', { rtpBps: 9200, version: s.version }, 'https://evil.example')).status, 403);
    assert.equal((await post('admin/config', { rtpBps: 9200, version: s.version })).status, 200);
    assert.equal((await post('bets', { ...b, requestId: 'http-test-000000003' })).status, 400);
    const rotated = await (await post('seeds/rotate', {})).json();
    assert.equal(roll(rotated.retired[0].seed, b.clientSeed, 0), first.round.result);
    const secret = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).seed;
    assert.equal(JSON.stringify(rotated).includes(secret), false);
    await stop(); base = await start(); const restored = await get();
    assert.equal(restored.balance, first.state.balance); assert.equal(restored.commitment, rotated.commitment);
    assert.equal(restored.rtpBps, 9200);
    assert.equal((await fetch(base + '/')).status, 200);
  } finally { if (child) await stop(); rmSync(dir, { recursive: true, force: true }); }
});
