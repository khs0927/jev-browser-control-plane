// CAD-free architectural drawing compiler. Generates new files only; never modifies originals.
import {z} from 'zod';
import {generatePowerCadDxf,PowerCadDxfError} from './powercad-dxf-free.js';

const xy=z.array(z.number().finite().min(-1000000).max(1000000)).length(2);
const layer=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/).optional();
const positive=z.number().finite().positive().max(100000);
const angle=z.number().finite().min(0).max(360);
const text=z.string().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/);
const point=z.object({type:z.literal('point'),at:xy,size:positive.optional(),layer}).strict();
const line=z.object({type:z.literal('line'),start:xy,end:xy,layer}).strict();
const polyline=z.object({type:z.literal('polyline'),points:z.array(xy).min(2).max(64),closed:z.boolean().optional(),layer}).strict();
const circle=z.object({type:z.literal('circle'),center:xy,radius:positive,layer}).strict();
const arc=z.object({type:z.literal('arc'),center:xy,radius:positive,startAngle:angle,endAngle:angle,layer}).strict();
const note=z.object({type:z.literal('text'),at:xy,text,height:positive,layer}).strict();
const rectangle=z.object({type:z.literal('rectangle'),corner1:xy,corner2:xy,layer}).strict();
const polygon=z.object({type:z.literal('polygon'),center:xy,radius:positive,sides:z.number().int().min(3).max(48),rotation:angle.optional(),layer}).strict();
const wall=z.object({type:z.literal('wall'),start:xy,end:xy,thickness:positive,layer}).strict();
const window_=z.object({type:z.literal('window'),start:xy,end:xy,frame_depth:positive,layer}).strict();
const door=z.object({type:z.literal('door'),hinge:xy,width:positive,closed_angle:angle,open_angle:angle,layer}).strict();
const dimension=z.object({type:z.literal('dimension'),start:xy,end:xy,offset:z.number().finite().min(-100000).max(100000),text_height:z.number().positive().max(2000).optional(),layer}).strict();
const column=z.object({type:z.literal('column'),center:xy,width:positive,depth:positive,layer}).strict();
const room=z.object({type:z.literal('room'),boundary:z.array(xy).min(3).max(48),name:text,text_height:z.number().positive().max(2000).optional(),layer}).strict();
export const architecturalShapeSchema=z.discriminatedUnion('type',[point,line,polyline,circle,arc,note,rectangle,polygon,wall,window_,door,dimension,column,room]);
export const architecturalDrawingSchema=z.object({drawing_name:z.string().min(1).max(80).regex(/^[^\x00-\x1f\x7f]+$/),entities:z.array(architecturalShapeSchema).min(1).max(60)}).strict();
type P=[number,number];
type Primitive={type:string;layer?:string;[k:string]:unknown};
const add=(a:P,b:P):P=>[a[0]+b[0],a[1]+b[1]];
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
const scale=(a:P,n:number):P=>[a[0]*n,a[1]*n];
const norm=(a:P):number=>Math.hypot(a[0],a[1]);
const midpoint=(a:P,b:P):P=>scale(add(a,b),.5);
const rotate=(r:number):P=>[Math.cos(r*Math.PI/180),Math.sin(r*Math.PI/180)];
function nonzero(a:P,b:P):{length:number;normal:P}{
 const d=sub(b,a),length=norm(d);
 if(length<1e-9)throw new PowerCadDxfError('zero_length_architectural_segment');
 return {length,normal:[-d[1]/length,d[0]/length]};
}
function ensureArea(a:P,b:P){if(Math.abs(a[0]-b[0])<1e-9||Math.abs(a[1]-b[1])<1e-9)throw new PowerCadDxfError('zero_area_rectangle');}
function expand(e:z.infer<typeof architecturalShapeSchema>):Primitive[]{
 const t=e.type;
 if(t==='line'||t==='polyline'||t==='circle'||t==='arc'||t==='text')return [e];
 if(t==='point'){
  const s=e.size??50,p=e.at as P;
  return [{type:'line',start:[p[0]-s,p[1]],end:[p[0]+s,p[1]],layer:e.layer},{type:'line',start:[p[0],p[1]-s],end:[p[0],p[1]+s],layer:e.layer}];
 }
 if(t==='rectangle'){
  const a=e.corner1 as P,b=e.corner2 as P;ensureArea(a,b);
  return [{type:'polyline',points:[a,[b[0],a[1]],b,[a[0],b[1]]],closed:true,layer:e.layer}];
 }
 if(t==='polygon'){
  const p=e.center as P;
  const points=Array.from({length:e.sides},(_,i)=>add(p,scale(rotate((e.rotation??0)+360*i/e.sides),e.radius)));
  return [{type:'polyline',points,closed:true,layer:e.layer}];
 }
 if(t==='wall'||t==='window'){
  const a=e.start as P,b=e.end as P,{normal}=nonzero(a,b),half=scale(normal,(t==='wall'?e.thickness:e.frame_depth)/2);
  if(t==='wall'){
   return [{type:'polyline',points:[add(a,half),add(b,half),sub(b,half),sub(a,half)],closed:true,layer:e.layer??'WAL1'}];
  }
  const q=scale(half,.6),ly=e.layer??'WIN';
  return [
   {type:'line',start:add(a,half),end:add(b,half),layer:ly},
   {type:'line',start:sub(a,half),end:sub(b,half),layer:ly},
   {type:'line',start:add(a,q),end:add(b,q),layer:ly},
   {type:'line',start:sub(a,q),end:sub(b,q),layer:ly},
   {type:'line',start:add(a,half),end:sub(a,half),layer:ly},
   {type:'line',start:add(b,half),end:sub(b,half),layer:ly}
  ];
 }
 if(t==='door'){
  if(e.open_angle===e.closed_angle)throw new PowerCadDxfError('door_swing_zero');
  const p=e.hinge as P,ly=e.layer??'DOOR';
  return [{type:'line',start:p,end:add(p,scale(rotate(e.open_angle),e.width)),layer:ly},
          {type:'arc',center:p,radius:e.width,startAngle:Math.min(e.closed_angle,e.open_angle),endAngle:Math.max(e.closed_angle,e.open_angle),layer:ly}];
 }
 if(t==='column'){
  const c=e.center as P,a:[number,number]=[c[0]-e.width/2,c[1]-e.depth/2],b:[number,number]=[c[0]+e.width/2,c[1]+e.depth/2];
  return [{type:'polyline',points:[a,[b[0],a[1]],b,[a[0],b[1]]],closed:true,layer:e.layer??'COL'}];
 }
 if(t==='room'){
  const v=e.boundary as P[],c=scale(v.reduce((a,b)=>add(a,b),[0,0] as P),1/v.length),ly=e.layer??'ROOM';
  return [{type:'polyline',points:v,closed:true,layer:ly},{type:'text',at:c,text:e.name,height:e.text_height??200,layer:ly}];
 }
 // Display-only dimension: not an associative CAD DIMENSION, and no styling override.
 if(t==='dimension'){
  const a=e.start as P,b=e.end as P,{length,normal}=nonzero(a,b),n=scale(normal,e.offset),aa=add(a,n),bb=add(b,n),ly=e.layer??'DIM';
  const tick=scale(sub(b,a),25/length),t1=add(scale(normal,25),tick),t2=sub(scale(normal,25),tick);
  const label=(Math.round(length*1000)/1000).toString();
  return [
   {type:'line',start:a,end:add(aa,scale(normal,25)),layer:ly},
   {type:'line',start:b,end:add(bb,scale(normal,25)),layer:ly},
   {type:'line',start:aa,end:bb,layer:ly},
   {type:'line',start:sub(aa,t1),end:add(aa,t1),layer:ly},
   {type:'line',start:sub(bb,t2),end:add(bb,t2),layer:ly},
   {type:'text',at:add(midpoint(aa,bb),scale(normal,(e.text_height??150)*.5)),text:label,height:e.text_height??150,layer:ly},
  ];
 }
 throw new PowerCadDxfError('unsupported_architectural_entity');
}
export async function generatePowerCadArchitecturalDxf(input:unknown){
 const parsed=architecturalDrawingSchema.safeParse(input);
 if(!parsed.success)throw new PowerCadDxfError('invalid_architectural_request');
 const compiled:Primitive[]=[];
 for(const e of parsed.data.entities)compiled.push(...expand(e));
 if(compiled.length>120)throw new PowerCadDxfError('architectural_expansion_limit');
 const result=await generatePowerCadDxf({drawing_name:parsed.data.drawing_name,entities:compiled});
 return {...result,schema:'powercad.architectural-dxf/1',semantic_entities:parsed.data.entities.length,
  expanded_entities:compiled.length,associative_dimensions:false,editable_original:false,
  warnings:['New-file-only bounded 2D CAD-free output. No existing DXF/DWG file is read or modified.',
   'Architectural walls/windows/doors are schematic symbols: wall openings, connectivity, collisions, setbacks and building-code compliance are NOT checked.',
   'Dimensions are rendered lines and text, not native associative DIMENSION objects. Independent DXF reopen and professional review required.']};
}
