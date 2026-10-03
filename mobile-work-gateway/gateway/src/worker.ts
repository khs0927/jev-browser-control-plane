import OAuthProvider,{authorizationErrorRedirect} from '@cloudflare/workers-oauth-provider';
import {mcp} from './mcp.js';
import {callback} from './callback.js';
import type {Env} from './types.js';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const redirect=(headers:Headers,url:string)=>{headers.set('Location',url);return new Response(null,{status:302,headers});};
const authHandler={async fetch(req:Request,env:Env){
 const path=new URL(req.url).pathname,oauth=env.OAUTH_PROVIDER;
 if(path==='/authorize' && req.method==='GET'){
  const original=await oauth.parseAuthRequest(req);
  const uri=new URL(original.redirectUri);if(uri.origin!=='https://chatgpt.com' || !uri.pathname.startsWith('/connector/oauth/'))return new Response('Unsupported callback',{status:400});
  const description=await oauth.describeConsent(original),consent=await oauth.beginConsent(original);
  consent.headers.set('Content-Type','text/html; charset=utf-8');
  return new Response(`<h1>Mobile Work Gateway</h1><p>Allow ${escape(description.clientName??'ChatGPT')} to run the reviewed environment check and read its results?</p><p>Callback: ${escape(uri.hostname)}</p><p>Scope: mcp:tools</p><form method="post"><input type="hidden" name="handle" value="${escape(consent.handle)}"><button name="decision" value="allow">Allow</button><button name="decision" value="deny">Deny</button></form>`,{headers:consent.headers});
 }
 if(path==='/authorize' && req.method==='POST'){
  const form=await req.formData();if(form.get('decision')!=='allow'){const denied=await oauth.denyConsent(req,String(form.get('handle')));return redirect(denied.headers,denied.redirectTo);}
  const approved=await oauth.approveConsent(req,String(form.get('handle')),{scope:['mcp:tools']});
  const verifier=crypto.randomUUID()+crypto.randomUUID();const {state,headers}=await oauth.beginUpstream(approved.request,{data:{verifier},headers:approved.headers});
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));const challenge=btoa(String.fromCharCode(...hash)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const url=new URL('https://github.com/login/oauth/authorize');url.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:`${env.PUBLIC_URL}/callback`,scope:'read:user',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return redirect(headers,url.toString());
 }
 if(path==='/callback' && req.method==='GET'){
  const {request:original,data,headers}=await oauth.finishUpstream(req);
  const code=new URL(req.url).searchParams.get('code');if(!code)return redirect(headers,authorizationErrorRedirect(original,'access_denied'));
  const exchange=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:`${env.PUBLIC_URL}/callback`,code_verifier:data.verifier}),signal:AbortSignal.timeout(15000)});
  const token:any=await exchange.json();if(!exchange.ok || typeof token.access_token!=='string')return redirect(headers,authorizationErrorRedirect(original,'access_denied'));
  const response=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${token.access_token}`,'User-Agent':'MobileWorkGateway'},signal:AbortSignal.timeout(15000)});const user:any=await response.json();
  if(!response.ok || String(user.id)!==env.OWNER_ID)return redirect(headers,authorizationErrorRedirect(original,'access_denied'));
  const {redirectTo}=await oauth.completeAuthorization({request:original,userId:String(user.id),metadata:{},scope:['mcp:tools'],props:{ownerId:String(user.id)}});return redirect(headers,redirectTo);
 }
 return new Response('Not found',{status:404});
}};
export default {async fetch(req:Request,env:Env,ctx:ExecutionContext){
 const url=new URL(req.url);
 if(url.pathname==='/health')return Response.json({status:'running',version:'0.1.0',mcp_ready:!!(env.DB&&env.OAUTH_KV&&env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET&&env.GITHUB_TOKEN&&env.PUBLIC_URL)});
 if(!env.PUBLIC_URL || url.origin!==env.PUBLIC_URL)return new Response('Configuration required',{status:503});
 try{
  if(url.pathname==='/internal/results')return req.method==='POST'?await callback(req,env):new Response('Method not allowed',{status:405});
  if(!env.DB||!env.OAUTH_KV||!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.GITHUB_TOKEN)return new Response('Configuration required',{status:503});
  const provider=new OAuthProvider<Env>({apiRoute:'/mcp',apiHandler:{fetch:(request:any,e:any,c:any)=>{if(!c.auth.scope.includes('mcp:tools')||c.props.ownerId!==e.OWNER_ID)return new Response('Forbidden',{status:403});return mcp(request,e,c.props.ownerId);}},defaultHandler:authHandler,authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/register',scopesSupported:['mcp:tools'],requiredScopes:['mcp:tools'],resourceMetadata:{resource:`${env.PUBLIC_URL}/mcp`,authorization_servers:[env.PUBLIC_URL]},clientIdMetadataDocumentEnabled:false,accessTokenTTL:3600});
  return await provider.fetch(req,env,ctx);
 }catch{return Response.json({error:'request_rejected'},{status:400});}
}};
