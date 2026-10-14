import {z} from 'zod';
import type {Env} from './types.js';

// Cloudflare Browser Run tools with encrypted, owner-scoped login profiles.
// Cookie values never leave the Worker in tool output.

const host=(h:string)=>!/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(h)&&!/^[0-9.]+$/.test(h)&&!h.includes(':')&&!h.startsWith('[');
export const browserUrl=z.string().max(1000).url().refine(v=>{try{const u=new URL(v);return (u.protocol==='https:'||u.protocol==='http:')&&!u.username&&!u.password&&host(u.hostname);}catch{return false;}},'public_url_required');
export const profileName=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/,'invalid_profile');
const step=z.object({
 action:z.enum(['click','fill','press','select','wait','goto','wait_for']),
 selector:z.string().max(300).optional(),
 text:z.string().max(200).optional(),
 value:z.string().max(2000).optional(),
 ms:z.number().int().min(0).max(10000).optional(),
}).strict();
export const readShape={url:browserUrl,profile:profileName.optional(),wait_ms:z.number().int().min(0).max(10000).optional(),screenshot:z.boolean().optional()};
export const actShape={url:browserUrl,profile:profileName.optional(),steps:z.array(step).min(1).max(15),save_profile:z.boolean().optional(),screenshot:z.boolean().optional()};
export const profileShape={profile:profileName.optional()};
export const readInput=z.object(readShape).strict();
export const actInput=z.object(actShape).strict();
export const profileInput=z.object(profileShape).strict();

export type Cookie={name:string;value:string;domain:string;path?:string;expires?:number;httpOnly?:boolean;secure?:boolean;sameSite?:'Strict'|'Lax'|'None'};
type Stored={updated_at:number;cookies:Cookie[]};

const b64=(u:Uint8Array)=>{let s='';for(const c of u)s+=String.fromCharCode(c);return btoa(s);};
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(secret:string){
 if(!secret||secret.length<32)throw Error('profile_key_missing');
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
 return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(secret:string,data:Stored){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),new TextEncoder().encode(JSON.stringify(data))));
 return JSON.stringify({v:1,iv:b64(iv),ct:b64(ct)});
}
export async function open(secret:string,blob:string):Promise<Stored>{
 const {v,iv,ct}=JSON.parse(blob);if(v!==1)throw Error('profile_format');
 const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await key(secret),unb64(ct));
 return JSON.parse(new TextDecoder().decode(pt));
}
export const kvKey=(owner:string,name:string)=>`bprof:${owner}:${name}`;

export function summarize(cookies:Cookie[]){
 const now=Date.now()/1000,domains:Record<string,number>={};
 for(const c of cookies){if(c.expires&&c.expires>0&&c.expires<now)continue;const d=c.domain.replace(/^\./,'');domains[d]=(domains[d]??0)+1;}
 return Object.entries(domains).sort((a,b)=>b[1]-a[1]).map(([domain,count])=>({domain,cookies:count}));
}

