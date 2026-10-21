import test from 'node:test';
import assert from 'node:assert/strict';
import {reaBridgeAvailable,relayReaTool} from '../src/rea-proxy.js';
import type {Env} from '../src/types.js';

const token='A'.repeat(48);
const disabled=()=>({REA_BRIDGE_ENABLED:'false',REA_BRIDGE_TOKEN:token,REA_BRIDGE:{fetch:async()=>Response.json({})}} as unknown as Env);
test('default-off REA tools are unavailable',()=>{
 assert.equal(reaBridgeAvailable(disabled()),false);
});
test('missing secret disables tool registration',()=>{
 assert.equal(reaBridgeAvailable({REA_BRIDGE_ENABLED:'true',REA_BRIDGE:{fetch:async()=>Response.json({})}} as unknown as Env),false);
});
test('unavailable bridge reports blocked without invoking anything',async()=>{
 const r=await relayReaTool(disabled(),'rea_bridge_status',{});
 assert.equal(r.isError,true);
 assert.match(r.content[0].text,/REA_BRIDGE_NOT_CONFIGURED/);
});
test('reject arbitrary tool names even when enabled',async()=>{
 let called=false;
 const e={REA_BRIDGE_ENABLED:'true',REA_BRIDGE_TOKEN:token,REA_BRIDGE:{async fetch(){called=true;return new Response('unused')}}} as unknown as Env;
 const r=await relayReaTool(e,'shell_exec',{command:'id'});
 assert.equal(r.isError,true);assert.equal(called,false);
});
test('relay only scoped tool call through private binding with secret',async()=>{
 let invoked=false;
 const e={REA_BRIDGE_ENABLED:'true',REA_BRIDGE_TOKEN:token,REA_BRIDGE:{async fetch(req:Request){
  invoked=true;
  assert.equal(new URL(req.url).hostname,'rea-staging.internal');
  assert.equal(req.headers.get('x-rea-bridge-token'),token);
  const msg=await req.json() as {id:string;method:string;params:{name:string;arguments:object}};
  assert.equal(msg.method,'tools/call');
  assert.equal(msg.params.name,'rea_bridge_status');
  return Response.json({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:'{"analysis_ready":false}'}]}});
 }}} as unknown as Env;
 const r=await relayReaTool(e,'rea_bridge_status',{});
 assert.equal(invoked,true);
 assert.equal(r.isError,undefined);
 assert.match(r.content[0].text,/analysis_ready/);
});
test('malformed response never reports successful execution',async()=>{
 const e={REA_BRIDGE_ENABLED:'true',REA_BRIDGE_TOKEN:token,REA_BRIDGE:{fetch:async()=>Response.json({jsonrpc:'2.0',id:'not-request-id',result:{content:[{type:'text',text:'success'}]}})}} as unknown as Env;
 const r=await relayReaTool(e,'rea_bridge_status',{});
 assert.equal(r.isError,true);
 assert.match(r.content[0].text,/INVALID_RESPONSE/);
});
