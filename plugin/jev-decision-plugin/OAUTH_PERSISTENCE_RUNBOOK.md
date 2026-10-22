# JEV FastMCP OAuth persistence — release gate / rollback

**REVIEW ONLY. Do not merge production, deploy, restart, or rotate OAuth credentials.**
2026-10-20 15:53 UTC incident: "Refresh token not found" -> POST /token 401 invalid_grant. Existing container-local FastMCP refresh storage was not proven durable. ChatGPT was reauthenticated on 2026-10-22: do not disrupt the now-working session.

## Design and secrets

Use FastMCP 3.4.7 GitHubProvider(client_storage, jwt_signing_key) with upstream py-key-value-aio RedisStore, PrefixCollectionsWrapper, FernetEncryptionWrapper. The external Redis backend MUST be persistent and TLS-only (certificate + hostname verification). Redis stores encrypted values with FastMCP-managed TTL; no logging tokens, no fallback to in-memory or ephemeral disk. Prefix collections with jev-oauth-v1. Redis outage should fail closed. A free plan is acceptable only after confirming $0, storage persistence, backups and limits.

The following new names must be marked SENSITIVE in the hosting environment; never print values, commit any secret or paste keys to chat:
- JEV_OAUTH_REDIS_URL: credentialed remote rediss://USER:PASSWORD@HOST:PORT/DB (restricted credentials, durable Redis).
- JEV_OAUTH_FERNET_KEY: independent 32-byte Fernet key. Generate locally: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
- JEV_OAUTH_JWT_SIGNING_KEY: independent random 32+ character JWT signing secret. Generate locally: python -c "import secrets; print(secrets.token_urlsafe(48))"

Keep existing JEV_GITHUB_CLIENT_ID, JEV_GITHUB_CLIENT_SECRET, JEV_RESOURCE_URL, owner subject and read:user scope intact. Keys should be backed up under restricted ACL (directories 0700, encrypted backup 0600). Do not rotate them casually; a new JWT signing key may invalidate previously signed access tokens.

## Mandatory PRE-DEPLOY hard gate — preserve the existing OAuth session

1. Before ANY restart, replacement or deployment, obtain owner-authorized secure access to the ACTIVE Manufact container of deployment 2ad8f2c1-e1f8-4703-875a-046c318dd41c. Identify its actual FastMCP 3.4.7 client/token store directory and encryption/signing-key provenance. Do not guess storage paths; HTTP logs are NOT a token backup.
2. Make a restricted, encrypted backup of existing client registrations, access/refresh tokens, collection/key names, TTLs and key metadata directly into an approved secret store. Keep only backup checksum, item counts, operator/time in the verification report. Never output tokens or Redis passwords.
3. In ISOLATED staging, read legacy entries through the matching FastMCP AsyncKeyValue storage/key implementation, re-encrypt into the new Redis store and preserve each remaining TTL. Plain ciphertext file copying is NOT a valid migration across encryption keys. Verify a known client registration and actual refreshed token, and signing-key compatibility. Inaccessible current container = STOP and C보류.
4. Freeze or coordinate token refresh during final delta copy: old and new backends rotating tokens concurrently will lose sessions. A freshly generated JWT signing key is a breaking change unless compatibility is verified. Do not claim zero-downtime without a passing test. If migration is impossible, request separate approval for a new OAuth consent/downtime plan BEFORE deployment.
5. Confirm free Redis persistence/backup, TLS/secret access, then set the three sensitive values. Run tests and an approved *staging-only* synthetic backend check: python gateway/verify_oauth_storage.py. It creates and deletes a single synthetic check key with 60-second TTL, not a real OAuth token.
6. In staging, run full pinned FastMCP + Redis tests, restart the STAGING instance with Redis/keys unchanged; authenticated initialize + tools/list + jev_status AND an actual token refresh must succeed without consent. Validate Redis encryption, TTL countdown/expiry and no token logging.
7. Request EXPLICIT separate approval before deploying production. Submit backup hash, migration evidence, old commit, rollback plan, confirmed $0 cost and expected cutover conditions.

## After-approval acceptance / rollback

Expect health 200, both OAuth well-known endpoints 200, uncredentialed POST /mcp 401, authenticated tools/list with 5 JEV tools, jev_status = configured, and token refresh still working after a staging restart. No fresh "Refresh token not found"/invalid_grant entries; no TypeSafe paid inference is needed.

If staging fails, leave production unchanged. If a later approved production cutover fails, roll back to revision 3aabc598bd2f4a6116450c75ba30ff3037d9b133 AND restore its matching encrypted legacy storage, signing secrets and registrations from backup; restoring code alone is insufficient. Avoid two active issuers rotating the same token. If legacy backup was impossible, reauthentication requires explicit user approval.

Commands (offline unit): python -m pytest -q gateway/test_oauth_storage.py
Commands (all pinned dependencies): python -m pytest -q gateway/test_gateway.py gateway/test_oauth_storage.py
Command (opt-in staging Redis smoke only): python gateway/verify_oauth_storage.py

This PR intentionally contains NO deployment, production restart, backup extraction, Redis provisioning, token migration or TypeSafe inference calls.
