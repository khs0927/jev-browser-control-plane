import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadFixture,FixtureError} from '../src/cad-fixture.js';
import {mcp} from '../src/mcp.js';

test('deterministic synthetic DXF rectangle hash', async()=>{
 const input={template:'rectangle',width_mm:6000,height_mm:4000};
 const a=await createCadFixture(input);
 const b=await createCadFixture(input);
 assert.equal(a.status,'fixture_only');
 assert.equal(a.dxf_text,b.dxf_text);
 assert.equal(a.sha256,b.sha256);
 assert.equal(a.entities,4);
 assert.equal(a.independently_verified,false);
 assert.equal(a.customer_delivery_approved,false);
 assert.ok(a.dxf_text.includes('$INSUNITS\n70\n4\n'));
 assert.ok(a.dxf_text.endsWith('0\nEOF\n'));
 assert.equal((a.dxf_text.match(/\nLINE\n/g)||[]).length,4);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.dxf_text));
 assert.equal(a.sha256,[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join(''));
});
test('Unicode fixture and size bound',async()=>{
 const a=await createCadFixture({template:'korean-label'});
 assert.equal(a.entities,5);
 assert.ok(a.dxf_text.includes('한글 검증'));
 assert.ok(a.bytes<8192);
});
for(const bad of [null,{}, {template:'evil'},{template:'rectangle',width_mm:0},
 {template:'rectangle',width_mm:20001},{template:'rectangle',height_mm:NaN},
 {template:'rectangle',width_mm:2.2},{template:'rectangle',extra:true},
 {template:'rectangle',entities:[]}]){
 test('rejects unsupported input '+JSON.stringify(bad),async()=>{
  await assert.rejects(()=>createCadFixture(bad),FixtureError);
 });
}
test('MCP canary opt-in changes tool list only when enabled',async()=>{
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 const list=async(flag?:string)=>{
  const env={OWNER_ID:'1',CAD_FIXTURE_ENABLED:flag};
  const init=await mcp(new Request('https://example.com/mcp',{method:'POST',headers,
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{
    protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'canary-test',version:'1'}
   }})}),env as any,'1');
  assert.equal(init.status,200);
  const r=await mcp(new Request('https://example.com/mcp',{method:'POST',headers,
   body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/list'})}),env as any,'1');
  assert.equal(r.status,200);return (await r.json() as any).result.tools.map((t:any)=>t.name);
 };
 assert.equal((await list()).includes('cad_fixture_dxf'),false);
 assert.equal((await list('true')).filter(n=>n==='cad_fixture_dxf').length,1);
});
