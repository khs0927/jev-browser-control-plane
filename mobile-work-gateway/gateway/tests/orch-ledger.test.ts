import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserveDraft,sha256} from '../src/orch-ledger.js';
import {FakeD1,owner,request} from './helpers/orch-d1-stub.js';
const db=()=>new FakeD1() as any;
test('stable SHA256',async()=>assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
test('first reservation and replay',async()=>{
 const d=db(),a=await reserveDraft(d,owner,request),b=await reserveDraft(d,owner,request);
 assert.equal(a.existing,false);assert.equal(b.existing,true);assert.equal(a.status,'VALIDATED');
});
test('changed request with same idempotency key rejected',async()=>{
 const d=db();await reserveDraft(d,owner,request);
 await assert.rejects(reserveDraft(d,owner,{...request,intent:'changed'}),/idempotency_conflict/);
});
test('mutating task never executes',async()=>{
 const r=await reserveDraft(db(),owner,{...request,action:'workflow.dispatch',approval:{status:'APPROVED'}});
 assert.equal(r.status,'REVIEW');assert.equal(r.execution_performed,false);
});
test('paid budget is rejected',async()=>assert.rejects(reserveDraft(db(),owner,{...request,budget:{max_paid_amount:1,currency:'USD'} as any}),/budget_not_zero/));
test('denied approval is rejected',async()=>assert.rejects(reserveDraft(db(),owner,{...request,approval:{status:'DENIED'}}),/approval_denied/));
