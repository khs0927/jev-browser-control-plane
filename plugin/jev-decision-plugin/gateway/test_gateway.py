"""Offline only. Fixtures are not Jev inference or OAuth-provider validation."""
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import server
from reused_router import JevRouter

def test_real_sdk_questions():
    for spec in [
        {"type": "noul", "instructions": "Is a refund requested?"},
        {"type": "choice", "instructions": "Pick a team", "criteria": {"a": None, "b": "Billing"}},
        {"type": "score", "instructions": "Severity", "criteria": ["Low", "High"]},
    ]:
        assert server.question(spec).type == spec["type"]

@pytest.mark.parametrize("spec", [
    {"type": "noul", "instructions": "Check", "confidence": .85},
    {"type": "noul", "instructions": "Check", "criteria": {"yes": "yes"}},
    {"type": "choice", "instructions": "Check", "criteria": {"a": "one"}},
    {"type": "score", "instructions": "Check", "criteria": ["one"]},
])
def test_invalid_questions(spec):
    with pytest.raises(ValueError):
        server.question(spec)

def test_cost_gate_never_constructs_client(monkeypatch):
    monkeypatch.delenv("JEV_NO_COST_ACCESS_VERIFIED", raising=False)
    monkeypatch.setattr(server, "sdk_client", lambda: pytest.fail("upstream attempted"))
    assert server.decision("noul", "Example", "Check")["upstream_called"] is False

def test_no_http_without_verified_oauth(monkeypatch):
    for name in ("JEV_OAUTH_ISSUER", "JEV_OAUTH_JWKS_URL", "JEV_RESOURCE_URL", "JEV_OWNER_SUBJECT", "JEV_OAUTH_CLIENT_ID"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError, match="HTTP disabled"):
        server.http_server()

def test_reused_router_preserves_fractional_score_and_no_noul_confidence():
    class FixtureClient:
        def system_one(self, **kwargs):
            q = next(iter(kwargs["questions"].values()))
            name = next(iter(kwargs["questions"]))
            if q.type == "noul":
                answer = SimpleNamespace(noul=.72)
            else:
                answer = SimpleNamespace(score=1.05, confidence=.92, legend={"0": "Low", "1": "Medium", "2": "High"}, probabilities={"0": 0., "1": .95, "2": .05})
            return SimpleNamespace(model="OFFLINE-FIXTURE", answers={name: answer})
    router = JevRouter(client=FixtureClient())
    assert not hasattr(router.noul(state="Example", instructions="Check"), "confidence")
    assert router.score(state="Example", instructions="Rate", criteria=["Low", "Medium", "High"]).score == 1.05

def test_actual_stdio_mcp_offline():
    async def run():
        env = dict(os.environ)
        env.pop("TYPESAFE_API_KEY", None)
        env.pop("JEV_NO_COST_ACCESS_VERIFIED", None)
        params = StdioServerParameters(command=sys.executable, args=[str(Path(server.__file__).resolve())], env=env)
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as client:
                await client.initialize()
                listing = await client.list_tools()
                assert {t.name for t in listing.tools} == {"jev_status", "jev_noul", "jev_choice", "jev_score", "jev_batch"}
                result = await client.call_tool("jev_status", {})
                assert not result.isError
                assert result.structuredContent["status"] == "unconnected"
                for name, args in [
                    ("jev_noul", {"state": "Example", "instructions": "Check"}),
                    ("jev_choice", {"state": "Example", "instructions": "Pick", "criteria": {"a": "A", "b": "B"}}),
                    ("jev_score", {"state": "Example", "instructions": "Rate", "criteria": ["Low", "High"]}),
                    ("jev_batch", {"state": "Example", "questions": {"one": {"type": "noul", "instructions": "Check"}}}),
                ]:
                    result = await client.call_tool(name, args)
                    assert not result.isError
                    assert result.structuredContent["upstream_called"] is False
    asyncio.run(run())
