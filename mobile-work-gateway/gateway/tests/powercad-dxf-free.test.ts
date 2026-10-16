import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePowerCadDxf,PowerCadDxfError} from '../src/powercad-dxf-free.js';
import {mcp} from '../src/mcp.js';
const demo={drawing_name:'Power-CAD 한국어 확인',entities:[
 {type:'polyline',points:[[0,0],[11000,0],[11000,9000],[0,9000]],closed:true,layer:'WALL'},
 {type:'line',start:[1000,0],end:[1000,9000],layer:'WALL'},
 {type:'circle',center:[2000,2000],radius:200,layer:'COLUMN'},
 {type:'arc',center:[3000,3000],radius:900,startAngle:0,endAngle:90,layer:'DOOR'},
 {type:'text',at:[4000,4000],text:'거실 / 주방',height:200,layer:'TEXT'},
]};
test('deterministic bounded DXF with SHA and five CAD entity types',async()=>{
 const a=await generatePowerCadDxf(demo),b=await generatePowerCadDxf(demo);
 assert.equal(a.status,'generated_cloudflare_subset');
 assert.equal(a.dxf_text,b.dxf_text);assert.equal(a.sha256,b.sha256);
 assert.equal(a.entities,5);assert.equal(a.units,'mm');
 assert.ok(a.dxf_text.includes('$INSUNITS\n70\n4\n'));
 assert.ok(a.dxf_text.includes('\\U+AC70'));
 assert.ok(a.dxf_text.includes('AcDbPolyline'));
 assert.ok(a.svg_preview.includes('거실 / 주방'));
 assert.equal(a.independently_verified,false);
 assert.equal(a.customer_delivery_approved,false);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.dxf_text));
 assert.equal(a.sha256,[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''));
});
for(const bad of [null,{}, {drawing_name:'x',entities:[]},
 {drawing_name:'x',entities:[{type:'line',start:[0,0],end:[Infinity,1]}]},
 {drawing_name:'x',entities:[{type:'line',start:[0,0],end:[1,1],output:'/tmp/private.dxf'}]},
 {drawing_name:'x',entities:[{type:'text',at:[0,0],text:'evil\n0\nEOF',height:2}]},
 {drawing_name:'x',entities:[{type:'circle',center:[0,0],radius:-1}]},
 {drawing_name:'x',entities:[{type:'mesh',points:[[0,0]]}]},
 {drawing_name:'x',entities:Array.from({length:121},()=>({type:'line',start:[0,0],end:[1,1]}))}]){
 test('reject invalid shape '+JSON.stringify(bad)?.slice(0,70),async()=>{await assert.rejects(()=>generatePowerCadDxf(bad),PowerCadDxfError);});
}
test('SVG escapes text markup',async()=>{
 const r=await generatePowerCadDxf({drawing_name:'<unsafe>',entities:[{type:'text',at:[0,0],text:'<script>&',height:200}]});
 assert.ok(!r.svg_preview.includes('<script>'));assert.ok(r.svg_preview.includes('&lt;script&gt;'));
});
test('flag off hides Power-CAD tool; flag on exposes it to the OAuth owner',async()=>{
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 async function names(flag?:string){
  const env={OWNER_ID:'1',POWER_CAD_FREE_DXF_ENABLED:flag};
  const mk=(id:number,method:string,params?:object)=>new Request('https://example.com/mcp',{method:'POST',headers,
   body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  const init=await mcp(mk(1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'powercad-test',version:'1'}}),env as any,'1');
  assert.equal(init.status,200);
  const response=await mcp(mk(2,'tools/list'),env as any,'1');
  assert.equal(response.status,200);return ((await response.json()) as any).result.tools.map((x:any)=>x.name);
 }
 assert.equal((await names()).includes('powercad_generate_dxf'),false);
 assert.equal((await names('true')).filter((n:string)=>n==='powercad_generate_dxf').length,1);
});
