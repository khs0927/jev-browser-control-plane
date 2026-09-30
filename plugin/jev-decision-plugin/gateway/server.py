"""Private Jev gateway. Inference requires explicit enablement and server credentials."""
from __future__ import annotations
import asyncio
import os
from dataclasses import asdict
from typing import Any
from urllib.parse import urlparse

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from mcp.server.transport_security import TransportSecuritySettings
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient
from reused_router import JevRouter

def ready() -> bool:
    return os.getenv("JEV_INFERENCE_ENABLED") == "true" and bool(os.getenv("TYPESAFE_API_KEY"))

def question(spec: dict[str, Any]):
    if set(spec) - {"type", "instructions", "criteria"}:
        raise ValueError("Unknown question field")
    instructions = spec.get("instructions")
    if not isinstance(instructions, (str, dict, list)) or not instructions:
        raise ValueError("instructions must be nonempty text or structured JSON")
    kind, criteria = spec.get("type"), spec.get("criteria")
    if kind == "noul":
        if criteria is not None and (not isinstance(criteria, dict) or set(criteria) != {"true", "false"}):
            raise ValueError("Noul criteria must define true and false")
        return Noul(instructions=instructions, **({"criteria": criteria} if criteria is not None else {}))
    if kind == "choice" and isinstance(criteria, dict) and 2 <= len(criteria) <= 255:
        return Choice(instructions=instructions, criteria=criteria)
    if kind == "score" and isinstance(criteria, list) and 2 <= len(criteria) <= 10:
        return Score(instructions=instructions, criteria=criteria)
    raise ValueError("Invalid question type or criteria")

def sdk_client():
    # SDK owns transport/retries. No proxy, free-model alias, or URL override.
    return TypeSafeClient(api_key=os.environ["TYPESAFE_API_KEY"], base_url="https://api.typesafe.ai", model="jev-1.13.0")

def validate_state(state: Any):
    if not isinstance(state, (str, dict, list)) or not state:
        raise ValueError("state must be nonempty text or structured JSON")

def decision(kind: str, state: Any, instructions: str, criteria: Any = None):
    validate_state(state)
    question({"type": kind, "instructions": instructions, **({"criteria": criteria} if criteria is not None else {})})
    if not ready():
        return {"status": "blocked", "reason": "Inference enablement and server-side credential not configured", "upstream_called": False}
    try:
        with sdk_client() as client:
            router = JevRouter(client=client)
            if kind == "choice":
                result = router.choose(state=state, instructions=instructions, candidates=criteria)
            elif kind == "noul":
                result = router.noul(state=state, instructions=instructions, criteria=criteria)
            else:
                result = router.score(state=state, instructions=instructions, criteria=criteria)
            return {"status": "ok", "answer": {"type": kind, **asdict(result)}, "threshold_status": "uncalibrated", "advisory_only": True}
    except Exception:
        # Never return upstream exceptions, request headers, state or keys.
        return {"status": "error", "reason": "TypeSafe request failed", "retry_automatically": False}

annotations = ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=True)

