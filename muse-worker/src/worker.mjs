const UPSTREAM = 'https://api.meta.ai';
const DEFAULT_MODEL = 'muse-spark-1.3';
const COLLIDING = new Set(['read_file', 'bash', 'write_file', 'edit_file', 'write_todos',
  'web_search', 'tool_search', 'subagent_send_message', 'subagent_cancel', 'workflow']);
const PRIORITY = ['repl', 'read_file', 'bash', 'write_file', 'edit_file', 'webfetch',
  'websearch', 'get_time', 'memory_search', 'history_search', 'message_agent',
  'search_tools', 'bash_interact'];
const encoder = new TextEncoder();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const error = (message, status) => json({ error: { message } }, status);
const rename = name => COLLIDING.has(name) ? `client_${name}` : name;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Web Crypto verifies a fixed-length MAC without a JS byte-by-byte comparison.
async function sameSecret(a, b) {
  const key = await crypto.subtle.importKey('raw', encoder.encode('muse-router-compare-v1'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(a));
  return crypto.subtle.verify('HMAC', key, mac, encoder.encode(b));
}

function redact(value, secrets) {
  if (typeof value === 'string') {
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
      value = value.replaceAll(secret, '[redacted]');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (isObject(value)) return Object.fromEntries(Object.entries(value)
    .map(([k, v]) => [redact(k, secrets), redact(v, secrets)]));
  return value;
}

function contentText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => {
    if (typeof part === 'string') return part;
    if (isObject(part) && typeof part.text === 'string') return part.text;
    throw new Error('only text content parts are supported');
  }).join('');
  if (isObject(content) && typeof content.text === 'string') return content.text;
  throw new Error('only text content is supported');
}

export function chatToResponses(req) {
  if (!isObject(req)) throw new Error('request must be a JSON object');
  if (req.messages != null && !Array.isArray(req.messages)) throw new Error('messages must be an array');
  if (req.tools != null && !Array.isArray(req.tools)) throw new Error('tools must be an array');
  if (req.stream != null && typeof req.stream !== 'boolean') throw new Error('stream must be a boolean');
  const model = req.model || DEFAULT_MODEL;
  if (typeof model !== 'string') throw new Error('model must be a string');

  const names = new Map();
  const register = name => {
    if (typeof name !== 'string' || !name) throw new Error('function name must be a non-empty string');
    const mapped = rename(name);
    if (names.has(mapped) && names.get(mapped) !== name) {
      throw new Error(`ambiguous tool names after Muse renaming: ${mapped}`);
    }
    names.set(mapped, name);
    return mapped;
  };
  const instructions = [], input = [];
  for (const m of req.messages || []) {
    if (!isObject(m)) throw new Error('each message must be an object');
    const text = contentText(m.content);
    if (m.role === 'system' || m.role === 'developer') {
      if (text) instructions.push(text);
    } else if (m.role === 'assistant') {
      if (text) input.push({ role: 'assistant', content: [{ type: 'output_text', text }] });
      if (m.tool_calls != null && !Array.isArray(m.tool_calls)) throw new Error('tool_calls must be an array');
      for (const tc of m.tool_calls || []) {
        if (!isObject(tc) || !isObject(tc.function) || typeof tc.id !== 'string' || !tc.id ||
            (tc.function.arguments != null && typeof tc.function.arguments !== 'string')) {
          throw new Error('invalid assistant tool call');
        }
        input.push({ type: 'function_call', call_id: tc.id, name: register(tc.function.name),
          arguments: tc.function.arguments ?? '{}' });
      }
    } else if (m.role === 'tool') {
      if (typeof m.tool_call_id !== 'string' || !m.tool_call_id) throw new Error('tool_call_id is required');
      input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: text });
    } else if (m.role === 'user' || text) {
      input.push({ role: 'user', content: [{ type: 'input_text', text }] });
    }
  }

  const seen = new Set(), chosen = [];
  for (const tool of req.tools || []) {
    if (!isObject(tool) || tool.type !== 'function') continue;
    const fn = tool.function;
    if (!isObject(fn) || typeof fn.name !== 'string' || !fn.name || seen.has(fn.name)) continue;
    seen.add(fn.name);
    chosen.push(fn);
  }
  const rank = fn => PRIORITY.includes(fn.name) ? PRIORITY.indexOf(fn.name) : PRIORITY.length;
  chosen.sort((a, b) => rank(a) - rank(b));
  const selected = chosen.slice(0, 5);
  const tools = selected.map(fn => ({ type: 'function', name: register(fn.name),
    description: fn.description || '', parameters: fn.parameters || { type: 'object', properties: {} } }));

  const rawMax = req.max_tokens || req.max_completion_tokens || req.max_output_tokens;
  const number = Number(rawMax);
  const maxTokens = rawMax && Number.isFinite(number) ? Math.max(Math.trunc(number), 4096) : 4096;
  const payload = { model, input: input.length ? input : '',
    reasoning: { effort: req.reasoning_effort || 'high' }, max_output_tokens: maxTokens, stream: false };
  if (instructions.length) payload.instructions = instructions.join('\n\n');
  if (tools.length) {
    payload.tools = tools;
    let choice = req.tool_choice;
    if (isObject(choice) && choice.type === 'function') {
      const name = choice.function?.name ?? choice.name;
      if (!selected.some(fn => fn.name === name)) throw new Error('chosen tool was not among the five retained tools');
      choice = { type: 'function', name: register(name) };
    }
    if (choice != null) payload.tool_choice = choice;
  }
  return { payload, names };
}

