/**
 * Registration-only Power-CAD MCP contract.
 *
 * This module deliberately has NO outbound executor or filesystem write. The
 * future HMAC/HTTPS runner adapter must be reviewed and deployed separately.
 * The tool is not exposed unless CAD_DRAW_ENABLED is explicitly "true", and
 * requests can only reach the MCP entrypoint after its existing owner OAuth
 * guard. Do not treat backend_unavailable as drawing success.
 */
import {z} from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const entityType = z.enum([
 'line','polyline','lwpolyline','circle','arc','text','mtext',
 'point','leader','dimension'
]);

export const cadDrawShape = {
 job_id: id,
 idempotency_key: id,
 format: z.enum(['dxf','dwg']),
 plan: z.object({
  schema: z.literal('hs-steel-draw-plan/1'),
  producer: z.literal('khs0927/hs-steel-cad'),
  units: z.literal('mm'),
  contract_digest: sha256,
  entities: z.array(z.object({
   spec: z.object({type: entityType}).passthrough()
  }).passthrough()).min(1).max(5000),
  execution_authorized: z.literal(false).optional(),
  may_execute_mutation: z.literal(false).optional()
 }).passthrough(),
 prompt: z.string().max(4000).optional()
};

const requestSchema = z.object(cadDrawShape).strict();

export function cadDrawRegistrationOnly(raw: unknown) {
 const parsed = requestSchema.safeParse(raw);
 if (!parsed.success) return {
  status:'invalid_request' as const,
  execution_performed:false,
  independently_verified:false,
  customer_delivery_approved:false,
  error:'invalid_cad_draw_request'
 };
 return {
  status:'backend_unavailable' as const,
  job_id:parsed.data.job_id,
  execution_performed:false,
  independently_verified:false,
  customer_delivery_approved:false,
  error:'cad_draw_executor_not_integrated'
 };
}
