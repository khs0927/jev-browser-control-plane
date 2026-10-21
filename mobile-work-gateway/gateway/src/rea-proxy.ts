import type {Env} from './types.js';

type ReaToolResult = {content:{type:'text';text:string}[];isError?:boolean};
const fail=(reason:string):ReaToolResult=>({isError:true,content:[{type:'text',text:JSON.stringify({status:'blocked',reason})}]});

export function reaBridgeAvailable(env:Env):boolean {
 return env.REA_BRIDGE_ENABLED==='true' && typeof env.REA_BRIDGE?.fetch==='function'
   && typeof env.REA_BRIDGE_TOKEN==='string' && env.REA_BRIDGE_TOKEN.length>=32;
}

/** An owner is already authenticated by worker.ts before this tool is called.
 * The private service binding accepts ONLY the allowlisted tool name and scoped parameters.
 * Never forwards caller-controlled URLs, commands, bearer credentials or paths.
 */
export async function relayReaTool(env:Env,name:string,args:unknown):Promise<ReaToolResult> {
 if(!reaBridgeAvailable(env))return fail('REA_BRIDGE_NOT_CONFIGURED');
 if(!['rea_bridge_status','rea_submit_drive_analysis','rea_get_analysis_status'].includes(name))return fail('REA_TOOL_NOT_ALLOWED');
 try {
  const id=crypto.randomUUID();
  const response=await env.REA_BRIDGE!.fetch(new Request('https://rea-staging.internal/mcp',{
   method:'POST',
   headers:{'content-type':'application/json','x-rea-bridge-token':env.REA_BRIDGE_TOKEN!},
   body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})
  }));
  if(!response.ok)return fail('REA_BRIDGE_HTTP_'+response.status);
  const raw=await response.text();
  if(raw.length>1024*128)return fail('REA_RESPONSE_TOO_LARGE');
  const msg=JSON.parse(raw) as {id?:string;error?:{code:number;message:string};result?:ReaToolResult};
  if(msg.id!==id||msg.error||!msg.result||!Array.isArray(msg.result.content))return fail('REA_BRIDGE_INVALID_RESPONSE');
  const safe=msg.result.content.filter(x=>x&&x.type==='text'&&typeof x.text==='string')
    .map(x=>({type:'text' as const,text:x.text.slice(0,100*1024)}));
  return {content:safe.length?safe:[{type:'text',text:'REA_EMPTY_RESPONSE'}],isError:msg.result.isError||safe.length===0};
 }catch{return fail('REA_BRIDGE_UNAVAILABLE')}
}
