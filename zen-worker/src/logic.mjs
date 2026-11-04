import { PREAMBLE } from "./preamble.js";
import agentTools from "./tools.js";

const TOOLS = agentTools.tools || agentTools;
const REQUIRED_TOOLS = ["bash", "read"];
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function mintSession() {
  const t = (BigInt(0x1b000000046ffe) - BigInt(Date.now()) * 4096n) % (2n ** 48n);
  const hex = t.toString(16).padStart(12, "0").slice(-12);
  let rnd = "";
  for (let i = 0; i < 14; i++) rnd += B62[Math.floor(Math.random() * B62.length)];
  return `ses_${hex}${rnd}`;
}

export function ensureTools(tools) {
  const arr = Array.isArray(tools) ? tools.map((t) => ({ ...t })) : [];
  const names = new Set(arr.map((t) => (t.function || t).name));
  for (const n of REQUIRED_TOOLS) {
    if (!names.has(n)) {
      const src = TOOLS.find((t) => (t.function || t).name === n);
      if (src) arr.push(JSON.parse(JSON.stringify(src)));
    }
  }
  return arr;
}

export function shapeBody(body, session) {
  const out = { ...body };
  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  out.messages = [{ role: "system", content: PREAMBLE }, ...messages.filter((m) => m.role !== "system")];
  out.tools = ensureTools(body.tools);
  out.stream = true;
  return out;
}
