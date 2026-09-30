# Connection status — 0.1.3

Manufact and personal GitHub connection verified. Server cf89d2e8-74af-46e7-a0dc-926d8e1523fc created from feat/jev-decision-private-plugin, root plugin/jev-decision-plugin. Assigned MCP URL: https://bold-forge-l9kqr.run.mcp-use.com/mcp (not yet a verified usable MCP endpoint).

TypeSafe key registered in sensitive production environment variable; no key embedded in plugin. Inference remains disabled until owner authentication is verified.

First deployment built but failed because OAuth settings were absent. Hosted health entry point and explicit startup command are prepared. GitHub OAuth implementation reuses FastMCP 3.4.7; only GitHub subject 130247531 is accepted. Offline suite: 21 passed. Live OAuth and mobile verification remain pending. mcp.json stays empty until owner-authorized MCP calls are verified.

Required remaining credentials: JEV_GITHUB_CLIENT_ID and sensitive JEV_GITHUB_CLIENT_SECRET. No generic remote connector is retried.
