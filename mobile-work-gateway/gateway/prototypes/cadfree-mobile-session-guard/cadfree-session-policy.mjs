/**
 * CAD-free mobile session preflight policy -- prototype ONLY.
 * Not imported into the production gateway, does not start .NET, and is not
 * an OAuth handler. The caller MUST load a trusted owner-scoped session from
 * persistent storage, bind to upstream OAuth principal, and serialize writes.
 * Policy returns authorization to a trusted executor, never executes a CAD op.
 */

export const READ_TOOLS = Object.freeze([
  'cad_status', 'cad_get_document_identity', 'cad_query', 'cad_get',
  'cad_inspect', 'cad_layers', 'cad_measure', 'cad_list_targets',
]);
export const WRITE_TOOLS = Object.freeze([
  'cad_create', 'cad_create_many', 'cad_move', 'cad_copy', 'cad_save',
]);
const TOOLS = new Set([...READ_TOOLS, ...WRITE_TOOLS]);
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.dxf$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REQUEST_KEY = /^[A-Za-z0-9_-]{12,64}$/;
const HANDLE = /^[A-Fa-f0-9]{1,16}$/;
const LAYER = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const KINDS = new Set(['line', 'polyline', 'circle', 'arc', 'text']);
const SHAPES = new Map([
  ['line', ['type', 'layer', 'start', 'end']],
  ['polyline', ['type', 'layer', 'points', 'closed']],
  ['circle', ['type', 'layer', 'center', 'radius']],
  ['arc', ['type', 'layer', 'center', 'radius', 'start_angle', 'end_angle']],
  ['text', ['type', 'layer', 'position', 'text', 'height', 'rotation']],
]);

class Refused extends Error { constructor(code) { super(code); this.code = code; } }
const assert = (yes, code) => { if (!yes) throw new Refused(code); };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function exactKeys(object, keys, code) {
  assert(isObj(object), code);
  assert(Object.keys(object).every(k => keys.includes(k)), code);
}
function coordinate(p) {
  assert(Array.isArray(p) && p.length === 2, 'INVALID_COORDINATE');
  assert(p.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1_000_000), 'INVALID_COORDINATE');
  return [...p];
}
function number(v, min, max) {
  assert(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max, 'INVALID_NUMBER');
  return v;
}
function entities(raw) {
  assert(Array.isArray(raw) && raw.length >= 1 && raw.length <= 20, 'ENTITY_COUNT');
  return raw.map(e => {
    assert(isObj(e) && KINDS.has(e.type), 'UNSUPPORTED_ENTITY');
    exactKeys(e, SHAPES.get(e.type), 'UNSUPPORTED_ENTITY_PROPERTY');
    const layer = e.layer ?? '0';
    assert(layer === '0' || (typeof layer === 'string' && LAYER.test(layer)), 'INVALID_LAYER');
    const result = { type: e.type, layer };
    switch (e.type) {
      case 'line': result.start = coordinate(e.start); result.end = coordinate(e.end); break;
      case 'polyline':
        assert(Array.isArray(e.points) && e.points.length >= 2 && e.points.length <= 64, 'INVALID_POLYLINE');
        result.points = e.points.map(coordinate);
        assert(e.closed === undefined || typeof e.closed === 'boolean', 'INVALID_POLYLINE');
        result.closed = e.closed ?? false; break;
      case 'circle': result.center = coordinate(e.center); result.radius = number(e.radius, 1e-9, 100000); break;
      case 'arc':
        result.center = coordinate(e.center); result.radius = number(e.radius, 1e-9, 100000);
        result.start_angle = number(e.start_angle, 0, 360); result.end_angle = number(e.end_angle, 0, 360); break;
      case 'text':
        result.position = coordinate(e.position); result.height = number(e.height, 1e-9, 10000);
        assert(typeof e.text === 'string' && e.text.length >= 1 && e.text.length <= 100 && !/[\u0000-\u001F]/.test(e.text), 'INVALID_TEXT');
        result.text = e.text; result.rotation = number(e.rotation ?? 0, 0, 360); break;
    }
    return result;
  });
}
function targets(p) {
  assert(Array.isArray(p) && p.length >= 1 && p.length <= 50, 'INVALID_TARGETS');
  return p.map(t => {
    exactKeys(t, ['handle', 'expect_fingerprint'], 'UNSUPPORTED_TARGET_FIELD');
    assert(typeof t.handle === 'string' && HANDLE.test(t.handle), 'INVALID_HANDLE');
    assert(typeof t.expect_fingerprint === 'string' && /^[0-9a-f]{16}$/i.test(t.expect_fingerprint), 'FINGERPRINT_REQUIRED');
    return { handle:t.handle, expect_fingerprint:t.expect_fingerprint };
  });
}
function sanitize(tool, p, sourceName, knownFileNames) {
  if (tool === 'cad_status' || tool === 'cad_get_document_identity' || tool === 'cad_layers' || tool === 'cad_list_targets') {
    exactKeys(p, [], 'UNSUPPORTED_PARAMETER'); return {};
  }
  if (tool === 'cad_query') {
    exactKeys(p, ['types'], 'UNSUPPORTED_PARAMETER');
    if (p.types === undefined) return {};
    assert(Array.isArray(p.types) && p.types.length <= 10 && p.types.every(x => /^[A-Z_]{2,24}$/.test(x)), 'INVALID_QUERY');
    return {types:[...p.types]};
  }
  if (tool === 'cad_get' || tool === 'cad_inspect' || tool === 'cad_measure') {
    exactKeys(p, ['handles'], 'UNSUPPORTED_PARAMETER');
    assert(Array.isArray(p.handles) && p.handles.length > 0 && p.handles.length <= 50, 'INVALID_HANDLES');
    return {handles:p.handles.map(h=>{assert(typeof h==='string' && HANDLE.test(h),'INVALID_HANDLE');return h;})};
  }
  if (tool === 'cad_create' || tool === 'cad_create_many') {
    exactKeys(p, ['entities'], 'UNSUPPORTED_PARAMETER'); return {entities:entities(p.entities)};
  }
  if (tool === 'cad_move' || tool === 'cad_copy') {
    exactKeys(p, tool === 'cad_copy' ? ['targets','displacement','count'] : ['targets','displacement'], 'UNSUPPORTED_PARAMETER');
    const ret={targets:targets(p.targets),displacement:coordinate(p.displacement)};
    assert(ret.displacement.some(x => x !== 0), 'ZERO_DISPLACEMENT');
    if (tool === 'cad_copy') ret.count = number(p.count ?? 1, 1, 20);
    return ret;
  }
  if (tool === 'cad_save') {
    exactKeys(p, ['mode','format','output_name','overwrite'], 'UNSUPPORTED_PARAMETER');
    assert(p.mode === 'copy' && p.format === 'dxf' && p.overwrite === false, 'SAVE_COPY_ONLY');
    assert(typeof p.output_name === 'string' && FILE_NAME.test(p.output_name), 'INVALID_OUTPUT_NAME');
    assert(p.output_name.toLowerCase() !== sourceName.toLowerCase(), 'SOURCE_OVERWRITE');
    assert(!knownFileNames.some(name=>name.toLowerCase()===p.output_name.toLowerCase()), 'OUTPUT_ALREADY_EXISTS');
    return {mode:'copy',format:'dxf',output_name:p.output_name,overwrite:false};
  }
  throw new Refused('TOOL_NOT_ALLOWED');
}

