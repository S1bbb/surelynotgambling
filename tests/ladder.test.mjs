import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { initialState, snapshot, rotate, configure, placeBet } from '../server/service.mjs';
import { hash } from '../server/fairness.mjs';
import { ladderBoard, ladderPayout, startLadder, stepLadder, cashoutLadder } from '../server/ladder.mjs';
import { JsonRepository } from '../server/repository.mjs';

const request = (s, rocks = 2) => ({ requestId: 'ladder-request-000001', amount: 10000, rocks, clientSeed: 'Студент 🎲', version: s.version, commitment: hash(s.seed) });
const safe = (board, row) => [0,1,2,3,4].find(c => !board[row].includes(c));
const setup = (rocks = 2) => { const s = initialState(); s.seed = 'a'.repeat(64); const b = request(s, rocks); const r = startLadder(s,b); return { s,b,r,board:ladderBoard(s.seed,r.clientSeed,r.nonce,r.rocks) }; };

test('ladder commits one stake, hides future cells and blocks seed reveal while active', () => {
  const { s,b,r } = setup();
  assert.equal(s.balance, 990000); assert.equal(s.nonce, 1);
  assert.deepEqual(startLadder(s,b),r); assert.equal(s.balance,990000);
  const view = snapshot(s);
  assert.equal(view.activeLadder.board,undefined); assert.deepEqual(view.activeLadder.revealed,[]);
  assert.equal(JSON.stringify(view).includes(s.seed),false);
  assert.throws(()=>rotate(s));
  assert.throws(()=>startLadder(s,{...b,requestId:'ladder-request-000002'}));
  assert.throws(()=>placeBet(s,{...b,threshold:50,direction:'under'}));
  assert.throws(()=>cashoutLadder(s,{roundId:r.id,steps:0}));
});
test('ladder loss records hit and board; retries neither advance nor spend again',()=>{
  const {s,b,r,board}=setup(); const hit={roundId:r.id,step:0,column:board[0][0]};
  const result=stepLadder(s,hit);
  assert.equal(result.status,'lost');assert.equal(result.payout,0);assert.equal(result.steps,0);
  assert.deepEqual(result.board,board);assert.equal(s.activeLadder,null);
  assert.deepEqual(stepLadder(s,hit),result);assert.deepEqual(startLadder(s,b),result);
  assert.equal(s.rounds.length,1);assert.equal(s.balance,990000);
  assert.throws(()=>stepLadder(s,{...hit,column:safe(board,0)}));
  rotate(s);assert.equal(s.retired[0].commitment,r.commitment);
});
test('cashout uses original RTP; exact integer rounding and replay survives later seed rotation',()=>{
  const {s,r,board}=setup(3);
  const move={roundId:r.id,step:0,column:safe(board,0)};
  stepLadder(s,move);assert.equal(r.steps,1);assert.deepEqual(r.revealed,[board[0]]);
  stepLadder(s,move);assert.equal(r.steps,1);
  configure(s,{rtpBps:8000,version:1});
  const done=cashoutLadder(s,{roundId:r.id,steps:1});
  assert.equal(done.payout,24250);assert.equal(s.balance,1014250);
  rotate(s);cashoutLadder(s,{roundId:r.id,steps:1});assert.equal(s.balance,1014250);
  assert.deepEqual(done.board,ladderBoard(s.retired[0].seed,r.clientSeed,r.nonce,r.rocks));
});
test('eighth safe step pays automatically for every rock count',()=>{
  for(let rocks=1;rocks<=4;rocks++) {
    const {s,r,board}=setup(rocks);
    for(let step=0;step<8;step++) stepLadder(s,{roundId:r.id,step,column:safe(board,step)});
    assert.equal(r.status,'completed');assert.equal(r.steps,8);assert.equal(s.activeLadder,null);
    const paid=ladderPayout(10000,9700,rocks,8);
    assert.equal(r.payout,paid);assert.equal(s.balance,990000+paid);
    cashoutLadder(s,{roundId:r.id,steps:8});assert.equal(s.balance,990000+paid);
  }
});
test('RTP applied once per run: exact expected payout over all equally likely paths',()=>{
  for(let rocks=1;rocks<=4;rocks++) for(let steps=1;steps<=8;steps++) {
    // Safe paths / all paths; BigInt keeps the probability comparison exact.
    const paid=BigInt(ladderPayout(12345,9700,rocks,steps));
    const safePaths=BigInt(5-rocks)**BigInt(steps),allPaths=5n**BigInt(steps);
    assert.ok(paid*safePaths*10000n<=12345n*9700n*allPaths);
    assert.ok((paid+1n)*safePaths*10000n>12345n*9700n*allPaths);
  }
});
test('invalid ladder inputs and skipped/stale steps rejected without altering the run',()=>{
  for(const patch of [{rocks:0},{rocks:5},{rocks:1.5},{amount:-1},{amount:1.5},{clientSeed:''},{version:99}]) {
    const s=initialState(); assert.throws(()=>startLadder(s,{...request(s),...patch}));assert.equal(s.balance,1000000);assert.equal(s.nonce,0);
  }
  const {s,r}=setup();
  for(const patch of [{step:1,column:0},{step:0,column:5},{step:-1,column:0},{step:0,column:1.5}]) assert.throws(()=>stepLadder(s,{roundId:r.id,...patch}));
  assert.deepEqual(r.moves,[]);assert.equal(s.balance,990000);
});
test('active run persists; concurrent choices and cashouts settle once',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sng-ladder-'));
  try {
    const file=join(dir,'state.json');let repo=new JsonRepository(file,initialState);
    const r=await repo.transaction(s=>startLadder(s,request(s)));
    repo=new JsonRepository(file,initialState);assert.equal(repo.read().activeLadder.id,r.id);
    const board=ladderBoard(repo.read().seed,r.clientSeed,r.nonce,r.rocks);
    const outcomes=await Promise.allSettled([safe(board,0),board[0][0]].map(column=>repo.transaction(s=>stepLadder(s,{roundId:r.id,step:0,column}))));
    assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
    await Promise.all(Array.from({length:10},()=>repo.transaction(s=>cashoutLadder(s,{roundId:r.id,steps:1}))));
    assert.equal(repo.read().rounds.length,1);
    assert.equal(repo.read().balance,990000+ladderPayout(10000,9700,2,1));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('independent browser verifier reproduces board, route, payout and detects tampering',async()=>{
  const source=readFileSync(new URL('../web/lib/verify-ladder.ts',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  const {verifyLadder}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
  for(let rocks=1;rocks<=4;rocks++) {
    const {s,r,board}=setup(rocks);
    const form={serverSeed:s.seed,clientSeed:r.clientSeed,nonce:String(r.nonce),rocks:String(rocks),commitment:r.commitment,amount:'100',rtp:'97',path:[safe(board,0),safe(board,1)].map(c=>c+1).join(','),recordedBoard:JSON.stringify(board),recordedPayout:(ladderPayout(10000,9700,rocks,2)/100).toFixed(2),recordedStatus:'cashed'};
    const proof=await verifyLadder(form);
    assert.deepEqual(proof.board,board);assert.equal(proof.hashMatches,true);assert.equal(proof.boardMatches,true);assert.equal(proof.payoutMatches,true);assert.equal(proof.statusMatches,true);
    assert.equal((await verifyLadder({...form,commitment:'0'.repeat(64),recordedPayout:'0'})).hashMatches,false);
    assert.equal((await verifyLadder({...form,recordedPayout:'0'})).payoutMatches,false);
    const wrong=board.map(row=>row.map(c=>(c+1)%5));
    assert.equal((await verifyLadder({...form,recordedBoard:JSON.stringify(wrong)})).boardMatches,false);
    const hit=await verifyLadder({...form,path:String(board[0][0]+1),recordedPayout:'0',recordedStatus:'lost'});
    assert.equal(hit.status,'lost');assert.equal(hit.payoutMatches,true);assert.equal(hit.steps,0);
    await assert.rejects(verifyLadder({...form,path:`${board[0][0]+1},1`}));
    for(const patch of [{nonce:'-1'},{rocks:'5'},{path:'6'},{recordedBoard:'[[]]'},{rtp:'100'},{amount:'NaN'}]) await assert.rejects(verifyLadder({...form,...patch}));
  }
});
