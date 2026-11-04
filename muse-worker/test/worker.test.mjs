import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { chatToResponses, readSSE } from '../src/worker.mjs';

const env = { CALLER_BEARER_SECRET: 'test-caller-secret', MUSE_API_KEY: 'test-upstream-key' };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const req = (path, body, auth = env.CALLER_BEARER_SECRET) => new Request('https://worker.test' + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
});
const upstreamJSON = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json', ...headers }
});
const functionTool = name => ({ type: 'function', function: { name } });
const sse = data => new ReadableStream({ start(c) {
  for (const byte of new TextEncoder().encode(data)) c.enqueue(Uint8Array.of(byte));
  c.close();
}});

test('fails closed without separate caller secret and rejects missing/wrong credentials', async () => {
  let calls = 0; globalThis.fetch = () => { calls++; };
  for (const secret of [null, '', 'wrong', env.MUSE_API_KEY]) {
    assert.equal((await worker.fetch(req('/v1/models', undefined, secret), env)).status, 401);
  }
  assert.equal((await worker.fetch(req('/v1/models'), { MUSE_API_KEY: 'k' })).status, 503);
  assert.equal((await worker.fetch(req('/v1/models'), { CALLER_BEARER_SECRET: 'x', MUSE_API_KEY: 'x' })).status, 503);
  assert.equal(calls, 0);
});

test('chat conversion preserves history, trims prioritized tools and renames selected tool choice', () => {
  const { payload } = chatToResponses({ model: 'muse-spark-1.3-contributor', max_tokens: 12,
    messages: [{ role: 'system', content: 'rule' }, { role: 'developer', content: 'extra' },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'read_file', arguments: '{"p":1}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'result' }],
    tools: ['other', 'read_file', 'bash', 'repl', 'write_file', 'edit_file', 'bash'].map(functionTool),
    tool_choice: { type: 'function', function: { name: 'read_file' } } });
  assert.equal(payload.model, 'muse-spark-1.3-contributor');
  assert.equal(payload.instructions, 'rule\n\nextra');
  assert.equal(payload.max_output_tokens, 4096);
  assert.deepEqual(payload.input.slice(-2), [{ type: 'function_call', call_id: 'c1', name: 'client_read_file', arguments: '{"p":1}' },
    { type: 'function_call_output', call_id: 'c1', output: 'result' }]);
  assert.deepEqual(payload.tools.map(t => t.name), ['repl', 'client_read_file', 'client_bash', 'client_write_file', 'client_edit_file']);
  assert.deepEqual(payload.tool_choice, { type: 'function', name: 'client_read_file' });
  assert.throws(() => chatToResponses({ tools: ['read_file', 'client_read_file'].map(functionTool) }), /ambiguous/);
  assert.throws(() => chatToResponses({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: {} }] }] }), /text/);
});

test('successful non-stream chat uses correct upstream authentication and restores tools', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.meta.ai/v1/responses');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.authorization, 'Bearer ' + env.MUSE_API_KEY);
    assert.equal(JSON.parse(options.body).tools[0].name, 'client_read_file');
    return upstreamJSON({ id: 'r1', model: 'muse-spark-1.3-contributor', output: [
      { type: 'message', content: [{ type: 'output_text', text: 'hello' }] },
      { type: 'function_call', call_id: 'c1', name: 'client_read_file', arguments: '{}' }],
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } });
  };
  const r = await worker.fetch(req('/v1/chat/completions', { messages: [], tools: [functionTool('read_file')] }), env);
  const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.model, 'muse-spark-1.3-contributor');
  assert.equal(j.choices[0].message.tool_calls[0].function.name, 'read_file');
  assert.equal(j.choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(j.usage, { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 });
});

test('models, upstream errors and invalid inputs are handled', async () => {
  globalThis.fetch = async () => upstreamJSON({ data: [{ id: 'muse-spark-1.3' }] });
  assert.equal((await (await worker.fetch(req('/v1/models'), env)).json()).data[0].id, 'muse-spark-1.3');
  globalThis.fetch = async () => upstreamJSON({ error: { message: 'quota ' + env.MUSE_API_KEY } }, 429, { 'retry-after': '9' });
  const r = await worker.fetch(req('/v1/chat/completions', { messages: [] }), env);
  assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '9');
  assert.equal((await r.json()).error.message, 'quota [redacted]');
  assert.equal((await worker.fetch(req('/v1/chat/completions', '{'), env)).status, 400);
  assert.equal((await worker.fetch(req('/v1/unknown'), env)).status, 404);
  globalThis.fetch = async () => { throw new Error('secret'); };
  assert.equal((await worker.fetch(req('/v1/models'), env)).status, 502);
});

