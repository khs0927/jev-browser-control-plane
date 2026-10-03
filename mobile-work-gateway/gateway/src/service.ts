import {createInput,taskInput,artifactInput,resultInput,digest,bindRun} from './policy.js';
import type {Env,Task} from './types.js';
export class Service {
 constructor(readonly env:Env,readonly owner:string,readonly request:typeof fetch=fetch){if(owner!==env.OWNER_ID)throw Error('forbidden');}
 async gh(path:string,method='GET',body?:unknown):Promise<any>{
  const response=await this.request(`https://api.github.com/repos/${this.env.REPOSITORY}/${path}`,{method,headers:{Authorization:`Bearer ${this.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'MobileWorkGateway','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(!response.ok)throw Error(`github_${response.status}`);const text=await response.text();return text?JSON.parse(text):null;
 }
 async task(id:string){taskInput.parse({task_id:id});const task=await this.env.DB.prepare('SELECT * FROM tasks WHERE task_id=? AND owner_id=?').bind(id,this.owner).first<Task>();if(!task)throw Error('task_not_found');return task;}
 async run(task:Task){
  if(!task.run_id){
   const runs=await this.gh(`actions/workflows/${this.env.WORKFLOW}/runs?event=workflow_dispatch&per_page=100`);
   const matches=runs.workflow_runs.filter((r:any)=>r.display_title===`mobile-work:${task.task_id}`);
   if(matches.length!==1)return null;
   bindRun(matches[0],this.env,task);task.run_id=String(matches[0].id);
   await this.env.DB.prepare('UPDATE tasks SET run_id=?,dispatch_state=? WHERE task_id=? AND run_id IS NULL').bind(task.run_id,'registered',task.task_id).run();
  }
  const run=await this.gh(`actions/runs/${task.run_id}`);bindRun(run,this.env,task);return run;
 }
 async system_status(){let github='unavailable';try{const repo=await this.gh('');github=repo.visibility==='public'?'ok':'private_repository';}catch{}return {gateway:'ok',version:'0.1.0',authentication:'ok',github_connection:github,supported_tasks:['environment_check']};}
 async create_task(raw:unknown){
  const input=createInput.parse(raw);if(input.ref!==this.env.REVIEWED_REF || !/^[a-f0-9]{40}$/.test(this.env.REVIEWED_SHA))throw Error('unreviewed_ref');
  const hash=await digest(JSON.stringify({type:input.task_type,ref:input.ref,sha:this.env.REVIEWED_SHA}));const id=crypto.randomUUID();
  await this.env.DB.prepare('INSERT INTO tasks(task_id,owner_id,request_key,digest,task_type,ref,sha,dispatch_state,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,request_key) DO NOTHING').bind(id,this.owner,input.idempotency_key,hash,input.task_type,input.ref,this.env.REVIEWED_SHA,'reserved',Date.now()).run();
  const task=await this.env.DB.prepare('SELECT * FROM tasks WHERE owner_id=? AND request_key=?').bind(this.owner,input.idempotency_key).first<Task>();if(!task || task.digest!==hash)throw Error('idempotency_conflict');
  if(task.task_id!==id)return this.get_task({task_id:task.task_id});
  try{
   const head=await this.gh(`commits/${encodeURIComponent(input.ref)}`);if(head.sha!==task.sha)throw Error('ref_changed');
   const repo=await this.gh('');if(String(repo.id)!==this.env.REPOSITORY_ID || repo.visibility!=='public')throw Error('public_repository_required');
  }catch(error){await this.env.DB.prepare('UPDATE tasks SET dispatch_state=? WHERE task_id=?').bind('rejected',id).run();throw error;}
  await this.env.DB.prepare('UPDATE tasks SET dispatch_state=? WHERE task_id=?').bind('dispatch_unknown',id).run();
  try{
   const detail=await this.gh(`actions/workflows/${this.env.WORKFLOW}/dispatches`,'POST',{ref:input.ref,inputs:{request_id:id},return_run_details:true});
   const runId=detail?.workflow_run_id??detail?.id;
   if(!runId || !/^[0-9]+$/.test(String(runId)))return {task_id:id,status:'dispatch_unknown',conclusion:null};
   const run=await this.gh(`actions/runs/${runId}`);bindRun(run,this.env,task);
   await this.env.DB.prepare('UPDATE tasks SET run_id=?,dispatch_state=? WHERE task_id=?').bind(String(runId),'registered',id).run();
  }catch{return {task_id:id,status:'dispatch_unknown',conclusion:null,summary:'Dispatch response uncertain; query this task; do not submit a new key.'};}
  return this.get_task({task_id:id});
 }
 async get_task(raw:unknown){const {task_id}=taskInput.parse(raw);const task=await this.task(task_id);const run=await this.run(task);return {task_id,run_id:task.run_id,status:run?.status??task.dispatch_state,conclusion:run?.conclusion??null,commit_sha:task.sha,run_url:run?.html_url??null};}
 async cancel_task(raw:unknown){const {task_id}=taskInput.parse(raw);const task=await this.task(task_id);const run=await this.run(task);if(!run)return {task_id,cancel_requested:false,cancellation_confirmed:false,status:task.dispatch_state};if(run.status==='completed')return {task_id,cancel_requested:false,cancellation_confirmed:run.conclusion==='cancelled',status:run.status,conclusion:run.conclusion};await this.gh(`actions/runs/${task.run_id}/cancel`,'POST');return {task_id,cancel_requested:true,cancellation_confirmed:false};}
 async list_artifacts(raw:unknown){const {task_id}=taskInput.parse(raw);const task=await this.task(task_id);const run=await this.run(task);if(!run)return {task_id,status:task.dispatch_state,artifacts:[]};const list=await this.gh(`actions/runs/${task.run_id}/artifacts?per_page=100`);return {task_id,status:run.status,artifacts:list.artifacts.map((a:any)=>({artifact_id:String(a.id),name:a.name,size_bytes:a.size_in_bytes,expired:a.expired}))};}
 async get_artifact(raw:unknown){const {task_id,artifact_id,mode}=artifactInput.parse(raw);const task=await this.task(task_id);const run=await this.run(task);if(!run)throw Error('run_not_bound');const info=await this.gh(`actions/artifacts/${artifact_id}`);if(String(info.workflow_run?.id)!==task.run_id || info.name!=='mobile-work-environment-results' || info.expired)throw Error('artifact_not_available');
  if(mode==='download')return {task_id,artifact_id,run_url:run.html_url,summary:'Open the run and download its artifact while signed in to GitHub.'};
  const result=await this.env.DB.prepare('SELECT payload FROM results WHERE task_id=? AND run_attempt=?').bind(task_id,run.run_attempt).first<{payload:string}>();
  if(!result)return {task_id,artifact_id,result_ready:false,summary:'Result callback has not been received.'};
  return {task_id,artifact_id,result_ready:true,result:resultInput.parse(JSON.parse(result.payload)),status:run.status,conclusion:run.conclusion};
 }
}
