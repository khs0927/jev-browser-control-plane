// Read-only adapter for a Graphify-generated, public-code-only snapshot.
// The owner OAuth boundary is implemented by worker.ts before this module is called.
// This is not Graphify's Python MCP server; no Python is executed in Cloudflare.
export type GraphNode = {id:string;label?:string;source_file?:string;source_location?:string;community?:number;[key:string]:unknown};
export type GraphEdge = {source:string;target:string;relation?:string;confidence?:string;[key:string]:unknown};
export type GraphDocument = {nodes:GraphNode[];links?:GraphEdge[];edges?:GraphEdge[];graph?:{schema_version?:number;graphify_version?:string}};
export type Manifest = {source_sha:string;graph_sha256:string;nodes:number;edges:number;graphify_version:string;code_only:boolean;backend:string};
const ORIGIN='https://raw.githubusercontent.com/khs0927/jev-browser-control-plane/graphify-snapshots/graphify-out/';
let memo:{graph:GraphDocument;manifest:Manifest;until:number}|null=null;
export class GraphifySnapshotError extends Error {}
function edges(g:GraphDocument):GraphEdge[]{return g.links??g.edges??[];}
export function nodeBrief(n:GraphNode){return {id:n.id,label:n.label??n.id,source_file:n.source_file??null,source_location:n.source_location??null,community:n.community??null};}
function validGraph(g:unknown):g is GraphDocument{
 if(!g||typeof g!=='object')return false;
 const x=g as Partial<GraphDocument>;const l=x.links??x.edges;
 return Array.isArray(x.nodes)&&x.nodes.length>0&&x.nodes.length<=10000&&Array.isArray(l)&&l.length<=50000&&
  x.nodes.every(n=>typeof n.id==='string'&&n.id.length<=300)&&
  l.every(e=>typeof e.source==='string'&&typeof e.target==='string');
}
async function checkedGet(url:string,f:(input:string,init?:RequestInit)=>Promise<Response>){
 const resp=await f(url,{method:'GET',signal:AbortSignal.timeout(12000)});
 if(!resp.ok)throw new GraphifySnapshotError('graphify_snapshot_unavailable');
 const length=Number(resp.headers.get('content-length')??0);
 if(length>2000000)throw new GraphifySnapshotError('graphify_snapshot_too_large');
 const b=new Uint8Array(await resp.arrayBuffer());
 if(b.byteLength>2000000)throw new GraphifySnapshotError('graphify_snapshot_too_large');
 return b;
}
export async function fetchVerifiedGraph(fetcher:(input:string,init?:RequestInit)=>Promise<Response>=fetch){
 if(memo&&memo.until>Date.now())return memo;
 try{
  const [raw,manifestBytes]=await Promise.all([checkedGet(ORIGIN+'graph.json',fetcher),checkedGet(ORIGIN+'manifest.json',fetcher)]);
  const hashArray=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
  const hash=Array.from(hashArray).map(x=>x.toString(16).padStart(2,'0')).join('');
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
  const graph=JSON.parse(new TextDecoder().decode(raw)) as unknown;
  if(!validGraph(graph)||manifest.graph_sha256!==hash||manifest.nodes!==graph.nodes.length||manifest.edges!==edges(graph).length||
     manifest.code_only!==true||manifest.backend!=='none'|| !/^[a-f0-9]{40}$/.test(manifest.source_sha)){
   throw new GraphifySnapshotError('graphify_snapshot_integrity_failed');
  }
  memo={graph,manifest,until:Date.now()+60000};
  return memo;
 }catch(error){
  if(error instanceof GraphifySnapshotError)throw error;
  throw new GraphifySnapshotError('graphify_snapshot_unavailable');
 }
}
export function graphifySearch(g:GraphDocument,term:string,limit:number){
 const s=term.trim().toLocaleLowerCase();
 if(s.length<2||s.length>100||limit<1||limit>20)throw new GraphifySnapshotError('invalid_graphify_query');
 const hits=g.nodes.map(n=>{
  const id=n.id.toLocaleLowerCase(),label=(n.label??'').toLocaleLowerCase(),file=(n.source_file??'').toLocaleLowerCase();
  const score=label===s||id===s?0:label.startsWith(s)||id.startsWith(s)?1:label.includes(s)||id.includes(s)?2:file.includes(s)?3:9;
  return {node:n,score};
 }).filter(x=>x.score<9).sort((a,b)=>a.score-b.score||a.node.id.localeCompare(b.node.id));
 return {query:term,total_matches:hits.length,nodes:hits.slice(0,limit).map(x=>nodeBrief(x.node))};
}
function resolve(g:GraphDocument,s:string):GraphNode{
 const term=s.trim().toLocaleLowerCase();
 if(!term||term.length>200)throw new GraphifySnapshotError('invalid_graphify_node');
 const byId=g.nodes.filter(n=>n.id.toLocaleLowerCase()===term);
 if(byId.length===1)return byId[0];
 const byLabel=g.nodes.filter(n=>(n.label??'').toLocaleLowerCase()===term);
 if(byLabel.length===1)return byLabel[0];
 if(byLabel.length>1)throw new GraphifySnapshotError('graphify_ambiguous_node_use_id');
 throw new GraphifySnapshotError('graphify_node_not_found');
}
export function graphifyPath(g:GraphDocument,start:string,end:string,maxHops:number){
 if(!Number.isInteger(maxHops)||maxHops<1||maxHops>8)throw new GraphifySnapshotError('invalid_graphify_hops');
 const a=resolve(g,start),b=resolve(g,end);
 const byId=new Map(g.nodes.map(n=>[n.id,n]));
 const adj=new Map<string,{id:string;edge:GraphEdge}[]>();
 for(const e of edges(g)){
  if(!byId.has(e.source)||!byId.has(e.target))continue;
  for(const [from,to] of [[e.source,e.target],[e.target,e.source]]){
   const arr=adj.get(from)??[];arr.push({id:to,edge:e});adj.set(from,arr);
  }
 }
 const visited=new Map<string,{prev:string|null;edge?:GraphEdge}>([[a.id,{prev:null}]]);
 const queue=[a.id];let cursor=0;
 while(cursor<queue.length&&!visited.has(b.id)){
  const id=queue[cursor++],d=(()=>{let hops=0,p=id;while(visited.get(p)?.prev){hops++;p=visited.get(p)!.prev!;}return hops;})();
  if(d>=maxHops)continue;
  for(const next of adj.get(id)??[]){
   if(!visited.has(next.id)){visited.set(next.id,{prev:id,edge:next.edge});queue.push(next.id);}
  }
 }
 if(!visited.has(b.id))return {found:false,max_hops:maxHops,from:nodeBrief(a),to:nodeBrief(b),nodes:[],edges:[]};
 const ids=[b.id];const pathEdges:GraphEdge[]=[];
 while(ids[0]!==a.id){const v=visited.get(ids[0])!;pathEdges.unshift(v.edge!);ids.unshift(v.prev!);}
 return {found:true,hops:pathEdges.length,from:nodeBrief(a),to:nodeBrief(b),
  nodes:ids.map(id=>nodeBrief(byId.get(id)!)),
  edges:pathEdges.map(e=>({source:e.source,target:e.target,relation:e.relation??'related',confidence:e.confidence??null}))};
}
