// Cloudflare Worker — OpenCode Zen 무료 티어 게이트 프록시
// 12errh/zen-proxy 로직을 Worker로 이식 (로컬 iSH 제약 우회용)
import { shapeBody, ensureTools, mintSession } from "./logic.mjs";

const UPSTREAM = "https://opencode.ai";

function gateHeaders(session) {
  return {
    authorization: "Bearer public",
    "content-type": "application/json",
    "user-agent": "opencode/latest/2.1.4/cli",
    "x-opencode-client": "cli",
    "x-opencode-session": session,
    "x-opencode-session-id": session,
    "x-session-affinity": session,
    "x-session-id": session,
    "x-opencode-project": "global",
  };
}

async function collectSSE(response) {
  const text = await response.text();
  const chunks = [];
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const data = l.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const j = JSON.parse(data);
      if (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) {
        chunks.push(j.choices[0].delta.content);
      }
      if (j.usage) chunks.push(`\n<usage>${JSON.stringify(j.usage)}</usage>`);
    } catch {}
  }
  return chunks.join("");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const session = mintSession();

    // CORS (선택)
    if (req.method === "OPTIONS") {
      return new Response("", { status: 204 });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, upstream: UPSTREAM, time: new Date().toISOString() });
    }

    if (url.pathname === "/v1/models") {
      const r = await fetch(`${UPSTREAM}/inference/v1/models`, { headers: { ...gateHeaders(session) } });
      return new Response(r.body, { status: r.status, headers: passHeaders(r) });
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return err(400, "invalid json"); }
      const payload = shapeBody(body, session);
      const r = await fetch(`${UPSTREAM}/inference/openai/v1/chat/completions`, {
        method: "POST",
        headers: gateHeaders(session),
        body: JSON.stringify(payload),
      });
      const wantStream = String(req.headers.get("accept") || "").includes("text/event-stream");
      if (r.ok && !wantStream) {
        const text = await collectSSE(r);
        return json({ id: `chatcmpl-zen-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now()/1000), model: body.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: {} });
      }
      return new Response(r.body, { status: r.status, headers: passHeaders(r) });
    }

    return err(404, "not found");
  },
};

function passHeaders(r) {
  const h = new Headers();
  for (const [k, v] of r.headers) {
    if (!/content-encoding|transfer-encoding/i.test(k)) h.set(k, v);
  }
  return h;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
function err(status, message) {
  return json({ error: { message } }, status);
}