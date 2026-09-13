import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash, roll, settle } from '../server/fairness.mjs';
import { initialState, snapshot, placeBet, rotate, configure } from '../server/service.mjs';
import { JsonRepository } from '../server/repository.mjs';
const bet = s => ({ requestId: 'test-request-000001', amount: 10000, direction: 'under', threshold: 50, clientSeed: 'student', commitment: hash(s.seed), version: s.version });
test('commitment hides active seed; rotation permits exact replay', () => {
  const s = initialState(); const b = bet(s); const r = placeBet(s,b);
  assert.equal(JSON.stringify(snapshot(s)).includes(s.seed), false);
  rotate(s); const old = s.retired[0]; assert.equal(hash(old.seed), r.commitment);
  assert.equal(roll(old.seed,r.clientSeed,r.nonce),r.result);
  assert.equal(s.nonce,0); assert.notEqual(hash(s.seed),old.commitment);
});
test('idempotency prevents double debit and rejects changed payload', () => {
  const s=initialState(), b=bet(s); const r=placeBet(s,b), balance=s.balance;
  assert.deepEqual(placeBet(s,b),r); assert.equal(s.balance,balance); assert.equal(s.nonce,1);
  assert.throws(()=>placeBet(s,{...b,amount:20000}));
});
test('RTP changes invalidate stale quotes and preserve past rounds', () => {
  const s=initialState(), b=bet(s); placeBet(s,b); configure(s,{rtpBps:9000,version:1});
  assert.throws(()=>placeBet(s,{...b,requestId:'test-request-000002'}));
  assert.equal(s.rounds[0].rtpBps,9700); assert.equal(s.audit.length,1);
});
test('every outcome has correct boundary and theoretical payout', () => {
  for (const direction of ['under','over']) for (const threshold of [5,50,95]) {
    let paid=0, wins=0;
    for(let result=0; result<10000; result++) { const r=settle({direction,threshold,amount:10000,rtpBps:9700,result}); paid+=r.payout; wins+=Number(r.won); }
    assert.equal(wins,direction==='under'?threshold*100:10000-threshold*100);
    assert.ok(paid/10000/10000 <= .97); assert.ok(paid/10000/10000 > .9699);
  }
});
test('invalid bets cannot spend balance',()=>{
  for(const patch of [{amount:-1},{amount:NaN},{amount:1.5},{threshold:0},{direction:'x'},{clientSeed:''},{amount:100001}]) {
    const s=initialState(); assert.throws(()=>placeBet(s,{...bet(s),...patch})); assert.equal(s.balance,1000000);
  }
});
test('serialized commits survive reopening, rejected transactions roll back',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sng-test-'));
  try { const path=join(dir,'state.json'), repo=new JsonRepository(path,initialState);
    const b=bet(repo.read()); await Promise.all(Array.from({length:20},()=>repo.transaction(s=>placeBet(s,b))));
    assert.equal(repo.read().rounds.length,1);
    await assert.rejects(repo.transaction(s=>{s.balance=0;throw Error('rollback');}));
    assert.deepEqual(new JsonRepository(path,initialState).read(),repo.read());
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
