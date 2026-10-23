import test from 'node:test';
import assert from 'node:assert/strict';
import {graphifySearch,graphifyPath,GraphifySnapshotError,type GraphDocument} from '../src/graphify-snapshot.js';
import {mcp} from '../src/mcp.js';
const graph:GraphDocument={nodes:[
 {id:'a',label:'Gateway',source_file:'src/worker.ts',source_location:'L10',community:0},
 {id:'b',label:'Router',source_file:'src/mcp.ts',source_location:'L15',community:0},
 {id:'c',label:'Store',source_file:'src/service.ts',source_location:'L5',community:1},
 {id:'d',label:'Router',source_file:'src/sub/mcp.ts',community:2},
],links:[
 {source:'a',target:'b',relation:'calls',confidence:'EXTRACTED'},
 {source:'b',target:'c',relation:'imports',confidence:'INFERRED'},
]};
test('Graphify search ranks name and matches source path with bounded output',()=>{
 const a=graphifySearch(graph,'Gate',10);
 assert.equal(a.nodes[0].id,'a');
 const b=graphifySearch(graph,'service.ts',10);
 assert.equal(b.nodes[0].id,'c');
 assert.throws(()=>graphifySearch(graph,'a',10),GraphifySnapshotError);
 assert.throws(()=>graphifySearch(graph,'x',21),GraphifySnapshotError);
});
test('Graphify shortest path follows labelled edges; ambiguous labels are refused',()=>{
 const path=graphifyPath(graph,'Gateway','Store',6);
 assert.equal(path.found,true);
 if(path.found){assert.equal(path.hops,2);assert.deepEqual(path.nodes.map(x=>x.id),['a','b','c']);assert.equal(path.edges[0].confidence,'EXTRACTED');}
 assert.throws(()=>graphifyPath(graph,'Router','Store',6),/ambiguous/);
 assert.equal(graphifyPath(graph,'c','d',1).found,false);
 assert.throws(()=>graphifyPath(graph,'a','c',9),GraphifySnapshotError);
});
test('Graphify owner MCP tools are feature gated; schemas remain connector compatible',async()=>{
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 const names=async(flag?:string)=>{
  const req=new Request('https://example.com/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/list'})});
  const resp=await mcp(req,{OWNER_ID:'1',GRAPHIFY_SNAPSHOT_ENABLED:flag} as any,'1');
  assert.equal(resp.status,200);
  return ((await resp.json()) as any).result.tools.map((x:any)=>x.name) as string[];
 };
 const hidden=await names();
 for(const n of ['graphify_snapshot_status','graphify_find_nodes','graphify_shortest_path'])assert.ok(!hidden.includes(n));
 const shown=await names('true');
 for(const n of ['graphify_snapshot_status','graphify_find_nodes','graphify_shortest_path'])assert.equal(shown.filter(x=>x===n).length,1);
});