const restore = (name, names) => names.get(name) ?? name;
const usageOf = u => ({ prompt_tokens: u?.input_tokens ?? 0,
  completion_tokens: u?.output_tokens ?? 0, total_tokens: u?.total_tokens ?? 0 });
const finishOf = (response, hadTools) => {
  if (response?.status === 'incomplete') {
    return response.incomplete_details?.reason === 'content_filter' ? 'content_filter' : 'length';
  }
  return hadTools ? 'tool_calls' : 'stop';
};

export function responsesToChat(response, model, names = new Map()) {
  let text = '';
  const calls = [];
  for (const item of response.output || []) {
    if (item.type === 'message') {
      for (const part of item.content || []) {
        if (part.type === 'output_text' || part.type === 'text') text += part.text || '';
      }
    } else if (item.type === 'function_call') {
      calls.push({ id: item.call_id || item.id, type: 'function',
        function: { name: restore(item.name, names), arguments: item.arguments ?? '{}' } });
    }
  }
  const message = { role: 'assistant', content: text || null };
  if (calls.length) message.tool_calls = calls;
  return { id: response.id || 'chatcmpl-muse', object: 'chat.completion',
    created: Number.isFinite(response.created_at) ? Math.trunc(response.created_at) : Math.floor(Date.now() / 1000),
    model: response.model || model,
    choices: [{ index: 0, message, finish_reason: finishOf(response, calls.length > 0) }],
    usage: usageOf(response.usage) };
}

// SSE lines can be split at any byte, including inside UTF-8 and CRLF.
export async function* readSSE(reader) {
  const decoder = new TextDecoder();
  let buffer = '', data = [], eventSize = 0, eof = false;
  const limit = 2 * 1024 * 1024;
  try {
    while (true) {
      let end = buffer.search(/[\r\n]/);
      if (end < 0 || (buffer[end] === '\r' && end === buffer.length - 1 && !eof)) {
        if (end < 0 && buffer.length + eventSize > limit) throw new Error('upstream SSE event too large');
        if (eof) return; // Per SSE, an unterminated event is not dispatched.
        const next = await reader.read();
        if (next.done) {
          eof = true;
          buffer += decoder.decode();
        } else {
          buffer += decoder.decode(next.value, { stream: true });
        }
        continue;
      }
      if (end + eventSize > limit) throw new Error('upstream SSE event too large');
      const line = buffer.slice(0, end);
      const crlf = buffer[end] === '\r' && buffer[end + 1] === '\n';
      buffer = buffer.slice(end + (crlf ? 2 : 1));
      if (line === '') {
        if (data.length) {
          const text = data.join('\n');
          data = []; eventSize = 0;
          if (text.trim() === '[DONE]') return;
          yield text;
        }
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') {
          data.push(value);
          eventSize += value.length;
          if (eventSize > limit) throw new Error('upstream SSE event too large');
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
    reader.releaseLock();
  }
}

async function* chatEvents(reader, model, names, secrets) {
  let id = 'chatcmpl-muse', created = Math.floor(Date.now() / 1000);
  let started = false, hadTools = false, toolIndex = 0;
  const chunk = (delta, finish = null, usage) => {
    const result = { id, object: 'chat.completion.chunk', created, model,
      choices: [{ index: 0, delta, finish_reason: finish }] };
    if (usage !== undefined) result.usage = usage;
    return `data: ${JSON.stringify(result)}\n\n`;
  };
  const streamError = detail => `data: ${JSON.stringify({ error: redact(detail, secrets) })}\n\ndata: [DONE]\n\n`;
  try {
    for await (const data of readSSE(reader)) {
      const event = JSON.parse(data);
      if (!isObject(event)) throw new Error('invalid upstream event');
      if (event.type === 'response.created' && !started) {
        id = event.response?.id || id;
        created = Number.isFinite(event.response?.created_at) ? Math.trunc(event.response.created_at) : created;
        model = event.response?.model || model;
      } else if (event.type === 'response.output_text.delta' && event.delta) {
        if (!started) { started = true; yield chunk({ role: 'assistant' }); }
        yield chunk({ content: event.delta });
      } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
        if (!started) { started = true; yield chunk({ role: 'assistant' }); }
        hadTools = true;
        const item = event.item;
        yield chunk({ tool_calls: [{ index: toolIndex++, id: item.call_id || item.id, type: 'function',
          function: { name: restore(item.name, names), arguments: item.arguments ?? '{}' } }] });
      } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        if (!started) { started = true; yield chunk({ role: 'assistant' }); }
        yield chunk({}, finishOf(event.response, hadTools), usageOf(event.response?.usage));
        yield 'data: [DONE]\n\n';
        return;
      } else if (event.type === 'response.failed' || event.type === 'error') {
        yield streamError(event.response?.error || event.error || { message: 'upstream stream failed' });
        return;
      }
    }
    yield streamError({ message: 'upstream stream ended before completion' });
  } catch {
    yield streamError({ message: 'invalid or interrupted upstream stream' });
  }
}

