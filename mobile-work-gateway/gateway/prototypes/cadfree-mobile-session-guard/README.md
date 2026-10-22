# Power-CAD mobile session preflight — shadow-only

**2026-10-22** · Project `khs0927/jev-browser-control-plane` · prototype branch only. No production wiring, deploy or changes to main.

## Tested outcome

`node --test cadfree-session-policy.test.mjs` → **38 passed, 0 failed, 0 skipped** (Node 22.16.0). This validates the pure, deterministic policy contract, not remote service auth or CAD execution.

## Existing verified components

- GPT Router Mobile Work Gateway v0.2.0: GitHub-owner OAuth/authentication works and `powercad_generate_dxf` returns new 2D DXF; direct Cloudflare Worker subset only. An example 10,000×8,000 mm test produced a 447-byte DXF with SHA-256 `98dd8a3ec7aca09581a6290cac92a6e012a0ce502f9f100b814aa8cd952305f3` (independent local reopen in prior turn).
- Windows CAD-free .NET 10 isolated E2E (prior real execution): C# build 0 errors; full xUnit 299/300 passed and 1 skipped; MCP stdio exposes 85 tools and write commands `cad_create`, `cad_create_many`, `cad_move`, `cad_copy`, `cad_save` produced new DXF, independently reopened with ezdxf; source SHA unchanged.
- Current remote PC device offline at time of this preflight; no live C# bridge endpoint exists.

## Authorization and routing contract (NOT YET IMPLEMENTED)

1. iPhone ChatGPT → owner's authenticated HTTPS GPT Router `/mcp`; existing Worker validates GitHub OAuth identity and tool scope.
2. Owner-bound *persistent* session store (D1 or single-owner DO, only if free quota verified) loads session record by opaque ID. Never trust client-provided `ownerId`, SHA, revision, expiry or lease as authority. No bearer tokens in logs.
3. Recheck OAuth owner, session owner, source immutable SHA, expected revision, expiry, allowed command schema, positive idempotency key and output collision. This prototype implements only these **pure validation checks**, assuming the session record is trusted.
4. Atomic owner-bound write lock and idempotency reservation in persistent storage. Reject duplicate or concurrent writes and stale source revisions. No in-memory-only locks in live Workers.
5. A private, authenticated named-tunnel/service-binding route to a **real .NET10 stateful stdio session broker** with owner/identity affinity (if a free always-available runner is verified). The Worker **does not run .NET**, and a stateless Worker cannot preserve the .NET process state by itself.
6. The broker binds or rebinds the document after target selection, delegates to `cad_*` allowlist, permits `cad_save` only to new file in isolated workspace, checks source SHA afterward and uses `ezdxf` readback (count, geometry, units, layers, properties, hash) before returning a result.
7. Explicit human approval gates for production deploy, owner scope/billing changes or any non-copy save. No unsupported tool proxies, no external secrets in repo, no arbitrary Windows path in mobile input.

## Current software boundary

- `cadfree-session-policy.mjs` authorizes a **mock trusted session record** and returns a proposed routing decision. It never uses secrets or calls CAD; it is NOT imported from `gateway/src/mcp.ts` or `worker.ts`.
- Tests are intentionally standard Node built-ins (`node:test`, `assert`), no installed dependencies, no cloud actions, no paid model inference.
- MCP actual `cad_inspect` parameter shape must be checked before integrating (previous stdio command returned an inventory; other cases differed). The policy schema is a minimal bounded prototype and not full 79-tool parity.
- `cadfree_generate_dxf` on the Worker is already production-enabled but is distinct from the C# DXF backend. Never represent this prototype as enabling mobile `cad_move`/`cad_save`.

## Security acceptance gates still C-BLOCKED

1. Real OAuth token + session owner mismatch / forged principal tests at `/mcp`.
2. Free-tier persistent state capability, atomic lease + replay/idempotency, idle expiration, restart durability.
3. Authenticated Worker ↔ PC broker handshake and per-user stateful stdio affinity across multiple HTTP requests.
4. End-to-end real file save-copy with independent re-open and source revision verified from the iPhone.
5. Coverage of allowed `cad_*` parameter schemas against 85-tool .NET10 MCP actual listings.
6. Mobile UX, private download channel, Korean font rendering and app access verification.
7. GitHub branch review and explicit user approval before any production deploy or merge.

## Independent AI and JEV check

- AI Council independently ran **Nemotron 3 Ultra 550B** and **Meta Muse Glimmer 30B**. Both favor fail-closed owner session binding, mock-only development, and no deployment until real OAuth/multi-request tests pass. This does not replace deterministic code verification.
- JEV Decision MCP `jev_status`: `configured`, model `jev-1.13.0`, provider `TypeSafe official SDK`, `billing=provider-metered`, `free_entitlement_verified=false`, `live_inference_verified=false`, thresholds uncalibrated. **No JEV chargeable inference was made** under user's free-only instruction. Use static safety gates instead until free entitlement is verified.

## Commands

```shell
node --test cadfree-session-policy.test.mjs
```

The prototype is harmless: no main merge, deploy, data deletion, permission change, payment, private key handling, original DWG/DXF mutation, or model provider calls.