import {test} from 'node:test';import assert from 'node:assert/strict';
import {mcp} from '../src/mcp.js';import {FakeD1,request} from './helpers/orch-d1-stub.js';
const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
const env=(extra:any={})=>({OWNER_ID:'1',REPOSITORY:'owner/repo',REPOSITORY_ID:'2',WORKFLOW:'f.yml',REVIEWED_REF:'main',REVIEWED_SHA:'a'.repeat(40),GITHUB_TOKEN:'t',...extra}) as any;
const call=async(e:any,body:any)=>(await (await mcp(new Request('https://x/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,...body})}),e,'1')).json()) as any;
test('orch tool hidden unless flag and ORCH_DB both set',async()=>{
 for(const e of [env(),env({ORCH_LEDGER_ENABLED:'true'}),env({ORCH_DB:new FakeD1()})]){const b=await call(e,{method:'tools/list'});assert.ok(!b.result.tools.some((t:any)=>t.name==='orch_reserve_task'));}
});
test('orch tool reserves idempotently and never executes writes',async()=>{
 const e=env({ORCH_LEDGER_ENABLED:'true',ORCH_DB:new FakeD1()});
 const b=await call(e,{method:'tools/list'});assert.ok(b.result.tools.some((t:any)=>t.name==='orch_reserve_task'));
 const r=async(req:any)=>{const res=await call(e,{method:'tools/call',params:{name:'orch_reserve_task',arguments:{request:req}}});return res.result;};
 const a=JSON.parse((await r(request)).content[0].text),c=JSON.parse((await r(request)).content[0].text);
 assert.equal(a.existing,false);assert.equal(c.existing,true);assert.equal(a.execution_performed,false);
 const w=JSON.parse((await r({...request,task_id:'task_write_0001',idempotency_key:'idem_write_0001',action:'merge'})).content[0].text);assert.equal(w.status,'REVIEW');
 const bad=await r({...request,intent:'changed'});assert.equal(bad.isError,true);assert.equal(bad.content[0].text,'idempotency_conflict');
});
