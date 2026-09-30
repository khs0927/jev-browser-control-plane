# Verification — 2026-10-01 Asia/Seoul

Offline suite: 21 passed, covering SDK contracts, disabled inference, MCP discovery, owner checks, metadata, unauthorized HTTP denial and approved/rejected OAuth callbacks.

Production deployment c83733c3-7bec-4368-8255-c4c791c3c611: running. Unauthenticated MCP POST: 401. Protected-resource and authorization-server metadata: 200. Manufact client registration: 201. User completed OAuth; Cloud authentication status: authenticated.

Authenticated live jev_status: configured, inference_enabled=true, official TypeSafe SDK, model jev-1.13.0. The status tool's static live_inference_verified=false is not a historical test tracker.

Authenticated live jev_batch through Manufact Cloud Inspector: status ok, model jev-1.13.0; 1404 ms total inspector response; 372 input tokens, 61 output tokens. Blue-square fixture: Noul 0.99 with no confidence field, Choice blue/confidence 1, Score 0 (Low)/confidence 0.99. This verifies the actual hosted OAuth-to-TypeSafe path, not calibration or broad task quality.

ChatGPT OAuth connection and iOS/Android operation remain unverified. Billing and free entitlement unverified. No subscription created.
