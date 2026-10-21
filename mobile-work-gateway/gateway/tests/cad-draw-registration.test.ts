import test from 'node:test';
import assert from 'node:assert/strict';
import {cadDrawRegistrationOnly} from '../src/cad-draw-registration.js';
import {mcp} from '../src/mcp.js';

const digest='a'.repeat(64);
const plan={
 schema:'hs-steel-draw-plan/1',producer:'khs0927/hs-steel-cad',
 units:'mm',contract_digest:digest,
 entities:[{spec:{type:'line',start:[0,0],end:[100,0]}}],
 execution_authorized:false,may_execute_mutation:false
};
const valid={job_id:'cad-test-001',idempotency_key:'cad-idem-001',
 format:'dxf',plan};

test('valid draw request always fails closed without configured reviewed executor',()=>{
 const r=cadDrawRegistrationOnly(valid);
 assert.equal(r.status,'backend_unavailable');
 assert.equal(r.execution_performed,false);
 assert.equal(r.independently_verified,false);
 assert.equal(r.customer_delivery_approved,false);
 assert.equal(r.job_id,valid.job_id);
});

for(const [label,raw] of [
 ['bad units',{...valid,plan:{...plan,units:'in'}}],
 ['bad producer',{...valid,plan:{...plan,producer:'unreviewed'}}],
 ['false digest',{...valid,plan:{...plan,contract_digest:'0'}}],
 ['no entities',{...valid,plan:{...plan,entities:[]}}],
 ['unauthorized edit',{...valid,plan:{...plan,execution_authorized:true}}],
 ['bad id',{...valid,idempotency_key:'../secrets'}],
 ['wrong format',{...valid,format:'pdf'}],
 ['unexpected root field',{...valid,override:true}],
 ['no job',{}]
] as const){
 test('rejected '+label,()=>{
  const r=cadDrawRegistrationOnly(raw);
  assert.equal(r.status,'invalid_request');
  assert.equal(r.execution_performed,false);
 });
}

test('MCP tools/list defaults to no cad_draw and opt-in exposes exactly one',async()=>{
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 const ask=async(flag:string|undefined)=>{
  const env={OWNER_ID:'owner',CAD_DRAW_ENABLED:flag};
  const invoke=async(method:string,id:number,params?:unknown)=>{
   const req=new Request('https://example.com/mcp',{method:'POST',headers,
    body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})})});
   const response=await mcp(req,env as any,'owner');
   assert.equal(response.status,200);
   return await response.json() as any;
  };
  await invoke('initialize',1,{protocolVersion:'2025-03-26',
    capabilities:{},clientInfo:{name:'cad-contract-test',version:'1'}});
  const tools=await invoke('tools/list',2);
  return tools.result.tools.map((t:any)=>t.name);
 };
 assert.equal((await ask(undefined)).includes('cad_draw'),false);
 assert.equal((await ask('false')).includes('cad_draw'),false);
 assert.equal((await ask('true')).filter((x:string)=>x==='cad_draw').length,1);
});


test('MCP tools/call remains fail-closed even when opt-in flag is true',async()=>{
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 const env={OWNER_ID:'owner',CAD_DRAW_ENABLED:'true'};
 const invoke=async(method:string,id:number,params?:unknown)=>{
  const response=await mcp(new Request('https://example.com/mcp',{method:'POST',headers,
   body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})})}),env as any,'owner');
  assert.equal(response.status,200);
  return await response.json() as any;
 };
 await invoke('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},
  clientInfo:{name:'cad-disabled-executor-test',version:'1'}});
 const call=await invoke('tools/call',2,{name:'cad_draw',arguments:valid});
 assert.equal(call.result?.content?.length,1);
 const output=JSON.parse(call.result.content[0].text);
 assert.equal(output.status,'backend_unavailable');
 assert.equal(output.execution_performed,false);
 assert.equal(output.independently_verified,false);
 assert.equal(output.customer_delivery_approved,false);
});
