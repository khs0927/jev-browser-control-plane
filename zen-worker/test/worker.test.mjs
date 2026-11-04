import { test } from "node:test";
import assert from "node:assert/strict";

// 로직만 검증 (네트워크 호출 없이) — worker.mjs에서 내보낸 순수 함수 사용
import { shapeBody, ensureTools, mintSession } from "../src/logic.mjs";

test("mintSession: ses_ + 12hex + 14 base62", () => {
  const s = mintSession();
  assert.ok(s.startsWith("ses_"));
  assert.equal(s.length, 4 + 12 + 14);
  assert.match(s.slice(4, 16), /^[0-9a-f]{12}$/);
});

test("shapeBody: system= preamble, tools에 bash/read 보강", () => {
  const b = shapeBody(
    { model: "big-pickle", messages: [{ role: "user", content: "hi" }], tools: [] },
    "ses_test"
  );
  assert.equal(b.messages[0].role, "system");
  assert.ok(b.messages[0].content.length > 1000);
  const names = b.tools.map((t) => (t.function || t).name);
  assert.ok(names.includes("bash"));
  assert.ok(names.includes("read"));
  assert.equal(b.stream, true);
});

test("ensureTools: 기존 tools 보존 + 중복 없이 보강", () => {
  const t = ensureTools([{ type: "function", function: { name: "grep" } }]);
  const names = t.map((x) => (x.function || x).name);
  assert.ok(names.includes("grep"));
  assert.ok(names.includes("bash"));
  assert.ok(names.includes("read"));
  assert.equal(names.filter((n) => n === "bash").length, 1);
});
