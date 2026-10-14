import { z } from 'zod';
export const TASK_TYPES=['environment_check','gateway_tests','browser_check'] as const;
const publicHttps=z.string().max(500).url().refine(v=>{try{const u=new URL(v);const h=u.hostname;return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|.*\.local|.*\.internal)$/i.test(h)&&!/^[0-9.]+$/.test(h)&&!h.includes(':')&&!h.startsWith('[');}catch{return false;}},'public_https_url_required');
const base={ref:z.string().min(1).max(100),idempotency_key:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/)};
export const createInput = z.discriminatedUnion('task_type',[
 z.object({task_type:z.literal('environment_check'),...base,parameters:z.object({}).strict().optional()}).strict(),
 z.object({task_type:z.literal('gateway_tests'),...base,parameters:z.object({}).strict().optional()}).strict(),
 z.object({task_type:z.literal('browser_check'),...base,parameters:z.object({url:publicHttps}).strict()}).strict()]);
export const createShape={task_type:z.enum(TASK_TYPES),ref:base.ref,idempotency_key:base.idempotency_key,parameters:z.object({url:z.string().max(500).optional()}).strict().optional()};
export const taskInput = z.object({task_id:z.string().uuid()}).strict();
export const artifactInput=taskInput.extend({artifact_id:z.string().regex(/^[0-9]+$/),mode:z.enum(['summary','download']).default('summary')});
export const resultInput=z.object({schema_version:z.literal(1),task_type:z.enum(TASK_TYPES),python_version:z.string().max(50),test_passed:z.boolean(),commit_sha:z.string().regex(/^[a-f0-9]{40}$/),run_id:z.string().regex(/^[0-9]+$/),run_attempt:z.coerce.number().int().positive(),summary:z.string().max(1000),findings:z.array(z.object({code:z.string().max(100)}).strict()).max(20),evidence:z.array(z.string().max(100)).max(10),page_title:z.string().max(200).optional(),http_status:z.number().int().min(0).max(999).optional()}).strict();
export async function digest(value:string) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function bindRun(run:any,env:{REPOSITORY:string;WORKFLOW:string},task:{sha:string;ref:string;task_id:string}){
 if(run.repository?.full_name!==env.REPOSITORY || run.path!==`.github/workflows/${env.WORKFLOW}` || run.head_sha!==task.sha || run.head_branch!==task.ref || run.event!=='workflow_dispatch' || run.display_title!==`mobile-work:${task.task_id}`)throw Error('run_binding_failed');
}
