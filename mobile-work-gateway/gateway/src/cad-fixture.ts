// Deterministic CAD-free DXF canary. This is NOT the signed Power-CAD DrawPlan runner.
// Deliberately limited to synthetic geometry: no arbitrary entities, paths, downloads or DWG writes.
type Fixture = "rectangle" | "korean-label";
export interface FixtureRequest { template: Fixture; width_mm?: number; height_mm?: number; }
export class FixtureError extends Error {}
const MIN = 100, MAX = 20000;
function dimension(value: unknown, fallback: number): number {
  const number = value === undefined ? fallback : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < MIN || number > MAX)
    throw new FixtureError("dimensions must be integer millimeters 100..20000");
  return number;
}
function pair(code: number, value: string | number): string[] {
  return [String(code), String(value)];
}
function line(x0: number, y0: number, x1: number, y1: number): string[] {
  return [...pair(0, "LINE"), ...pair(8, "0"), ...pair(10, x0), ...pair(20, y0),
    ...pair(30, 0), ...pair(11, x1), ...pair(21, y1), ...pair(31, 0)];
}
function text(value: string, x: number, y: number): string[] {
  return [...pair(0, "TEXT"), ...pair(8, "0"), ...pair(10, x), ...pair(20, y),
    ...pair(30, 0), ...pair(40, 120), ...pair(1, value)];
}
export async function createCadFixture(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FixtureError("invalid request");
  const request = raw as Record<string, unknown>;
  if (Object.keys(request).some(key => !["template","width_mm","height_mm"].includes(key)))
    throw new FixtureError("unexpected fields");
  if (request.template !== "rectangle" && request.template !== "korean-label")
    throw new FixtureError("unsupported template");
  const width = dimension(request.width_mm, 6000), height = dimension(request.height_mm, 4000);
  // Keep every coordinate within the verified millimeter envelope.
  const entities = [...line(0,0,width,0), ...line(width,0,width,height),
    ...line(width,height,0,height), ...line(0,height,0,0)];
  if (request.template === "korean-label") entities.push(...text("한글 검증", 100, 100));
  const groups = [...pair(0,"SECTION"), ...pair(2,"HEADER"), ...pair(9,"$ACADVER"),
    ...pair(1,"AC1027"), ...pair(9,"$INSUNITS"), ...pair(70,4),
    ...pair(9,"$DWGCODEPAGE"), ...pair(3,"UTF-8"), ...pair(0,"ENDSEC"),
    ...pair(0,"SECTION"), ...pair(2,"TABLES"), ...pair(0,"ENDSEC"),
    ...pair(0,"SECTION"), ...pair(2,"BLOCKS"), ...pair(0,"ENDSEC"),
    ...pair(0,"SECTION"), ...pair(2,"ENTITIES"), ...entities,
    ...pair(0,"ENDSEC"), ...pair(0,"EOF")];
  const dxf = groups.join("\n") + "\n";
  const bytes = new TextEncoder().encode(dxf);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2,"0")).join("");
  return { status:"fixture_only", format:"dxf", units:"mm", template:request.template,
    width_mm:width, height_mm:height, entities:request.template==="rectangle"?4:5,
    sha256, bytes:bytes.byteLength, dxf_text:dxf,
    independently_verified:false, customer_delivery_approved:false,
    warning:"Synthetic fixture only; not a signed Power-CAD DrawPlan, independent ezdxf audit, or native DWG." };
}
