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

def test_disabled_inference_never_constructs_client(monkeypatch):
    monkeypatch.delenv("JEV_INFERENCE_ENABLED", raising=False)
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
        env.pop("JEV_INFERENCE_ENABLED", None)
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

@pytest.mark.parametrize('override', [{}, {'iss':'https://wrong.test'}, {'aud':'wrong'}, {'sub':'other'}, {'client_id':'other'}, {'scope':'other'}, {'exp':1}])
def test_owner_oauth_token_contract(monkeypatch, override):
    import time
    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    config = {'JEV_OAUTH_ISSUER':'https://issuer.test', 'JEV_OAUTH_JWKS_URL':'https://issuer.test/jwks', 'JEV_RESOURCE_URL':'https://jev.test/mcp', 'JEV_OWNER_SUBJECT':'owner', 'JEV_OAUTH_CLIENT_ID':'client'}
    for name, value in config.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(jwt, 'PyJWKClient', lambda url: SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))
    monkeypatch.setattr(server, 'create_mcp', lambda **kwargs: kwargs['token_verifier'])
    verifier = server.http_server()
    claims = {'iss':'https://issuer.test', 'aud':'https://jev.test/mcp', 'sub':'owner', 'client_id':'client', 'scope':'jev:decide', 'exp':int(time.time())+300}
    claims.update(override)
    result = asyncio.run(verifier.verify_token(jwt.encode(claims, key, algorithm='RS256')))
    assert (result is not None) == (not override)
    assert asyncio.run(verifier.verify_token('invalid-token')) is None


def test_hosted_health_without_oauth_still_blocks_mcp(monkeypatch):
    from starlette.testclient import TestClient
    import hosted
    monkeypatch.delenv('JEV_OAUTH_ISSUER', raising=False)
    with TestClient(hosted.app()) as client:
        assert client.get('/health').json() == {'status':'running', 'mcp_ready':False}
        assert client.post('/mcp', json={'jsonrpc':'2.0','method':'initialize','id':1}).status_code == 503


@pytest.mark.parametrize('subject,accepted', [('130247531',True),('other',False),('',False)])
def test_github_owner_gate(monkeypatch,subject,accepted):
    from github_auth import OwnerGitHubProvider
    from fastmcp.server.auth.providers.github import GitHubProvider
    async def fixture(self, token):
        return SimpleNamespace(claims={'sub':subject})
    monkeypatch.setattr(GitHubProvider,'load_access_token',fixture)
    provider=object.__new__(OwnerGitHubProvider)
    assert (asyncio.run(provider.load_access_token('fixture')) is not None) == accepted


def test_github_oauth_metadata_and_unauthenticated_block(monkeypatch,tmp_path):
    from starlette.testclient import TestClient
    from github_auth import github_app
    monkeypatch.setenv('JEV_GITHUB_CLIENT_ID','offline-fixture-id')
    monkeypatch.setenv('JEV_GITHUB_CLIENT_SECRET','offline-fixture-secret')
    monkeypatch.setenv('JEV_RESOURCE_URL','https://jev.test/mcp')
    monkeypatch.setenv('FASTMCP_HOME',str(tmp_path))
    with TestClient(github_app(),base_url='https://jev.test') as client:
        assert client.get('/health').json()['mcp_ready'] is True
        assert client.get('/.well-known/oauth-authorization-server').status_code == 200
        assert client.post('/mcp',json={'jsonrpc':'2.0','method':'initialize','id':1}).status_code == 401
        for uri, expected in [
            ('https://manufact.com/inspector/oauth/callback',201),
            ('https://chatgpt.com/connector/oauth/fixture',201),
            ('https://untrusted.test/oauth/callback',400),
            ('https://manufact.com/unapproved-callback',400),
        ]:
            response = client.post('/register', json={
                'client_name':'Offline callback contract',
                'redirect_uris':[uri],
                'token_endpoint_auth_method':'none',
                'grant_types':['authorization_code','refresh_token'],
                'response_types':['code']})
            assert response.status_code == expected

def test_noul_validation_blocks_upstream(monkeypatch):
    monkeypatch.setattr(server, "sdk_client", lambda: pytest.fail("upstream attempted"))
    result = server.decision("noul", "Example", "Check", {"priority": "high"})
    assert result["code"] == "VALIDATION_ERROR"
    assert result["upstream_called"] is False
    assert '"true" and "false"' in result["reason"]

def test_noul_schema_and_mcp_validation():
    async def run():
        mcp = server.create_mcp()
        listing = await mcp.list_tools()
        tool = next(t for t in listing if t.name == "jev_noul")
        schema = tool.inputSchema["$defs"]["NoulCriteria"]
        assert set(schema["required"]) == {"true", "false"}
        assert schema["additionalProperties"] is False
        from mcp.server.fastmcp.exceptions import ToolError
        with pytest.raises(ToolError, match="criteria.priority"):
            await mcp.call_tool("jev_noul", {"state":"Example", "instructions":"Check", "criteria":{"priority":"high"}})
        result = await mcp.call_tool("jev_batch", {"state":"Example", "questions":{"check":{"type":"noul","instructions":"Check","criteria":{"priority":"high"}}}})
        assert result[1]["code"] == "VALIDATION_ERROR"
        assert result[1]["field"] == "questions.check.criteria"
    asyncio.run(run())
