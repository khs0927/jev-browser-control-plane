---
name: jev-decision
description: Prepare or request bounded Jev Noul, Choice, Score and shared-state batch decisions through a verified private MCP connection. Check connection status before using Jev.
---

# JEV Decision

This release is UNCONNECTED. Gateway source is bundled, but no live MCP URL,
OAuth connection or mobile operation is verified.
Never claim Jev ran, or fabricate answers. If no Jev MCP tools are available,
state the connection is pending and prepare the request only.

When a verified connection is present:
1. Call `jev_status` first. Stop inference if access is not configured or inference
   is not enabled. Official TypeSafe calls are provider-metered; respect a user
   request for free-only use and never imply a free entitlement. No subscriptions
   or alternate providers are authorized by this Skill.
2. Supply minimal text or JSON state and atomic questions. JEV is a structured
   judgment tool, never a conversational model or tool executor.
3. Use `jev_noul` for a yes/no statement's probability in [0,1]. It has NO
   confidence field. Do not derive or invent one.
4. Use `jev_choice` for named options; use `jev_score` for an ordered rubric of
   2–10 levels. Preserve fractional scores, distributions and reported model.
5. Use `jev_batch` for independent questions sharing one state. It maps to a
   single official `system_one` request, not an undocumented upstream endpoint.
6. Treat every threshold, including 0.85, as uncalibrated configuration until
   representative evaluation establishes it. A decision does not verify facts,
   establish permissions or prove task completion.
7. Report verified tool results separately from prepared requests or test
   fixtures. Model judgments are advisory; existing user authorization still
   governs external actions.

Never read, request, echo or store API keys in chat, this Skill or logs. Keys
must be injected server-side from the existing authorized secret store.
On authentication/cost failures stop that stage and report it; do not switch
providers, retry remote access, weaken OAuth or expose exception bodies.

Provenance: `khs0927/jev-browser-control-plane` at
`5023ee0d5ef097cd66b0bad1893876dc39c11e10`; official `typesafe-sdk==0.7.1`.
Contract: https://docs.typesafe.ai/api and https://docs.typesafe.ai/models.
