# iPhone / curl: 5-minute JEV gateway check (read-only)

Use trusted iPhone a-Shell or iSH (or another trusted curl terminal). Never paste token or password.

    BASE='https://bold-forge-l9kqr.run.mcp-use.com'
    curl -sS -i --max-time 12 "$BASE/health"
    curl -sS -i --max-time 12 "$BASE/.well-known/oauth-protected-resource/mcp"
    curl -sS -i --max-time 12 "$BASE/.well-known/oauth-authorization-server"
    curl -sS -i --max-time 12 -X POST "$BASE/mcp" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-11-25' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"jev-public-check","version":"1.0"}}}'

Expected HTTP 200, 200, 200, 401 respectively. Uncredentialed POST MUST NOT return 200. GET /mcp may return 405, which is expected for this server. 522/503/timeouts are C보류 requiring server log investigation.

Safari-only option: open these three GET links directly, but Safari address bar cannot perform the POST test:
- https://bold-forge-l9kqr.run.mcp-use.com/health
- https://bold-forge-l9kqr.run.mcp-use.com/.well-known/oauth-protected-resource/mcp
- https://bold-forge-l9kqr.run.mcp-use.com/.well-known/oauth-authorization-server

Finally in the *already connected* ChatGPT iPhone app ask: "@JEV Decision MCP jev_status를 실제 호출하고 설정 상태만 보고해줘. 과금 가능한 추론 도구 실행 금지." Expect configured, TypeSafe official SDK, jev-1.13.0, no error. This proves current OAuth, NOT future token persistence after deployment.
