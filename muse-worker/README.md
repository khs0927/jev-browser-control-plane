# Muse Chat → Cloudflare Worker

Independent ES-module adaptation of `/root/muse-router-full/src/router.py`; nothing here deploys or modifies an account. Authorized callers get `GET /v1/models` and `POST /v1/chat/completions`. Upstream is fixed to `https://api.meta.ai`; chat is translated to `/v1/responses`. Queries are ignored and routes are exact.

## Review and test

Requires Node 22+; no packages or keys:

```sh
cd /var/minis/shared/muse-cloudflare-worker
node --test test/worker.test.mjs
```

Tests stub `globalThis.fetch`; they do not contact Meta or Cloudflare. Source is `src/worker.mjs`, tests are `test/worker.test.mjs`. No local service is started. Tested with Node v22.23.2. Node Web APIs are not a Cloudflare runtime integration test.

## Cloudflare configuration for a later, explicitly approved deployment

Create a Worker whose module entry point is `src/worker.mjs` and compatibility date is a current date approved by the operator. Enable the workers.dev route or bind an appropriate custom domain only after a security review. Set these as **Cloudflare Worker secrets**, preferably via the dashboard secret UI rather than shell arguments:

- `CALLER_BEARER_SECRET`: a separate, high-entropy random bearer secret; **not** the Muse API key or refresh token. Treat its disclosure as full router access; rotate when exposed.
- `MUSE_API_KEY`: current Muse access key, used only upstream.
- `MUSE_REFRESH_TOKEN`: optional Muse account refresh token, used to mint once on upstream 401 and retry the request once. The minted key remains request-local; it is not persisted or shared across isolates, so an expired static key triggers a mint per request. Without this secret, expiry returns upstream 401 until the operator rotates the Worker secret. The refresh token is a high-value account credential; do not configure it if that risk is unacceptable.

The Worker fails closed with 503 for missing required secrets or equal caller/upstream credentials. No token values belong in Wrangler config, source, URLs, command arguments, prompts, or logs. Restrict who can modify Worker code, secrets, routes, and observability settings. Cloudflare and Meta necessarily process request data; independent hosting survives a killed phone only **after** the Worker is separately deployed and its account/network/credentials remain available. This project is not deployed.

Client sends `Authorization: Bearer <CALLER_BEARER_SECRET>` over HTTPS to the Worker's base URL. `/v1/models` passes through the live upstream list; model names including `muse-spark-1.3` and `muse-spark-1.3-contributor` are forwarded as supplied, with `muse-spark-1.3` as default. There is no hard-coded claim that a particular model is currently available.

## Behavior and differences from the Python router

- System/developer text becomes instructions; user/assistant messages, assistant tool calls, and tool results become Responses input. Response text, tool calls, usage and finish reasons become Chat Completions output. Tools are deduplicated, prioritized and limited to five as in the original; colliding builtin tool names are prefixed and restored. Ambiguous renamed tool names are rejected instead of silently misrouting them. Explicit named `tool_choice` is translated to Responses form and rejected if its tool was removed by the five-tool limit.
- Streaming consumes real SSE incrementally, restores completed tool calls, and returns Chat Completions SSE and `[DONE]`. After response headers, stream failures must be conveyed as SSE error events, not HTTP status changes. Upstream must send `response.completed` or `response.incomplete`; abrupt `[DONE]` or EOF is reported as an error, not false success. Tool arguments are delivered when the upstream output item is complete, not token-by-token.
- HTTP upstream errors retain their status and parsed body; credential values appearing in error bodies are redacted. Numeric `Retry-After` is preserved. Exceptions return generic errors and code performs no logging. Normal successful content is forwarded; applications must never put credentials into prompts or tool results. Infrastructure-level logging/config is outside this code's control.
- Unlike Python, access with the upstream key is not accepted, and `/v1/responses`, `/health`, local files, and on-disk error dumps are not exposed. Model requests are not cached. Refresh is not shared or persisted. HTTPS origin is fixed and redirects are rejected to avoid forwarding credentials elsewhere.
- Text-only input: unsupported image/audio/multimodal parts are rejected rather than silently discarded. The Python router itself only extracts text. Options beyond the original conversion (e.g. temperature, top_p, n, JSON response formatting, user metadata, streaming usage options) are not forwarded. `max_tokens`/`max_completion_tokens`/`max_output_tokens` have a minimum of 4096 and default reasoning effort is `high`, matching the Python defaults; this can increase spend or hit model limits. Request and non-stream response bodies are capped at 1 MiB; individual SSE events at 2 MiB. High-traffic refreshes may cause minting load, and deployment may require rate limiting outside this project.

No production router, configuration, Cloudflare account, Google Drive, or actual credentials were accessed or modified for this adaptation. The Python source and mock test were inspected; JS tests replace running the Python integration tests, whose fixed Windows paths and filesystem writes are unsuitable here. No actual Muse authentication, model availability, Cloudflare request behavior, attestation, minting, or live streaming was verified.
