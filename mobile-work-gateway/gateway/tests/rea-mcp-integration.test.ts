import test from 'node:test';
import assert from 'node:assert/strict';
import {mcp} from '../src/mcp.js';
import type {Env} from '../src/types.js';

const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
const post=async(env:Env,id:number,method:string,params?:unknown)=>{
 const response=await mcp(new Request('https://example.test/mcp',{method:'POST',headers,
  body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})})}),env,'owner-id');
 assert.equal(response.status,200);
 return response.json() as Promise<any>;
};
const token='T'.repeat(48);
function mockEnv():Env {
 return {OWNER_ID:'owner-id',REA_BRIDGE_ENABLED:'true',REA_BRIDGE_TOKEN:token,REA_BRIDGE:{
  async fetch(req:Request){
   assert.equal(req.headers.get('x-rea-bridge-token'),token);
   assert.equal(new URL(req.url).hostname,'rea-staging.internal');
   const b=await req.json() as any;
   return Response.json({jsonrpc:'2.0',id:b.id,result:{content:[{type:'text',text:JSON.stringify({analysis_ready:false,reason:'REA_EXECUTOR_NOT_CONFIGURED'})}],isError:false}});
  }
 }} as unknown as Env;
}
test('OAuth scoped MCP integration exposes exactly three REA tools when service binding enabled',async()=>{
 const env=mockEnv();
 const init=await post(env,1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'integration-fixture',version:'1'}});
 assert.equal(init.result.serverInfo.name,'Mobile Work Gateway');
 const list=await post(env,2,'tools/list');
 const names=list.result.tools.map((x:any)=>x.name);
 assert.equal(names.filter((x:string)=>x.startsWith('rea_')).length,3);
 for(const name of ['rea_bridge_status','rea_submit_drive_analysis','rea_get_analysis_status'])assert.ok(names.includes(name));
 const status=await post(env,3,'tools/call',{name:'rea_bridge_status',arguments:{}});
 assert.equal(status.result.isError,false);
 assert.match(status.result.content[0].text,/REA_EXECUTOR_NOT_CONFIGURED/);
 assert.ok(!JSON.stringify(status).includes(token));
});
test('REA MCP tools are absent when enable flag is false despite binding and token',async()=>{
 const env=mockEnv();env.REA_BRIDGE_ENABLED='false';
 const list=await post(env,1,'tools/list');
 assert.equal(list.result.tools.filter((x:any)=>x.name.startsWith('rea_')).length,0);
});
test('REA MCP tools are absent without secret even if binding and flag exist',async()=>{
 const env=mockEnv();env.REA_BRIDGE_TOKEN=undefined;
 const list=await post(env,1,'tools/list');
 assert.equal(list.result.tools.filter((x:any)=>x.name.startsWith('rea_')).length,0);
});
