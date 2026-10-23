import assert from 'node:assert/strict';
import {mcp} from '../src/mcp.js';
import {fetchVerifiedGraph} from '../src/graphify-snapshot.js';

type ToolResult={result?:{tools?:Array<{name:string}>,content?:Array<{text?:string}>,isError?:boolean};error?:unknown};

async function request(id:number,method:string,params?:unknown):Promise<ToolResult>{
 const body=JSON.stringify({jsonrpc:'2.0',id,method,params});
 const result=await mcp(new Request('https://graphify-smoke.example/mcp',{
  method:'POST',
  headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},
  body
 }),{OWNER_ID:'130247531',GRAPHIFY_SNAPSHOT_ENABLED:'true'} as any,'130247531');
 assert.equal(result.status,200,`MCP ${method} returned HTTP ${result.status}`);
 return await result.json() as ToolResult;
}
async function call(name:string,args:Record<string,unknown>={}):Promise<any>{
 const response=await request(100+name.length,'tools/call',{name,arguments:args});
 assert.equal(response.error,undefined,`MCP tools/call ${name} JSON-RPC error`);
 const r=response.result;
 assert.ok(r?.content?.length,`Missing content for ${name}`);
 assert.equal(r.isError,undefined,`MCP tool ${name} indicated isError`);
 return JSON.parse(r.content[0].text??'null');
}
const snapshot=await fetchVerifiedGraph();
const {graph,manifest}=snapshot;
assert.equal(graph.nodes.length,manifest.nodes);
const links=graph.links??graph.edges??[];
assert.equal(links.length,manifest.edges);
assert.ok(links.length>0,'No relationships in real graph');

const list=await request(1,'tools/list');
const names=new Set(list.result?.tools?.map(t=>t.name)??[]);
for(const n of ['graphify_snapshot_status','graphify_find_nodes','graphify_shortest_path'])assert.ok(names.has(n),`Missing: ${n}`);

const status=await call('graphify_snapshot_status');
assert.equal(status.status,'verified');
assert.equal(status.sha256,manifest.graph_sha256);
assert.equal(status.nodes,manifest.nodes);
assert.equal(status.edges,manifest.edges);

const first=graph.nodes[0];
const found=await call('graphify_find_nodes',{term:first.id.slice(0,Math.min(first.id.length,15)),limit:10});
assert.ok(found.total_matches>=1);
const edge=links.find(e=>e.source!==e.target&&graph.nodes.some(n=>n.id===e.source)&&graph.nodes.some(n=>n.id===e.target));
assert.ok(edge,'No valid graph edge');
const path=await call('graphify_shortest_path',{start:edge.source,end:edge.target,max_hops:1});
assert.equal(path.found,true);
assert.equal(path.hops,1);
console.log(JSON.stringify({real_snapshot:true,mcp_tools:[...names].filter(n=>n.startsWith('graphify_')),
 graphify_version:manifest.graphify_version,source_sha:manifest.source_sha,graph_sha256:manifest.graph_sha256,
 nodes:manifest.nodes,edges:manifest.edges,find_matches:found.total_matches,path_hops:path.hops,
 result:'GRAPHIFY_MCP_TOOLSCALL_SUCCESS'}));
