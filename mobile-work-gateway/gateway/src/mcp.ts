import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createShape,taskInput,artifactInput} from './policy.js';
import {Service} from './service.js';
import {BrowserTools,readShape,actShape,profileShape} from './browser.js';
import {z} from 'zod';
import {createCadFixture} from './cad-fixture.js';
import type {Env} from './types.js';
export async function mcp(request:Request,env:Env,owner:string){
 const service=new Service(env,owner),server=new McpServer({name:'Mobile Work Gateway',version:'0.2.0'});
 const definitions=[['system_status','Check gateway and public repository connectivity',{}],['create_task','Run an allowlisted task (environment_check, gateway_tests, browser_check with parameters.url) on the reviewed workflow; reuse the same key after uncertain dispatch',createShape],['get_task','Read actual run status and conclusion',taskInput.shape],['cancel_task','Request cancellation; completion must be polled',taskInput.shape],['list_artifacts','List artifacts belonging to an owner-bound run',taskInput.shape],['get_artifact','Read validated small result or provide the run download page',artifactInput.shape]] as const;
 for(const [name,description,inputSchema] of definitions)server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!['create_task','cancel_task'].includes(name),destructiveHint:name==='cancel_task',idempotentHint:name!=='create_task',openWorldHint:true}},async(args:unknown)=>{try{const result=await (service[name] as (arg:unknown)=>Promise<unknown>).call(service,args);return {content:[{type:'text' as const,text:JSON.stringify(result)}]};}catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error && /^[a-z_0-9]+$/.test(error.message)?error.message:'request_failed'}]};}});
 const browser=new BrowserTools(env,owner);
 const browserDefs=[
  ['browser_read','Open a public web page in a Cloudflare cloud browser (optionally with a saved login profile) and return title, final URL, page text and an optional screenshot.',readShape,true],
  ['browser_act','Open a page and run up to 15 steps (click, fill, press, select, wait, wait_for, goto). Use profile to start logged in; save_profile stores updated login cookies. Confirm with the user before submitting forms, sending messages, purchasing or deleting.',actShape,false],
  ['browser_profiles','List saved login profiles, or show the sites and cookie counts in one profile (never values).',profileShape,true],
 ] as const;
 for(const [name,description,inputSchema,ro] of browserDefs)server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:ro,destructiveHint:!ro,idempotentHint:ro,openWorldHint:true}},async(args:unknown)=>{try{const r:any=await (browser[name] as (a:unknown)=>Promise<any>).call(browser,args);if(name==='browser_profiles')return {content:[{type:'text' as const,text:JSON.stringify(r)}]};const content:any[]=[{type:'text',text:JSON.stringify(r.result)}];if(r.image)content.push({type:'image',data:r.image,mimeType:'image/jpeg'});return {content};}catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error && /^[a-z_0-9]+$/.test(error.message)?error.message:'browser_failed'}]};}});
 // Opt-in synthetic DXF canary: authenticated owner only, no native CAD or original file writes.
 if(env.CAD_FIXTURE_ENABLED==='true')server.registerTool('cad_fixture_dxf',{
  description:'Create a bounded synthetic DXF fixture, not a production Power-CAD drawing. Returns DXF text and SHA-256; independent DXF verification is NOT implied.',
  inputSchema:{template:z.enum(['rectangle','korean-label']),
   width_mm:z.number().int().min(100).max(20000).optional(),
   height_mm:z.number().int().min(100).max(20000).optional()},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async args=>{try{const result=await createCadFixture(args);return {content:[{type:'text' as const,text:JSON.stringify(result)}]};}
 catch{return {isError:true,content:[{type:'text' as const,text:'invalid_fixture_request'}]};}});
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
 return transport.handleRequest(request);
}