function streamChat(upstream, model, names, secrets) {
  const reader = upstream.body.getReader();
  const iterator = chatEvents(reader, model, names, secrets);
  let cancelled = false;
  const body = new ReadableStream({
    async pull(controller) {
      const next = await iterator.next();
      if (cancelled) return;
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    async cancel(reason) {
      cancelled = true;
      try { await reader.cancel(reason); } catch { /* already closed */ }
      try { await iterator.return(); } catch { /* already closed */ }
    }
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store', 'x-content-type-options': 'nosniff' } });
}

const MAX_BODY = 1024 * 1024;
async function readLimited(stream, limit) {
  if (!stream) return '';
  const reader = stream.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, result = '', done = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) { done = true; break; }
      size += next.value.byteLength;
      if (size > limit) throw new RangeError('body too large');
      result += decoder.decode(next.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    if (!done) { try { await reader.cancel(); } catch { /* already closed */ } }
    reader.releaseLock();
  }
}

function upstreamHeaders(key, accept) {
  return { authorization: `Bearer ${key}`, 'x-client-id': 'tbh:exec',
    'user-agent': 'muse-build/1', 'x-api-version': '1.0.0',
    'content-type': 'application/json', accept };
}

async function callUpstream(method, path, payload, env, secrets, signal) {
  const send = key => fetch(UPSTREAM + path, { method,
    headers: upstreamHeaders(key, payload?.stream ? 'text/event-stream' : 'application/json'),
    body: payload ? JSON.stringify(payload) : undefined, redirect: 'manual', signal });
  let response = await send(env.MUSE_API_KEY);
  if (response.status !== 401 || !env.MUSE_REFRESH_TOKEN) return response;
  try {
    const mint = await fetch(UPSTREAM + '/muse-code/key', { method: 'POST',
      headers: upstreamHeaders(env.MUSE_REFRESH_TOKEN, 'application/json'), body: '{}', redirect: 'manual', signal });
    if (!mint.ok) { await mint.body?.cancel(); return response; }
    const body = JSON.parse(await readLimited(mint.body, MAX_BODY));
    if (typeof body.api_key !== 'string' || body.api_key.length < 20 || /[\r\n]/.test(body.api_key) ||
        await sameSecret(body.api_key, env.CALLER_BEARER_SECRET)) return response;
    secrets.push(body.api_key);
    const retried = await send(body.api_key);
    await response.body?.cancel();
    response = retried;
  } catch { /* Preserve the original 401 if refresh or retry fails. */ }
  return response;
}

async function upstreamError(response, secrets) {
  let body;
  try {
    const text = await readLimited(response.body, MAX_BODY);
    try { body = text ? JSON.parse(text) : {}; }
    catch { body = { error: { message: redact(text, secrets).slice(0, 300) } }; }
  } catch { body = { error: { message: 'upstream error body unavailable' } }; }
  const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
  const result = json(redact(body, secrets), status);
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d{1,9}$/.test(retryAfter)) result.headers.set('retry-after', retryAfter);
  return result;
}

export default {
  async fetch(request, env) {
    // Fail closed: access and upstream credentials must be separate non-empty secrets.
    if (typeof env.CALLER_BEARER_SECRET !== 'string' || !env.CALLER_BEARER_SECRET ||
        typeof env.MUSE_API_KEY !== 'string' || !env.MUSE_API_KEY ||
        /[\r\n]/.test(env.MUSE_API_KEY) ||
        (env.MUSE_REFRESH_TOKEN != null && (typeof env.MUSE_REFRESH_TOKEN !== 'string' ||
          !env.MUSE_REFRESH_TOKEN || /[\r\n]/.test(env.MUSE_REFRESH_TOKEN)))) {
      return error('Worker credentials are not configured', 503);
    }
    const refresh = env.MUSE_REFRESH_TOKEN;
    if (await sameSecret(env.CALLER_BEARER_SECRET, env.MUSE_API_KEY) ||
        (refresh && (await sameSecret(env.CALLER_BEARER_SECRET, refresh) ||
          await sameSecret(env.MUSE_API_KEY, refresh)))) {
      return error('Worker credentials must be distinct', 503);
    }
    const authorization = request.headers.get('authorization') || '';
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match || !await sameSecret(match[1], env.CALLER_BEARER_SECRET)) return error('unauthorized', 401);

    const path = new URL(request.url).pathname;
    if (!((path === '/v1/models' && request.method === 'GET') ||
          (path === '/v1/chat/completions' && request.method === 'POST') ||
          (path === '/debug' && request.method === 'GET'))) {
      return error('not found', 404);
    }
    const secrets = [env.CALLER_BEARER_SECRET, env.MUSE_API_KEY, refresh];
    let payload, names, model, stream = false;
    if (path === '/v1/chat/completions') {
      try {
        const req = JSON.parse(await readLimited(request.body, MAX_BODY));
        ({ payload, names } = chatToResponses(req));
        model = payload.model;
        stream = req.stream === true;
        payload.stream = stream;
      } catch (e) {
        if (e instanceof RangeError) return error('request body too large', 413);
        return error(e instanceof SyntaxError || e instanceof TypeError ? 'invalid JSON or request body' : e.message, 400);
      }
    }
    if (path === '/debug') {
      const out = {};
      try {
        const r1 = await callUpstream('GET', '/v1/models', undefined, env, secrets, request.signal);
        out.models = { status: r1.status, body: (await r1.text()).slice(0, 300) };
      } catch (e) { out.models = { error: String(e && e.message || e) }; }
      try {
        const r2 = await callUpstream('POST', '/v1/responses',
          { model: 'muse-spark-1.3', input: '2+2? numeral only', stream: false },
          env, secrets, request.signal);
        out.chat = { status: r2.status, body: (await r2.text()).slice(0, 300) };
      } catch (e) { out.chat = { error: String(e && e.message || e) }; }
      try {
        const r3 = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
        out.trace = { status: r3.status, body: (await r3.text()).slice(0, 200) };
      } catch (e) { out.trace = { error: String(e && e.message || e) }; }
      return json(out, 200);
    }
    let upstream;
    try {
      upstream = await callUpstream(path === '/v1/models' ? 'GET' : 'POST',
        path === '/v1/models' ? '/v1/models' : '/v1/responses', payload, env, secrets, request.signal);
    } catch {
      return error('upstream connection failed', 502);
    }
    if (upstream.status !== 200) {
      if (upstream.status >= 300 && upstream.status < 400) return error('upstream redirect refused', 502);
      return upstreamError(upstream, secrets);
    }
    if (stream) {
      if (!/^text\/event-stream(?:\s*;|\s*$)/i.test(upstream.headers.get('content-type') || '') || !upstream.body) {
        try { await upstream.body?.cancel(); } catch { /* already closed */ }
        return error('invalid upstream stream', 502);
      }
      return streamChat(upstream, model, names, secrets);
    }
    try {
      const body = JSON.parse(await readLimited(upstream.body, MAX_BODY));
      if (!isObject(body)) throw new Error('expected object');
      if (path === '/v1/models') return json(body);
      if (body.error || body.status === 'failed') {
        return json({ error: redact(body.error || { message: 'upstream response failed' }, secrets) }, 502);
      }
      return json(responsesToChat(body, model, names));
    } catch {
      return error('invalid upstream JSON response', 502);
    }
  }
};
