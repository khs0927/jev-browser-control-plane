# Power-CAD: CAD-free architecture in Mobile Work Gateway (draft, not deployed)

## Actual existing engines
- Local/hosted Python `power-cad-mcp`: `POWER_CAD_BACKEND=dxf` selects existing ezdxf-backed full headless MCP. Supports new/open/save **DXF**, layers, primitive geometry, ellipse, point, text, MTEXT, aligned/linear DXF dimensions, hatch, blocks, entity query and transforms (move/copy/rotate/scale/mirror/offset), SVG/PDF/PNG export with installed dependencies. It does NOT require AutoCAD. For Windows force `POWER_CAD_BACKEND=dxf` to avoid COM auto-selection.
- Mobile Cloudflare Worker: current 5-primitive tool remains untouched, plus a **separate** new-file-only `powercad_generate_architectural_dxf` proposal. Both remain under owner OAuth and `POWER_CAD_FREE_DXF_ENABLED=true`.

## Architectural tool input
`{"drawing_name":"sample","entities":[{"type":"rectangle","corner1":[0,0],"corner2":[10000,8000]},{"type":"wall","start":[0,0],"end":[10000,0],"thickness":200},{"type":"door","hinge":[1000,0],"width":900,"closed_angle":0,"open_angle":90},{"type":"dimension","start":[0,0],"end":[10000,0],"offset":-1000}]}`

Supports 14 types: line, polyline, circle, arc, text, point, rectangle, polygon, wall, window, door, dimension, column, room. Semantic shapes expand into existing bounded primitive generator, preserving its DXF, SHA-256 and SVG output.
- Units: mm, coordinates <= 1,000,000 mm, max 60 semantic entities and 120 expanded primitives, max DXF output 65,536 bytes.
- Display dimensions are **not** associative DXF DIMENSIONs. These lines/text must not be represented as editable associative dimensions.
- Walls/windows/doors are schematic; insertion does not automatically cut wall openings. No zoning, structural, building code, collision, area or dimension-quality certification.
- Generates only new in-memory output; no importing/modifying existing DWG/DXF; the client saves and independently re-opens the file.

## Verification gates before activation
1. Locally run `cd mobile-work-gateway/gateway && npm ci && npm run check && npm test`, never deploy from a failed build.
2. Call MCP `initialize`, `tools/list` twice with feature flag off/on; verify new tool invisible off, visible on for OAuth owner.
3. Call `powercad_generate_architectural_dxf` with the above example through the actual deployed MCP owner connection, save returned `dxf_text`, independently reopen with `ezdxf.readfile(path)`, audit and assert entity count/types, units, coordinates, SHA-256, Korean text encoding and SVG preview.
4. Test CAD-free Python server separately with `POWER_CAD_BACKEND=dxf` and an isolated temporary workspace and headless roundtrip for edits, hatches, blocks, native dimensions. Do not treat Worker subset as equal to full Python server.
5. No main merge, Worker deployment, OAuth scope changes, backend remote exposure or production activation without explicit user approval and verified free usage.

## Remaining interoperability
- To offer **all** Python `cad_*` tools on iPhone, host the existing Python MCP server on an already owned free self-hosted machine/VPS behind a validated OAuth/Access gateway, with per-user isolated workspace, path sandbox, job budget, and no overwrite default. This adapter is **not** implemented in this draft.
- Advanced native DWG parity remains unverified; keep DWG a separate optional converter/ACadSharp path with independent read-back and format fidelity checks.