export class BrowserTools{
 constructor(readonly env:Env,readonly owner:string){if(owner!==env.OWNER_ID)throw Error('forbidden');}
 async loadProfile(name?:string):Promise<Cookie[]>{
  if(!name)return [];
  const blob=await this.env.OAUTH_KV.get(kvKey(this.owner,name));if(!blob)throw Error('profile_not_found');
  return (await open(this.env.BROWSER_PROFILE_KEY??'',blob)).cookies;
 }
 async saveProfile(name:string,cookies:Cookie[]){
  await this.env.OAUTH_KV.put(kvKey(this.owner,name),await seal(this.env.BROWSER_PROFILE_KEY??'',{updated_at:Date.now(),cookies}));
 }
 async browser_profiles(raw:unknown){
  const {profile}=profileInput.parse(raw??{});
  if(profile){const blob=await this.env.OAUTH_KV.get(kvKey(this.owner,profile));if(!blob)throw Error('profile_not_found');const s=await open(this.env.BROWSER_PROFILE_KEY??'',blob);return {profile,updated_at:new Date(s.updated_at).toISOString(),sites:summarize(s.cookies)};}
  const list=await this.env.OAUTH_KV.list({prefix:`bprof:${this.owner}:`});
  return {profiles:list.keys.map(k=>k.name.split(':').pop())};
 }
 async session<T>(name:string|undefined,fn:(page:any,context:any)=>Promise<T>,persist=false):Promise<T>{
  if(!this.env.BROWSER)throw Error('browser_binding_missing');
  const cookies=await this.loadProfile(name);
  const {launch}=await import('@cloudflare/playwright');
  let browser:any;
  try{browser=await launch(this.env.BROWSER as any);}catch(e){throw Error(/429|limit|quota/i.test(String(e))?'browser_quota_exceeded':'browser_launch_failed');}
  try{
   const context=await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1280,height:800}});
   if(cookies.length)await context.addCookies(cookies.map(c=>({...c,path:c.path??'/'})));
   const page=await context.newPage();
   const out=await fn(page,context);
   if(persist&&name)await this.saveProfile(name,await context.cookies());
   return out;
  }finally{await browser.close().catch(()=>{});}
 }
 async capture(page:any,screenshot?:boolean){
  const title=await page.title().catch(()=>'');
  const text:string=await page.evaluate(()=>(document.body?.innerText??'').replace(/\n{3,}/g,'\n\n')).catch(()=>'');
  const shot=screenshot?b64(new Uint8Array(await page.screenshot({type:'jpeg',quality:60}))):undefined;
  return {result:{final_url:page.url(),title,text:text.slice(0,15000),truncated:text.length>15000},image:shot};
 }
 async browser_read(raw:unknown){
  const i=readInput.parse(raw);
  return this.session(i.profile,async page=>{
   const r=await page.goto(i.url,{waitUntil:'domcontentloaded',timeout:30000});
   if(i.wait_ms)await page.waitForTimeout(i.wait_ms);
   const c=await this.capture(page,i.screenshot);return {...c,result:{...c.result,http_status:r?.status()??null,profile:i.profile??null}};
  });
 }
 async browser_act(raw:unknown){
  const i=actInput.parse(raw);
  if(i.save_profile&&!i.profile)throw Error('profile_required');
  return this.session(i.profile,async page=>{
   await page.goto(i.url,{waitUntil:'domcontentloaded',timeout:30000});
   const log:string[]=[];
   for(const [n,s] of i.steps.entries()){
    const target=()=>s.selector?page.locator(s.selector).first():s.text?page.getByText(s.text,{exact:false}).first():null;
    try{
     if(s.action==='goto'){browserUrl.parse(s.value);await page.goto(s.value,{waitUntil:'domcontentloaded',timeout:30000});}
     else if(s.action==='wait')await page.waitForTimeout(s.ms??1000);
     else if(s.action==='wait_for'){const t=target();if(!t)throw Error('target_required');await t.waitFor({timeout:s.ms??10000});}
     else if(s.action==='press')await page.keyboard.press(s.value??'Enter');
     else{const t=target();if(!t)throw Error('target_required');
      if(s.action==='click')await t.click({timeout:10000});
      else if(s.action==='fill')await t.fill(s.value??'',{timeout:10000});
      else if(s.action==='select')await t.selectOption(s.value??'',{timeout:10000});}
     log.push(`${n+1}:${s.action}:ok`);
    }catch(e){log.push(`${n+1}:${s.action}:failed`);const c=await this.capture(page,i.screenshot);return {...c,result:{...c.result,steps:log,completed:false}};}
   }
   const c=await this.capture(page,i.screenshot);return {...c,result:{...c.result,steps:log,completed:true,profile_saved:!!i.save_profile}};
  },!!i.save_profile);
 }
}
