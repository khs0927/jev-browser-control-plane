import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserveDraft} from '../src/orch-ledger.js';
import {FakeD1,owner,request} from './helpers/orch-d1-stub.js';
const db=()=>new FakeD1() as any;
test('same task id cannot be bound to a new request key',async()=>{
 const d=db();await reserveDraft(d,owner,request);
 await assert.rejects(reserveDraft(d,owner,{...request,idempotency_key:'idem_20261015_b'}),/task_id_collision/);
});
test('different owners keep reservations separate',async()=>{
 const d=db();await reserveDraft(d,owner,request);
 await reserveDraft(d,'b'.repeat(64),{...request,task_id:'task_20261015_b'});
 assert.equal(d.rows.size,2);
});
test('owner subject must be trusted hash',async()=>assert.rejects(reserveDraft(db(),'invalid',request),/invalid_owner_hash/));
test('unsupported service rejected',async()=>assert.rejects(reserveDraft(db(),owner,{...request,target:'other'}),/action_not_allowlisted/));
test('unknown top-level property rejected',async()=>assert.rejects(reserveDraft(db(),owner,{...request,extra:'x'} as any),/invalid_draft_request/));
test('malformed nested approval rejected',async()=>assert.rejects(reserveDraft(db(),owner,{...request,approval:{status:'APPROVED',extra:'x'} as any}),/invalid_approval/));
test('missing budget amount rejected',async()=>assert.rejects(reserveDraft(db(),owner,{...request,budget:{currency:'USD'} as any}),/budget_not_zero/));
