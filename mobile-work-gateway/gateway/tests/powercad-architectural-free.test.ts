import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePowerCadArchitecturalDxf} from '../src/powercad-architectural-free.js';
import {mcp} from '../src/mcp.js';

test('CAD-free architectural geometry expands and is deterministic',async()=>{
 const input={drawing_name:'30평 테스트',entities:[
  {type:'rectangle',corner1:[0,0],corner2:[10000,8000]},
  {type:'wall',start:[0,0],end:[10000,0],thickness:200},
  {type:'window',start:[3000,8000],end:[5000,8000],frame_depth:200},
  {type:'door',hinge:[1000,0],width:900,closed_angle:0,open_angle:90},
  {type:'dimension',start:[0,0],end:[10000,0],offset:-1200},
  {type:'column',center:[5000,5000],width:400,depth:400},
  {type:'room',boundary:[[0,0],[3500,0],[3500,3500],[0,3500]],name:'거실'}
 ]};
 const a=await generatePowerCadArchitecturalDxf(input),b=await generatePowerCadArchitecturalDxf(input);
 assert.equal(a.sha256,b.sha256);
 assert.equal(a.semantic_entities,7);
 assert.equal(a.expanded_entities,19);
 assert.equal(a.entities,19);
 assert.equal(a.units,'mm');
 assert.equal(a.editable_original,false);
 assert.equal(a.associative_dimensions,false);
 assert.ok(a.dxf_text.includes('$INSUNITS\n70\n4\n'));
 assert.ok(a.dxf_text.includes('AcDbArc'));
 assert.ok(a.dxf_text.includes('\\U+AC70'));
 assert.ok(a.svg_preview.includes('거실'));
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.dxf_text));
 assert.equal(a.sha256,[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''));
});

test('reject oversized, malformed, and misleading architectural geometries',async()=>{
 for(const entities of [
   [{type:'rectangle',corner1:[0,0],corner2:[0,100]}],
   [{type:'door',hinge:[0,0],width:900,closed_angle:0,open_angle:0}],
   [{type:'wall',start:[0,0],end:[0,0],thickness:200}],
   [{type:'room',boundary:[[0,0],[1,0],[0,1]],name:'A\n0\nEOF'}],
   [{type:'polygon',center:[0,0],radius:100,sides:200}],
   [{type:'dimension',start:[0,0],end:[0,0],offset:100}],
   [{type:'line',start:[0,0],end:[1,1],output:'test.dxf'}],
   Array.from({length:60},()=>({type:'dimension',start:[0,0],end:[1000,0],offset:100}))
 ])await assert.rejects(()=>generatePowerCadArchitecturalDxf({drawing_name:'invalid',entities}));
});

test('architectural tool is only visible when the existing DXF opt-in flag is true',async()=>{
 async function names(flag?:string){
  const env={OWNER_ID:'1',POWER_CAD_FREE_DXF_ENABLED:flag};
  const response=await mcp(new Request('https://example.com/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),env as any,'1');
  assert.equal(response.status,200);
  return ((await response.json()) as any).result.tools.map((t:any)=>t.name);
 }
 assert.equal((await names()).includes('powercad_generate_architectural_dxf'),false);
 assert.equal((await names('true')).includes('powercad_generate_architectural_dxf'),true);
});
