import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createShape,taskInput,artifactInput} from './policy.js';
import {Service} from './service.js';
import {BrowserTools,readShape,actShape,profileShape} from './browser.js';
import type {Env} from './types.js';
import {generatePowerCadDxf} from './powercad-dxf-free.js';
import {z} from 'zod';
import {fetchVerifiedGraph,graphifySearch,graphifyPath,GraphifySnapshotError} from './graphify-snapshot.js';
import {reaBridgeAvailable,relayReaTool} from './rea-proxy.js';
import {reserveDraft,sha256,type DraftRequest} from './orch-ledger.js';
export async function mcp(request:Request,env:Env,owner:string){
 const service=new Service(env,owner),server=new McpServer({name:'Mobile Work Gateway',version:'0.2.0'});
 const definitions=[['system_status','Check gateway and public repository connectivity',{}],['create_task','Run an allowlisted task (environment_check, gateway_tests, browser_check with parameters.url) on the reviewed workflow; reuse the same key after uncertain dispatch',createShape],['inspect_repository','Read pinned repository head and recent workflow runs without starting GitHub Actions',{}],['get_task','Read actual run status and conclusion',taskInput.shape],['cancel_task','Request cancellation; completion must be polled',taskInput.shape],['list_artifacts','List artifacts belonging to an owner-bound run',taskInput.shape],['get_artifact','Read validated small result or provide the run download page',artifactInput.shape]] as const;
 for(const [name,description,inputSchema] of definitions)server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!['create_task','cancel_task'].includes(name),destructiveHint:name==='cancel_task',idempotentHint:name!=='create_task',openWorldHint:true}},async(args:unknown)=>{try{const result=await (service[name] as (arg:unknown)=>Promise<unknown>).call(service,args);return {content:[{type:'text' as const,text:JSON.stringify(result)}]};}catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error && /^[a-z_0-9]+$/.test(error.message)?error.message:'request_failed'}]};}});
 const browser=new BrowserTools(env,owner);
 const browserDefs=[
  ['browser_read','Open a public web page in a Cloudflare cloud browser (optionally with a saved login profile) and return title, final URL, page text and an optional screenshot.',readShape,true],
  ['browser_act','Open a page and run up to 15 steps (click, fill, press, select, wait, wait_for, goto). Use profile to start logged in; save_profile stores updated login cookies. Confirm with the user before submitting forms, sending messages, purchasing or deleting.',actShape,false],
  ['browser_profiles','List saved login profiles, or show the sites and cookie counts in one profile (never values).',profileShape,true],
 ] as const;
 for(const [name,description,inputSchema,ro] of browserDefs)server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:ro,destructiveHint:!ro,idempotentHint:ro,openWorldHint:true}},async(args:unknown)=>{try{const r:any=await (browser[name] as (a:unknown)=>Promise<any>).call(browser,args);if(name==='browser_profiles')return {content:[{type:'text' as const,text:JSON.stringify(r)}]};const content:any[]=[{type:'text',text:JSON.stringify(r.result)}];if(r.image)content.push({type:'image',data:r.image,mimeType:'image/jpeg'});return {content};}catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error && /^[a-z_0-9]+$/.test(error.message)?error.message:'browser_failed'}]};}});
 // Explicit opt-in: owner OAuth already enforced by worker.ts; no original-file writes or file hosting.
 if(env.POWER_CAD_FREE_DXF_ENABLED==='true'){
  // Homogeneous array JSON Schema is accepted by MCP clients that reject positional tuple items.
  // The generator independently enforces exactly two bounded finite coordinates.
  const xy=z.array(z.number().finite().min(-1000000).max(1000000)).length(2);
  const layer=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/).optional();
  const shapes=z.discriminatedUnion('type',[
   z.object({type:z.literal('line'),layer,start:xy,end:xy}).strict(),
   z.object({type:z.literal('polyline'),layer,points:z.array(xy).min(2).max(64),closed:z.boolean().optional()}).strict(),
   z.object({type:z.literal('circle'),layer,center:xy,radius:z.number().positive().max(100000)}).strict(),
   z.object({type:z.literal('arc'),layer,center:xy,radius:z.number().positive().max(100000),
    startAngle:z.number().min(0).max(360),endAngle:z.number().min(0).max(360)}).strict(),
   z.object({type:z.literal('text'),layer,at:xy,text:z.string().min(1).max(100),height:z.number().positive().max(10000)}).strict(),
  ]);
  server.registerTool('powercad_generate_dxf',{
    description:'Power-CAD free mobile subset: generate a NEW 2D DXF and SVG preview from bounded millimetre geometry (line, polyline, circle, arc, text). Not DWG, no AutoCAD/native backend, no original file editing. Client must save returned dxf_text; independently reopen before any professional use.',
    inputSchema:{drawing_name:z.string().min(1).max(80),entities:z.array(shapes).min(1).max(120)},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async(args:unknown)=>{try{const d=await generatePowerCadDxf(args);
    return {content:[{type:'text' as const,text:JSON.stringify(d)}]};}
    catch{return {isError:true,content:[{type:'text' as const,text:'invalid_powercad_dxf_request'}]};}
  });
 }
 // Explicit opt-in: universal orchestrator ledger (reservation only, never executes). Requires a separate ORCH_DB binding with the reviewed schema applied.
 if(env.ORCH_LEDGER_ENABLED==='true'&&env.ORCH_DB){
  const db=env.ORCH_DB;
  server.registerTool('orch_reserve_task',{
    description:'Reserve an owner-scoped, dry-run orchestrator task by idempotency key. Never dispatches or executes; write actions return status REVIEW and need separate human approval.',
    inputSchema:{request:z.record(z.string(),z.unknown())},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async(args:any)=>{try{const ownerHash=await sha256('github-owner:'+owner);const r=await reserveDraft(db,ownerHash,args.request as DraftRequest);
    return {content:[{type:'text' as const,text:JSON.stringify(r)}]};}
    catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error && /^[a-z_0-9]+$/.test(error.message)?error.message:'orch_request_failed'}]};}
  });
 }

 // Owner OAuth is enforced in worker.ts. This integration stays invisible
 // unless the bridge binding AND its secret AND the opt-in flag are configured.
 if(reaBridgeAvailable(env)){
  server.registerTool('rea_bridge_status',{
   description:'Check whether the optional private REA analysis runner is actually available; does not execute analysis.',
   inputSchema:{},
   annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  },async(args:unknown)=>relayReaTool(env,'rea_bridge_status',args));
  const fileId=z.string().regex(/^[A-Za-z0-9_-]{20,128}$/);
  const digest=z.string().regex(/^[0-9a-fA-F]{64}$/);
  server.registerTool('rea_submit_drive_analysis',{
   description:'Submit a single owner-approved private Google Drive JavaScript artifact for static REA analysis; returns blocked if executor is offline. Original files are not modified.',
   inputSchema:{drive_file_id:fileId,sha256:digest,approval:z.literal(true),analysis_type:z.literal('javascript-static'),idempotency_key:z.string().regex(/^[A-Za-z0-9_-]{12,100}$/)},
   annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  },async(args:unknown)=>relayReaTool(env,'rea_submit_drive_analysis',args));
  server.registerTool('rea_get_analysis_status',{
   description:'Read owner-approved REA run status without mutating artifacts.',
   inputSchema:{run_id:z.string().regex(/^[a-fA-F0-9-]{16,64}$/)},
   annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  },async(args:unknown)=>relayReaTool(env,'rea_get_analysis_status',args));
 }

 // Owner-only, read-only Graphify graph adapter; served data is the verified,
 // public-code-only snapshot built in GitHub Actions, not the native Python MCP.
 if(env.GRAPHIFY_SNAPSHOT_ENABLED==='true'){
  const send=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
  const fail=(error:unknown)=>({isError:true,content:[{type:'text' as const,text:error instanceof GraphifySnapshotError?error.message:'graphify_query_failed'}]});
  server.registerTool('graphify_snapshot_status',{
   description:'Read the provenance, SHA-256 and graph counts of the owner-verified Graphify public gateway code snapshot. This is a lightweight read-only adapter, not Graphify Python MCP.',
   inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async()=>{try{const {manifest,graph}=await fetchVerifiedGraph();return send({status:'verified',adapter:'graphify_codegraph_snapshot',source_sha:manifest.source_sha,sha256:manifest.graph_sha256,graphify_version:manifest.graphify_version,nodes:graph.nodes.length,edges:(graph.links??graph.edges??[]).length});}catch(e){return fail(e);}});
  server.registerTool('graphify_find_nodes',{
   description:'Search the verified Graphify public gateway code graph for a code symbol, module, or file. Read-only; enter at least 2 characters. Does not read private repositories.',
   inputSchema:{term:z.string().trim().min(2).max(100),limit:z.number().int().min(1).max(20).optional()},
   annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async(args:{term:string;limit?:number})=>{try{const {graph,manifest}=await fetchVerifiedGraph();return send({...graphifySearch(graph,args.term,args.limit??10),source_sha:manifest.source_sha});}catch(e){return fail(e);}});
  server.registerTool('graphify_shortest_path',{
   description:'Find a bounded shortest relationship path between two unique Graphify code nodes. Prefer exact node IDs returned by graphify_find_nodes. Public gateway code graph only.',
   inputSchema:{start:z.string().trim().min(1).max(200),end:z.string().trim().min(1).max(200),max_hops:z.number().int().min(1).max(8).optional()},
   annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async(args:{start:string;end:string;max_hops?:number})=>{try{const {graph,manifest}=await fetchVerifiedGraph();return send({...graphifyPath(graph,args.start,args.end,args.max_hops??6),source_sha:manifest.source_sha});}catch(e){return fail(e);}});
 }
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
 return transport.handleRequest(request);
}
