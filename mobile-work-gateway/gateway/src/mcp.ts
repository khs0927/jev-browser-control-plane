import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createInput,taskInput,artifactInput} from './policy.js';
import {Service} from './service.js';
import type {Env} from './types.js';
export async function mcp(request:Request,env:Env,owner:string){
 const service=new Service(env,owner),server=new McpServer({name:'Mobile Work Gateway',version:'0.1.0'});
 const definitions=[['system_status','Check gateway and public repository connectivity',{}],['create_task','Register the reviewed project environment workflow; reuse the same key after uncertain dispatch',createInput.shape],['get_task','Read actual run status and conclusion',taskInput.shape],['cancel_task','Request cancellation; completion must be polled',taskInput.shape],['list_artifacts','List artifacts belonging to an owner-bound run',taskInput.shape],['get_artifact','Read validated small result or provide the run download page',artifactInput.shape]] as const;
 for(const [name,description,inputSchema] of definitions)server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:!['create_task','cancel_task'].includes(name),destructiveHint:name==='cancel_task',idempotentHint:name!=='create_task',openWorldHint:true}},async(args:unknown)=>{try{const result=await (service[name] as (arg:unknown)=>Promise<unknown>).call(service,args);return {content:[{type:'text' as const,text:JSON.stringify(result)}]};}catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error && /^[a-z_0-9]+$/.test(error.message)?error.message:'request_failed'}]};}});
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
 return transport.handleRequest(request);
}
