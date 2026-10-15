// Power-CAD MCP: new-file-only free Cloudflare DXF subset. NOT a DWG/.NET runner.
type Vec=[number,number];
type Shape={type:string;layer?:string;start?:Vec;end?:Vec;points?:Vec[];closed?:boolean;
 center?:Vec;radius?:number;startAngle?:number;endAngle?:number;at?:Vec;text?:string;height?:number};
export class PowerCadDxfError extends Error{}
const reject=(s:string):never=>{throw new PowerCadDxfError(s);};
const names=/^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const isnum=(n:unknown,limit=1000000)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit;
const vec=(x:unknown):x is Vec=>Array.isArray(x)&&x.length===2&&isnum(x[0])&&isnum(x[1]);
const keyset=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));
const p=(n:number|string,v:number|string)=>[String(n),String(v)];
const xy=(v:Vec,n=10)=>[...p(n,v[0]),...p(n+10,v[1])];
const unicode=(text:string)=>[...text].map(c=>{const n=c.codePointAt(0)!;
 if(n>=32&&n<=126)return c==='\\'?'\\\\':c;
 if(n<=65535)return '\\U+'+n.toString(16).toUpperCase().padStart(4,'0');
 const a=n-65536;return '\\U+'+(0xD800+(a>>10)).toString(16).toUpperCase()+'\\U+'+(0xDC00+(a&1023)).toString(16).toUpperCase();
}).join('');
const escapeXml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function validate(data:unknown):{drawing_name:string;entities:Shape[]}{
 if(!data||typeof data!=='object'||Array.isArray(data))reject('invalid_request');
 const x=data as Record<string,unknown>;
 if(!keyset(x,['drawing_name','entities'])||typeof x.drawing_name!=='string'||!x.drawing_name.trim()||x.drawing_name.length>80||/[\x00-\x1f\x7f]/.test(x.drawing_name))reject('invalid_name');
 if(!Array.isArray(x.entities)||x.entities.length<1||x.entities.length>120)reject('invalid_count');
 for(const a of x.entities){
  if(!a||typeof a!=='object'||Array.isArray(a))reject('invalid_entity');
  const e=a as Record<string,unknown>,t=e.type;
  if(e.layer!==undefined&&(typeof e.layer!=='string'||!names.test(e.layer)))reject('invalid_layer');
  if(t==='line'&&keyset(e,['type','layer','start','end'])&&vec(e.start)&&vec(e.end))continue;
  if(t==='polyline'&&keyset(e,['type','layer','points','closed'])&&Array.isArray(e.points)&&e.points.length>=2&&e.points.length<=64&&e.points.every(vec)&&(e.closed===undefined||typeof e.closed==='boolean'))continue;
  if((t==='circle'||t==='arc')&&keyset(e,t==='circle'?['type','layer','center','radius']:['type','layer','center','radius','startAngle','endAngle'])&&vec(e.center)&&isnum(e.radius,100000)&&Number(e.radius)>0){
   if(t==='circle'||(isnum(e.startAngle,360)&&isnum(e.endAngle,360)&&Number(e.startAngle)>=0&&Number(e.endAngle)>=0))continue;
  }
  if(t==='text'&&keyset(e,['type','layer','at','text','height'])&&vec(e.at)&&typeof e.text==='string'&&e.text.length>0&&e.text.length<=100&&!/[\x00-\x1f\x7f]/.test(e.text)&&isnum(e.height,10000)&&Number(e.height)>0)continue;
  reject('invalid_or_unsupported_entity');
 }
 return x as {drawing_name:string;entities:Shape[]};
}
function encode(e:Shape):string[]{
 const layer=e.layer??'POWER_CAD',type=e.type,kind=type==='polyline'?'LWPOLYLINE':type.toUpperCase();
 const cls=type==='polyline'?'AcDbPolyline':type==='line'?'AcDbLine':type==='text'?'AcDbText':'AcDbCircle';
 const head=[...p(0,kind),...p(100,'AcDbEntity'),...p(8,layer),...p(100,cls)];
 if(type==='line')return [...head,...xy(e.start!),...xy(e.end!,11)];
 if(type==='polyline')return [...head,...p(90,e.points!.length),...p(70,e.closed?1:0),...e.points!.flatMap(v=>xy(v))];
 if(type==='circle'||type==='arc')return [...head,...xy(e.center!),...p(40,e.radius!),...(type==='arc'?[...p(100,'AcDbArc'),...p(50,e.startAngle!),...p(51,e.endAngle!)]:[])];
 return [...head,...xy(e.at!),...p(40,e.height!),...p(1,unicode(e.text!)),...p(7,'STANDARD')];
}
function preview(entities:Shape[],name:string){
 const points:Vec[]=[];
 for(const e of entities){if(e.type==='line')points.push(e.start!,e.end!);
 else if(e.type==='polyline')points.push(...e.points!);
 else if(e.type==='text')points.push(e.at!,[e.at![0]+e.height!*e.text!.length*.7,e.at![1]+e.height!]);
 else points.push([e.center![0]-e.radius!,e.center![1]-e.radius!],[e.center![0]+e.radius!,e.center![1]+e.radius!]);}
 const x0=Math.min(...points.map(v=>v[0])),x1=Math.max(...points.map(v=>v[0]));
 const y0=Math.min(...points.map(v=>v[1])),y1=Math.max(...points.map(v=>v[1]));
 const margin=Math.max(100,(x1-x0+y1-y0)*.025),els=entities.map(e=>{
 const s=(a:Vec)=>a[0]+','+a[1],layer=escapeXml(e.layer??'POWER_CAD');
 if(e.type==='line')return '<line data-layer="'+layer+'" x1="'+e.start![0]+'" y1="'+e.start![1]+'" x2="'+e.end![0]+'" y2="'+e.end![1]+'"/>';
 if(e.type==='polyline')return '<'+(e.closed?'polygon':'polyline')+' data-layer="'+layer+'" points="'+e.points!.map(s).join(' ')+'"/>';
 if(e.type==='circle')return '<circle data-layer="'+layer+'" cx="'+e.center![0]+'" cy="'+e.center![1]+'" r="'+e.radius+'"/>';
 if(e.type==='arc'){
  const rad=(n:number)=>n*Math.PI/180,a=e.startAngle!,b=e.endAngle!,r=e.radius!;
  const z=(n:number):Vec=>[e.center![0]+Math.cos(rad(n))*r,e.center![1]+Math.sin(rad(n))*r];
  const sweep=((b-a+360)%360)||360;
  if(sweep===360)return '<circle cx="'+e.center![0]+'" cy="'+e.center![1]+'" r="'+r+'"/>';
  return '<path data-layer="'+layer+'" d="M '+s(z(a))+' A '+r+' '+r+' 0 '+(sweep>180?1:0)+' 1 '+s(z(b))+'"/>';
 }
 return '<text data-layer="'+layer+'" transform="translate('+e.at![0]+','+e.at![1]+') scale(1,-1)" font-size="'+e.height+'" font-family="sans-serif" fill="currentColor" stroke="none">'+escapeXml(e.text!)+'</text>';
 }).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[x0-margin,-y1-margin,x1-x0+2*margin,y1-y0+2*margin].join(' ')+'" aria-label="'+escapeXml(name)+'"><g transform="scale(1,-1)" fill="none" stroke="currentColor" stroke-width="10">'+els+'</g></svg>';
}
export async function generatePowerCadDxf(raw:unknown){
 const request=validate(raw),layers=[...new Set(request.entities.map(e=>e.layer??'POWER_CAD'))].sort();
 const layerRecords=layers.flatMap(n=>[...p(0,'LAYER'),...p(2,n),...p(70,0),...p(62,7),...p(6,'CONTINUOUS')]);
 const rows=[...p(0,'SECTION'),...p(2,'HEADER'),...p(9,'$ACADVER'),...p(1,'AC1027'),...p(9,'$INSUNITS'),...p(70,4),...p(0,'ENDSEC'),
  ...p(0,'SECTION'),...p(2,'TABLES'),...p(0,'TABLE'),...p(2,'LAYER'),...p(70,layers.length),...layerRecords,...p(0,'ENDTAB'),...p(0,'ENDSEC'),
  ...p(0,'SECTION'),...p(2,'BLOCKS'),...p(0,'ENDSEC'),...p(0,'SECTION'),...p(2,'ENTITIES'),...request.entities.flatMap(encode),...p(0,'ENDSEC'),...p(0,'EOF')];
 const dxf=rows.join('\n')+'\n',bytes=new TextEncoder().encode(dxf);
 if(bytes.byteLength>65536)reject('output_too_large');
 const rawHash=await crypto.subtle.digest('SHA-256',bytes);
 const sha=[...new Uint8Array(rawHash)].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {schema:'powercad.mobile-dxf/1',status:'generated_cloudflare_subset',format:'dxf',units:'mm',
  drawing_name:request.drawing_name,entities:request.entities.length,layers,sha256:sha,bytes:bytes.byteLength,
  dxf_text:dxf,svg_preview:preview(request.entities,request.drawing_name),
  independently_verified:false,customer_delivery_approved:false,
  warning:'Power-CAD free Worker subset: 2D DXF only, not the native DWG runner. Download/viewer and Korean font acceptance remain separate.'};
}
