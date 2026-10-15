# Power-CAD synthetic DXF MCP canary (draft)

This changes only the **existing** `jev-browser-control-plane/mobile-work-gateway` source on a feature branch. No production deploy, new paid host, Power-CAD main merge, user CAD file, or OAuth setting has been changed.

## Security and scope

- New tool `cad_fixture_dxf` is registered **only** when Worker variable `CAD_FIXTURE_ENABLED=true`. With the setting absent, the existing nine tools remain unchanged.
- Same existing owner-bound `/mcp` OAuth gate applies; no new public endpoint or upload path is added.
- Allowed synthetic templates: `rectangle`, `korean-label`. Dimension arguments are bounded integer millimeters (100–20000). No arbitrary entity/path, disk write, DWG import/export, or native AutoCAD invocation.
- Returns a small DXF text envelope, deterministic SHA-256, output byte count, `fixture_only`, `independently_verified=false`, and `customer_delivery_approved=false`.
- This is a **canary**, not the HS-STEEL `hs-steel-draw-plan/1` full `cad_draw` tool in Power-CAD PR #68. Do not silently substitute it for production CAD generation.

## Validation required before deployment

1. Run `cd mobile-work-gateway/gateway && npm ci && npm run check && npm test` on this branch outside exhausted Power-CAD Actions quota.
2. Execute `cad-fixture.test.ts` plus pre-existing MCP tool-list/OAuth regression tests. With flag unset there must be 9 tools; flag set there must be 10, including only `cad_fixture_dxf`.
3. Generate DXF and verify with **independent ezdxf**: `AC1027`, `$INSUNITS=4`, four LINE entities (plus TEXT for Korean template), `doc.audit().errors == 0`, UTF-8 recovery.
4. Before enabling the flag, independently review OAuth consent language and confirm production rollout. Never expose a direct unauthenticated URL.
5. Only after the canary passes, work on PR #57/#68's HMAC-protected runner, canonical digest, result delivery, actual Power-CAD/EZDxf independent E2E, and ChatGPT/iPhone testing.

## Evidence boundary

The initial 2026-10-15 proof uses a **representative** minimal DXF written outside the Worker module and opened via ezdxf 1.4.4 (4 LINE entities, units 4, audit 0 errors). This is not yet execution of the registered MCP tool. GitHub source review confirms branch files, not a live deployment. Keep this distinction in all status reports.

GitHub Actions usage failures remain unresolved; this feature branch uses `[skip ci]` commit messages to avoid unnecessary CI attempts. Do not merge based on skipped checks.
