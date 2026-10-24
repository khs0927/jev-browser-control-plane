import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeMobileCadRequest, READ_TOOLS, WRITE_TOOLS} from './cadfree-session-policy.mjs';
const sha = 'a'.repeat(64);
const current = 1000000000;
const session = {id:'00000000-0000-4000-8000-000000000001',ownerId:'owner-123',sourceName:'source01.dxf',sourceSha256:sha,revision:3,expiresAtMs:current+60000,state:'active'};
const base = {authenticatedOwnerId:'owner-123',expectedOwnerId:'owner-123',session,
 expectedSourceSha256:sha,expectedRevision:3,nowMs:current,idempotencyKey:'mobile-test-key-123',consumedKeys:[],knownFileNames:[]};
const allowed = (tool,parameters={}) => authorizeMobileCadRequest({...base,tool,parameters});
const blocked = (label, change, code) => test(label,()=>assert.deepEqual(
  {allowed:false,code},authorizeMobileCadRequest({...base,tool:'cad_move',parameters:{targets:[{handle:'2A0',expect_fingerprint:'0123456789abcdef'}],displacement:[100,200]},...change})
));
for(const name of READ_TOOLS){test('read tool '+name,()=>{
 const param=['cad_get','cad_inspect','cad_measure'].includes(name)?{handles:['2A0']}:{};
 const r=allowed(name,param);assert.equal(r.allowed,true);assert.equal(r.requiresWriteLease,false);
});}
for(const name of ['cad_create','cad_create_many'])test('new entities '+name,()=>{
 const r=allowed(name,{entities:[{type:'line',start:[0,0],end:[100,0],layer:'WAL1'}]});
 assert.equal(r.allowed,true);assert.equal(r.params.entities.length,1);
});
for(const name of ['cad_move','cad_copy'])test('target edit '+name,()=>{
 const r=allowed(name,{targets:[{handle:'2A0',expect_fingerprint:'0123456789abcdef'}],displacement:[100,200]});
 assert.equal(r.allowed,true);assert.equal(r.requiresWriteLease,true);
});
test('save copy explicitly',()=>assert.equal(allowed('cad_save',{mode:'copy',format:'dxf',overwrite:false,output_name:'copy01.dxf'}).allowed,true));
blocked('owner mismatch',{authenticatedOwnerId:'another'},'OWNER_AUTH_REQUIRED');
blocked('session owner mismatch',{session:{...session,ownerId:'another'}},'SESSION_OWNER_MISMATCH');
blocked('expired session',{nowMs:current+70000},'SESSION_EXPIRED');
blocked('abnormally long session',{session:{...session,expiresAtMs:current+16*60000}},'SESSION_EXPIRED');
blocked('source hash changed',{expectedSourceSha256:'b'.repeat(64)},'SOURCE_REVISION_MISMATCH');
blocked('stale revision',{expectedRevision:2},'STALE_SESSION_REVISION');
blocked('inactive session',{session:{...session,state:'revoked'}},'SESSION_EXPIRED');
blocked('missing idempotency',{idempotencyKey:undefined},'IDEMPOTENCY_KEY_REQUIRED');
blocked('idempotency replay',{consumedKeys:['mobile-test-key-123']},'REPLAY_DENIED');
blocked('target shape extra fields',{parameters:{targets:[{handle:'2A0',expect_fingerprint:'0123456789abcdef',color:'red'}],displacement:[10,10]}},'UNSUPPORTED_TARGET_FIELD');
blocked('zero displacement',{parameters:{targets:[{handle:'2A0',expect_fingerprint:'0123456789abcdef'}],displacement:[0,0]}},'ZERO_DISPLACEMENT');
blocked('NaN coords',{parameters:{targets:[{handle:'2A0',expect_fingerprint:'0123456789abcdef'}],displacement:[NaN,3]}},'INVALID_COORDINATE');
blocked('copy count too high',{tool:'cad_copy',parameters:{targets:[{handle:'2A0',expect_fingerprint:'0123456789abcdef'}],displacement:[10,0],count:201}},'INVALID_NUMBER');
blocked('dangerous delete',{tool:'cad_delete'},'TOOL_NOT_ALLOWED');
blocked('unsafe remote exec',{tool:'exec_command'},'TOOL_NOT_ALLOWED');
blocked('write on raw file path',{tool:'cad_save',parameters:{mode:'copy',format:'dxf',overwrite:false,output_name:'new.dxf',path:'C:\\original.dxf'}},'UNSUPPORTED_PARAMETER');
blocked('save overwrite true',{tool:'cad_save',parameters:{mode:'copy',format:'dxf',overwrite:true,output_name:'new.dxf'}},'SAVE_COPY_ONLY');
blocked('save original name',{tool:'cad_save',parameters:{mode:'copy',format:'dxf',overwrite:false,output_name:'source01.dxf'}},'SOURCE_OVERWRITE');
blocked('save existing name',{tool:'cad_save',parameters:{mode:'copy',format:'dxf',overwrite:false,output_name:'COPY01.DXF'},knownFileNames:['copy01.dxf']},'OUTPUT_ALREADY_EXISTS');
blocked('path traversal',{tool:'cad_save',parameters:{mode:'copy',format:'dxf',overwrite:false,output_name:'../bad.dxf'}},'INVALID_OUTPUT_NAME');
blocked('unsupported hatch',{tool:'cad_create',parameters:{entities:[{type:'hatch',points:[[0,0],[1,0],[0,1]]}]}},'UNSUPPORTED_ENTITY');
blocked('silent style attr dropping',{tool:'cad_create',parameters:{entities:[{type:'line',start:[0,0],end:[1,0],color:1}]}},'UNSUPPORTED_ENTITY_PROPERTY');
blocked('empty create many',{tool:'cad_create_many',parameters:{entities:[]}},'ENTITY_COUNT');
test('does not mutate trusted session nor request',()=>{
 const original = JSON.stringify(session);
 const params={entities:[{type:'circle',center:[30,40],radius:50}]};
 const before=JSON.stringify(params);
 assert.equal(allowed('cad_create',params).allowed,true);
 assert.equal(JSON.stringify(session),original);
 assert.equal(JSON.stringify(params),before);
});
test('prototype has 8 reads and 5 writes, not full 79-tool parity',()=>{
 assert.equal(READ_TOOLS.length,8);assert.equal(WRITE_TOOLS.length,5);
});
