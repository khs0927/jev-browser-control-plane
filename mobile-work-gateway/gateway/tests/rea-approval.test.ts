import test from 'node:test';
import assert from 'node:assert/strict';
import {relayReaTool} from '../src/rea-proxy.js';
import type {Env} from '../src/types.js';

const file='A'.repeat(28), sha='e'.repeat(64), token='T'.repeat(48);
const args={drive_file_id:file,sha256:sha,approval:true,analysis_type:'javascript-static',idempotency_key:'synthetic_test_123'};
const soon=()=>new Date(Date.now()+60*60*1000).toISOString();
function fixture():{env:Env;calls:()=>number}{
 let calls=0;
 const env={REA_BRIDGE_ENABLED:'true',REA_BRIDGE_TOKEN:token,
 REA_BRIDGE:{async fetch(req:Request){
   calls++;
   const body=await req.json() as any;
   return Response.json({jsonrpc:'2.0',id:body.id,result:{content:[{type:'text',text:'{"status":"blocked","reason":"REA_EXECUTOR_NOT_CONFIGURED"}'}],isError:true}});
 }}} as unknown as Env;
 return {env,calls:()=>calls};
}
test('user-provided approval true alone does not authorize Drive processing',async()=>{
 const f=fixture();const r=await relayReaTool(f.env,'rea_submit_drive_analysis',args);
 assert.equal(r.isError,true);assert.match(r.content[0].text,/REA_EXPLICIT_FILE_APPROVAL_REQUIRED/);assert.equal(f.calls(),0);
});
test('a different Drive file or different SHA is denied before service invocation',async()=>{
 const f=fixture();f.env.REA_APPROVED_FILE=file+':'+sha;f.env.REA_APPROVAL_EXPIRES_AT=soon();
 const r=await relayReaTool(f.env,'rea_submit_drive_analysis',{...args,sha256:'f'.repeat(64)});
 assert.equal(r.isError,true);assert.equal(f.calls(),0);
});
test('expired approval cannot trigger a task',async()=>{
 const f=fixture();f.env.REA_APPROVED_FILE=file+':'+sha;f.env.REA_APPROVAL_EXPIRES_AT=new Date(Date.now()-1000).toISOString();
 const r=await relayReaTool(f.env,'rea_submit_drive_analysis',args);
 assert.equal(r.isError,true);assert.equal(f.calls(),0);
});
test('correct exact-file short-lived approval reaches private executor but unavailable runner still blocks',async()=>{
 const f=fixture();f.env.REA_APPROVED_FILE=file+':'+sha;f.env.REA_APPROVAL_EXPIRES_AT=soon();
 const r=await relayReaTool(f.env,'rea_submit_drive_analysis',args);
 assert.equal(f.calls(),1);assert.equal(r.isError,true);assert.match(r.content[0].text,/REA_EXECUTOR_NOT_CONFIGURED/);
});