/** Only shadow/dry-run policy evaluation; does not mutate session or execute. */
export function authorizeMobileCadRequest(input) {
  try {
    assert(isObj(input), 'INVALID_REQUEST');
    const {authenticatedOwnerId, expectedOwnerId, session, tool, parameters = {},
      expectedSourceSha256, expectedRevision, idempotencyKey, nowMs,
      consumedKeys = [], knownFileNames = []} = input;
    assert(typeof authenticatedOwnerId === 'string' && authenticatedOwnerId.length > 0 &&
       authenticatedOwnerId === expectedOwnerId, 'OWNER_AUTH_REQUIRED');
    assert(isObj(session) && typeof session.ownerId === 'string' &&
       session.ownerId === authenticatedOwnerId, 'SESSION_OWNER_MISMATCH');
    assert(typeof session.id === 'string' && /^[a-f0-9-]{36}$/i.test(session.id), 'INVALID_SESSION');
    assert(session.state === 'active' && Number.isSafeInteger(session.expiresAtMs) &&
       Number.isSafeInteger(nowMs) && nowMs >= 0 && session.expiresAtMs > nowMs &&
       session.expiresAtMs - nowMs <= 15 * 60 * 1000, 'SESSION_EXPIRED');
    assert(typeof session.sourceName === 'string' && FILE_NAME.test(session.sourceName), 'INVALID_SOURCE_NAME');
    assert(typeof session.sourceSha256 === 'string' && SHA256.test(session.sourceSha256) &&
       typeof expectedSourceSha256 === 'string' &&
       session.sourceSha256.toLowerCase() === expectedSourceSha256.toLowerCase(), 'SOURCE_REVISION_MISMATCH');
    assert(Number.isSafeInteger(session.revision) && session.revision >= 0 &&
       expectedRevision === session.revision, 'STALE_SESSION_REVISION');
    assert(TOOLS.has(tool), 'TOOL_NOT_ALLOWED');
    const isWrite = WRITE_TOOLS.includes(tool);
    if (isWrite) {
       assert(typeof idempotencyKey === 'string' && REQUEST_KEY.test(idempotencyKey), 'IDEMPOTENCY_KEY_REQUIRED');
       assert(Array.isArray(consumedKeys) && !consumedKeys.includes(idempotencyKey), 'REPLAY_DENIED');
    }
    assert(Array.isArray(knownFileNames), 'INVALID_FILE_REGISTRY');
    const params = sanitize(tool, parameters, session.sourceName, knownFileNames);
    return {allowed:true, tool, params, ownerId:authenticatedOwnerId,
      sessionId:session.id, sourceSha256:session.sourceSha256,
      expectedRevision, requiresWriteLease:isWrite, idempotencyKey:isWrite?idempotencyKey:null,
      note:'SHADOW-ONLY. Executor must atomically claim idempotency, check revision/hash, enforce owner lease, save new copy, independently reopen and verify.'};
  } catch (e) {
    return {allowed:false,code:e instanceof Refused ? e.code : 'INVALID_REQUEST'};
  }
}