def create_mcp(*, token_verifier=None, auth=None):
    resource = urlparse(os.getenv("JEV_RESOURCE_URL", ""))
    allowed_hosts = ["localhost:*", "127.0.0.1:*"]
    if resource.netloc:
        allowed_hosts.append(resource.netloc)
    security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True, allowed_hosts=allowed_hosts,
        allowed_origins=["https://chatgpt.com"] + ([f"{resource.scheme}://{resource.netloc}"] if resource.netloc else []))
    mcp = FastMCP("JEV Decision Plugin", stateless_http=True, json_response=True,
                  transport_security=security,
                  token_verifier=token_verifier, auth=auth,
                  host=os.getenv("JEV_BIND_HOST", "127.0.0.1"),
                  port=int(os.getenv("PORT", "8080")))

    @mcp.tool(annotations=annotations)
    def jev_status() -> dict[str, Any]:
        """Read configuration status without making an inference request."""
        return {"status": "configured" if ready() else "unconnected", "live_inference_verified": False,
                "inference_enabled": os.getenv("JEV_INFERENCE_ENABLED") == "true",
                "threshold_status": "uncalibrated", "provider": "TypeSafe official SDK", "model": "jev-1.13.0",
                "billing": "provider-metered", "free_entitlement_verified": False}

    @mcp.tool(annotations=annotations)
    def jev_noul(state: Any, instructions: str, criteria: dict | None = None) -> dict[str, Any]:
        """Return a yes/no probability; Noul has no confidence field. May incur provider charges when enabled."""
        return decision("noul", state, instructions, criteria)

    @mcp.tool(annotations=annotations)
    def jev_choice(state: Any, instructions: str, criteria: dict) -> dict[str, Any]:
        """Choose one defined option and return its probabilities and confidence."""
        return decision("choice", state, instructions, criteria)

    @mcp.tool(annotations=annotations)
    def jev_score(state: Any, instructions: str, criteria: list) -> dict[str, Any]:
        """Return a fractional rubric score, legend, probabilities and confidence."""
        return decision("score", state, instructions, criteria)

    @mcp.tool(annotations=annotations)
    def jev_batch(state: Any, questions: dict[str, dict]) -> dict[str, Any]:
        """Evaluate atomic questions sharing one state in one official SDK request; not a separate upstream batch endpoint."""
        validate_state(state)
        if not questions or len(questions) > 100:
            raise ValueError("Gateway accepts 1 to 100 named questions")
        typed = {name: question(spec) for name, spec in questions.items()}
        if not ready():
            return {"status": "blocked", "reason": "Inference enablement and server-side credential not configured", "upstream_called": False}
        try:
            with sdk_client() as client:
                result = client.system_one(state=state, questions=typed)
            return {"status": "ok", "result": result.model_dump(mode="json"),
                    "threshold_status": "uncalibrated", "advisory_only": True}
        except Exception:
            return {"status": "error", "reason": "TypeSafe request failed", "retry_automatically": False}
    return mcp

def http_server():
    from mcp.server.auth.provider import AccessToken, TokenVerifier
    from mcp.server.auth.settings import AuthSettings
    from pydantic import AnyHttpUrl
    import jwt
    required = ("JEV_OAUTH_ISSUER", "JEV_OAUTH_JWKS_URL", "JEV_RESOURCE_URL", "JEV_OWNER_SUBJECT", "JEV_OAUTH_CLIENT_ID")
    values = {key: os.getenv(key, "") for key in required}
    if any(not value for value in values.values()):
        raise RuntimeError("HTTP disabled: verified OAuth provider, resource and owner configuration required")
    for key in required[:3]:
        parsed = urlparse(values[key])
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise RuntimeError("OAuth and resource URLs must be verified HTTPS URLs")
    jwks = jwt.PyJWKClient(values["JEV_OAUTH_JWKS_URL"])
    class Verifier(TokenVerifier):
        async def verify_token(self, token: str):
            try:
                key = await asyncio.to_thread(jwks.get_signing_key_from_jwt, token)
                claims = jwt.decode(token, key.key, algorithms=["RS256"],
                    audience=values["JEV_RESOURCE_URL"], issuer=values["JEV_OAUTH_ISSUER"],
                    options={"require": ["exp", "iss", "aud", "sub"]})
                if claims["sub"] != values["JEV_OWNER_SUBJECT"] or claims.get("client_id", claims.get("azp")) != values["JEV_OAUTH_CLIENT_ID"]:
                    return None
                scopes = claims.get("scope", "").split()
                if "jev:decide" not in scopes:
                    return None
                return AccessToken(token=token, client_id=values["JEV_OAUTH_CLIENT_ID"], scopes=scopes,
                                   expires_at=claims["exp"], resource=values["JEV_RESOURCE_URL"])
            except Exception:
                return None
    return create_mcp(token_verifier=Verifier(), auth=AuthSettings(
        issuer_url=AnyHttpUrl(values["JEV_OAUTH_ISSUER"]), resource_server_url=AnyHttpUrl(values["JEV_RESOURCE_URL"]),
        required_scopes=["jev:decide"], validate_token_resource=True))

if __name__ == "__main__":
    import sys
    if "--http" in sys.argv:
        http_server().run(transport="streamable-http")
    else:
        create_mcp().run(transport="stdio")