test('refresh mints and retries once using request-local fake key', async () => {
  const calls = [];
  const e = { ...env, MUSE_REFRESH_TOKEN: 'test-refresh-token' };
  globalThis.fetch = async (url, opts) => {
    calls.push([url, opts.headers.authorization]);
    if (calls.length === 1) return upstreamJSON({ error: 'expired' }, 401);
    if (calls.length === 2) return upstreamJSON({ api_key: 'minted-test-key-1234567890' });
    return upstreamJSON({ data: [] });
  };
  assert.equal((await worker.fetch(req('/v1/models'), e)).status, 200);
  assert.deepEqual(calls.map(x => x[1]), ['Bearer ' + e.MUSE_API_KEY, 'Bearer ' + e.MUSE_REFRESH_TOKEN, 'Bearer minted-test-key-1234567890']);
  assert.equal(calls[1][0], 'https://api.meta.ai/muse-code/key');
});

test('SSE parser handles one-byte UTF-8, CRLF, multiline data and DONE', async () => {
  const stream = sse(': comment\r\ndata: {"text":\r\ndata: "안녕 🌱"}\r\n\r\ndata:[DONE]\n\ndata: ignored\n\n');
  const events = [];
  for await (const e of readSSE(stream.getReader())) events.push(JSON.parse(e));
  assert.deepEqual(events, [{ text: '안녕 🌱' }]);
});

test('streaming translates tokens, tool calls, usage and DONE', async () => {
  const events = [
    { type: 'response.created', response: { id: 'r-stream', model: 'muse-spark-1.3-contributor' } },
    { type: 'response.output_text.delta', delta: '안녕 🌱' },
    { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'client_read_file', arguments: '{}' } },
    { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } }
  ];
  globalThis.fetch = async (_url, opts) => {
    assert.equal(JSON.parse(opts.body).stream, true);
    return new Response(sse(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n'),
      { headers: { 'content-type': 'text/event-stream' } });
  };
  const r = await worker.fetch(req('/v1/chat/completions', { stream: true, messages: [], tools: [functionTool('read_file')] }), env);
  assert.equal(r.status, 200);
  const eventsOut = []; for await (const e of readSSE(r.body.getReader())) eventsOut.push(JSON.parse(e));
  assert.equal(eventsOut[0].id, 'r-stream'); assert.equal(eventsOut[1].choices[0].delta.content, '안녕 🌱');
  assert.equal(eventsOut[2].choices[0].delta.tool_calls[0].function.name, 'read_file');
  assert.equal(eventsOut[3].choices[0].finish_reason, 'tool_calls');
  assert.equal(eventsOut[3].usage.total_tokens, 3);
});

test('truncated and failed streams do not pretend success', async () => {
  for (const message of [
    'data: [DONE]\n\n',
    'data: ' + JSON.stringify({ type: 'response.failed', response: { error: { message: 'failure' } } }) + '\n\n'
  ]) {
    globalThis.fetch = async () => new Response(sse(message), { headers: { 'content-type': 'text/event-stream' } });
    const r = await worker.fetch(req('/v1/chat/completions', { stream: true, messages: [] }), env);
    const out = await r.text(); assert.match(out, /"error"/); assert.match(out, /\[DONE\]/); assert.doesNotMatch(out, /"finish_reason":"stop"/);
  }
});

test('streaming propagates pre-header HTTP error and rejects non-SSE success', async () => {
  globalThis.fetch = async () => upstreamJSON({ error: { message: 'no' } }, 403);
  let r = await worker.fetch(req('/v1/chat/completions', { stream: true, messages: [] }), env);
  assert.equal(r.status, 403); assert.equal((await r.json()).error.message, 'no');
  globalThis.fetch = async () => upstreamJSON({ unexpected: true });
  r = await worker.fetch(req('/v1/chat/completions', { stream: true, messages: [] }), env);
  assert.equal(r.status, 502);
});

test('SSE incomplete maps to length and preserves explicit error events', async () => {
  const event = { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } };
  globalThis.fetch = async () => new Response(sse('data: ' + JSON.stringify(event) + '\n\n'), { headers: { 'content-type': 'text/event-stream' } });
  const r = await worker.fetch(req('/v1/chat/completions', { stream: true, messages: [] }), env);
  const text = await r.text(); assert.match(text, /"finish_reason":"length"/); assert.match(text, /\[DONE\]/);
});

test('SSE accepts multiple small events in a single large network chunk', async () => {
  const data = ':'.repeat(1024) + '\n\ndata: {}\n\n';
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(data.repeat(2100))); c.close(); } });
  let count = 0; for await (const event of readSSE(stream.getReader())) { assert.equal(event, '{}'); count++; }
  assert.equal(count, 2100);
});
