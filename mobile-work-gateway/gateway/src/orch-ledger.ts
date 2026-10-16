/** JEV universal orchestrator: isolated, preview-only D1 reservation.
 * Never called by the production Worker; integration requires owner OAuth and a reviewed deployment.
 * No external dispatch, approval, email, or payment is performed here.
 */
export type DraftRequest = {
  schema_version: 'jev.orch.task/1'; task_id: string; idempotency_key: string;
  target: string; action: string; dry_run: true;
  intent?: string; approval?: {status: 'PENDING'|'APPROVED'|'DENIED'};
  budget?: {max_paid_amount: 0; currency: 'USD'};
};
export type DraftReceipt = {
  task_id: string; idempotency_key: string; request_sha256: string;
  status: 'VALIDATED'|'REVIEW'; existing: boolean; execution_performed: false;
};
type Row = {task_id:string;request_sha256:string;status:'VALIDATED'|'REVIEW';idempotency_key:string};
function canonical(input:unknown):string {
  if(input===null||typeof input==='string'||typeof input==='boolean') return JSON.stringify(input);
  if(typeof input==='number'&&Number.isFinite(input))return JSON.stringify(input);
  if(Array.isArray(input))return '['+input.map(canonical).join(',')+']';
  if(typeof input==='object'&&input!==null){
    const obj=input as Record<string,unknown>;
    return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';
  }
  throw new Error('invalid_serializable_value');
}
export async function sha256(input:string):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
const idOK=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(v);
const objectFields=(v:unknown, fields:readonly string[])=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>fields.includes(k));
const permitted:Record<string,readonly string[]>={
 github:['repo.inspect','pull_request.inspect','workflow.status','workflow.dispatch','branch.write','merge'],
 cloudflare:['worker.status','worker.deploy'],powercad:['draw.plan','dxf.generate','dwg.execute'],
 google_drive:['file.read','file.write'],naver:['mail.search','mail.send'],
 make:['credits.read','scenario.run'],n8n:['health.read','workflow.test','workflow.publish']};
const writes=new Set(['workflow.dispatch','branch.write','merge','worker.deploy','dxf.generate','dwg.execute','file.write','mail.send','scenario.run','workflow.test','workflow.publish']);
/** D1 unique(owner_subject_hash, idempotency_key) guarantees at-most-one reservation.
 * Reservation does NOT authorize execution. Caller must derive owner hash from trusted OAuth context.
 */
export async function reserveDraft(db:D1Database,ownerSubjectHash:string,request:DraftRequest,now=new Date()):Promise<DraftReceipt> {
  if(!/^[0-9a-f]{64}$/.test(ownerSubjectHash))throw new Error('invalid_owner_hash');
  if(!objectFields(request,['schema_version','task_id','idempotency_key','target','action','dry_run','intent','approval','budget'])||request.schema_version!=='jev.orch.task/1'||!idOK(request.task_id)||!idOK(request.idempotency_key)||request.dry_run!==true)throw new Error('invalid_draft_request');
  if('intent' in request && (typeof request.intent!=='string'||request.intent.length>350))throw new Error('invalid_intent');
  if('approval' in request && (!objectFields(request.approval,['status'])||!['PENDING','APPROVED','DENIED'].includes(request.approval!.status)))throw new Error('invalid_approval');
  if('budget' in request && (!objectFields(request.budget,['max_paid_amount','currency'])||request.budget!.max_paid_amount!==0||request.budget!.currency!=='USD'))throw new Error('budget_not_zero');
  if(!Object.prototype.hasOwnProperty.call(permitted,request.target)||!permitted[request.target].includes(request.action))throw new Error('action_not_allowlisted');
  if(request.approval?.status==='DENIED')throw new Error('approval_denied');
  const payload=canonical(request);
  if(payload.length>4096)throw new Error('request_too_large');
  const hash=await sha256(payload);
  const status=writes.has(request.action)?'REVIEW':'VALIDATED';
  const timestamp=now.toISOString();
  const result=await db.prepare(`INSERT OR IGNORE INTO orch_tasks_v1
    (task_id,owner_subject_hash,idempotency_key,request_sha256,target,action,status,budget_cents,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,0,?,?)`).bind(request.task_id,ownerSubjectHash,request.idempotency_key,hash,request.target,request.action,status,timestamp,timestamp).run();
  const row=await db.prepare(`SELECT task_id,idempotency_key,request_sha256,status FROM orch_tasks_v1
    WHERE owner_subject_hash=? AND idempotency_key=? LIMIT 1`).bind(ownerSubjectHash,request.idempotency_key).first<Row>();
  if(!row)throw new Error('task_id_collision_or_reservation_unavailable');
  if(row.request_sha256!==hash||row.task_id!==request.task_id)throw new Error('idempotency_conflict');
  return {task_id:row.task_id,idempotency_key:row.idempotency_key,request_sha256:row.request_sha256,status:row.status==='REVIEW'?'REVIEW':'VALIDATED',existing:result.meta.changes===0,execution_performed:false};
}
