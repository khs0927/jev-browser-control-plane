import {createRemoteJWKSet,jwtVerify} from 'jose';
import {digest,resultInput,bindRun} from './policy.js';
import {Service} from './service.js';
import type {Env,Task} from './types.js';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export async function callback(request:Request,env:Env){
 const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error('unauthorized');
 const {payload:claims}=await jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:`${env.PUBLIC_URL}/internal/results`,algorithms:['RS256'],requiredClaims:['exp','iat','repository_id','run_id','run_attempt','sha','ref','workflow_ref']});
 if(claims.repository_id!==env.REPOSITORY_ID || claims.ref!==`refs/heads/${env.REVIEWED_REF}` || claims.sha!==env.REVIEWED_SHA || claims.workflow_ref!==`${env.REPOSITORY}/.github/workflows/${env.WORKFLOW}@refs/heads/${env.REVIEWED_REF}`)throw Error('callback_identity_failed');
 const length=Number(request.headers.get('content-length')??0);if(length>16384)throw Error('payload_too_large');
 const reader=request.body?.getReader();if(!reader)throw Error('body_required');let count=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>16384){await reader.cancel();throw Error('payload_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const envelope=JSON.parse(new TextDecoder().decode(bytes));const result=resultInput.parse(envelope.result);
 if(result.run_id!==claims.run_id || String(result.run_attempt)!==claims.run_attempt || result.commit_sha!==claims.sha)throw Error('result_binding_failed');
 const task=await env.DB.prepare('SELECT * FROM tasks WHERE task_id=?').bind(envelope.request_id).first<Task>();if(!task || task.owner_id!==env.OWNER_ID || task.dispatch_state==='rejected')throw Error('unknown_request');
 const service=new Service(env,env.OWNER_ID);const run=await service.gh(`actions/runs/${result.run_id}`);bindRun(run,env,task);if(run.run_attempt!==result.run_attempt)throw Error('attempt_mismatch');
 if(task.run_id && task.run_id!==result.run_id)throw Error('run_mismatch');
 const serialized=JSON.stringify(result),hash=await digest(serialized);
 await env.DB.batch([
  env.DB.prepare('UPDATE tasks SET run_id=?,dispatch_state=? WHERE task_id=? AND (run_id IS NULL OR run_id=?)').bind(result.run_id,'registered',task.task_id,result.run_id),
  env.DB.prepare('INSERT INTO results(task_id,run_attempt,payload,digest) SELECT task_id,?,?,? FROM tasks WHERE task_id=? AND run_id=? ON CONFLICT(task_id,run_attempt) DO NOTHING').bind(result.run_attempt,serialized,hash,task.task_id,result.run_id)
 ]);
 const stored=await env.DB.prepare('SELECT digest FROM results WHERE task_id=? AND run_attempt=?').bind(task.task_id,result.run_attempt).first<{digest:string}>();if(stored?.digest!==hash)throw Error('result_conflict');return Response.json({accepted:true});
}
