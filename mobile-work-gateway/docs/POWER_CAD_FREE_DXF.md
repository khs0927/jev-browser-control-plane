# Power-CAD Free 2D DXF for iPhone (Draft)

Owner-authenticated Cloudflare Mobile Work Gateway tool: `powercad_generate_dxf`.

## Deployment contract

1. This code remains disabled unless the Worker configuration explicitly sets `POWER_CAD_FREE_DXF_ENABLED=true`. Do not enable without a separate reviewed release.
2. The existing GitHub OAuth owner check in `src/worker.ts` precedes MCP calls. No anonymous CAD endpoint is added. Consent wording includes this capability only when enabled.
3. Supported entity kinds: `line`, `polyline`, `circle`, `arc`, `text`; input units are millimetres. A new DXF R2013 (`AC1027`, `$INSUNITS=4`) is generated in memory, with SVG text preview and SHA-256. One request is limited to 120 entities, bounded coordinates and 64 KiB DXF.
4. No user-supplied file path, existing-file read/write, shell, Docker, GitHub Actions, paid VPS, CAD application, .NET runner or external file hosting is used by this tool. The output does **not** claim native Power-CAD DWG fidelity.
5. The MCP response returns `dxf_text` and `svg_preview` as data. It does **not** currently create a durable download URL. ChatGPT or another trusted client must save the response into a new file, re-read and hash-check it, and make the link available to the iPhone user.
6. Korean TXT is serialized with DXF `\\U+XXXX` Unicode escapes. The independent codepoint decoder can reconstruct the original Korean, but a mobile viewer may still show `??` when the CAD font is unavailable. SVG text preview uses system fonts as a separate check; a font-display test in the user's actual viewer is outstanding.

## Required release gates

- `cd mobile-work-gateway/gateway && npm ci && npm run check && npm test && npm run build`
- Feature flag unset: previously exposed tools only; flag set: precisely one `powercad_generate_dxf` tool added. Both exercised under owner-scoped MCP.
- Independent offline ezdxf parsing of the **branch output**, verify 5 object kinds, `$INSUNITS=4`, Unicode escapes and `doc.audit().errors==0`.
- Verify end-to-end new DXF can be saved/opened on iPhone; confirm file SHA after download. Do not infer download success from MCP return alone.
- Actual native DWG/.NET and complete `cad_draw` remain under Power-CAD PR #57/#68/#74 with separate runner security and downloadable artifact acceptance.

## Status (2026-10-15)

- This repository change is Draft PR only: no running Worker version, OAuth settings or production feature flag changed.
- Comparable standalone TypeScript/Node prototype: 13/13 local unit tests; independent ezdxf synthetic drawing 5 object types, mm units, audit errors 0. This is not identical-commit PR CI evidence.
- Keep the feature opt-in OFF until the exact GitHub head passes tests and the user approves release. Never mark customer delivery approved merely because a DXF parser accepts a synthetic sample.
