import io
import json
from urllib.error import HTTPError

import pytest

from jev_control_plane.provider import JevProviderError, ZenFreeProvider


class FakeResponse:
    def __init__(self, body):
        self._body = json.dumps(body).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self._body


def test_zen_free_uses_system_one_and_own_client_id(monkeypatch):
    monkeypatch.delenv("OPENCODE_API_KEY", raising=False)
    monkeypatch.delenv("JEV_ZEN_API_KEY", raising=False)
    seen = {}

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["headers"] = {key.lower(): value for key, value in request.header_items()}
        seen["body"] = json.loads(request.data.decode())
        seen["timeout"] = timeout
        return FakeResponse(
            {
                "model": "jev-1.13-free",
                "answers": {"route": {"choice": "a", "confidence": 1.0}},
            }
        )

    monkeypatch.setattr("jev_control_plane.provider.urlopen", fake_urlopen)
    provider = ZenFreeProvider(
        client_id="our-client",
        user_agent="OurClient/1.0",
        timeout=3.0,
    )
    result = provider.system_one(
        state={"request": "x"},
        questions={
            "route": {
                "type": "choice",
                "instructions": "Pick one",
                "criteria": {"a": "A", "b": "B"},
            }
        },
    )

    assert seen["url"] == "https://opencode.ai/zen/v1/systemone"
    assert seen["headers"]["x-opencode-client"] == "our-client"
    assert seen["headers"]["user-agent"] == "OurClient/1.0"
    assert "authorization" not in seen["headers"]
    assert seen["body"]["model"] == "jev-1.13-free"
    assert result["answers"]["route"]["choice"] == "a"


def test_zen_free_fails_closed_on_403(monkeypatch):
    monkeypatch.delenv("OPENCODE_API_KEY", raising=False)
    monkeypatch.delenv("JEV_ZEN_API_KEY", raising=False)

    def fake_urlopen(request, timeout):
        raise HTTPError(
            request.full_url,
            403,
            "Forbidden",
            {},
            io.BytesIO(b'{"error":"not allowed"}'),
        )

    monkeypatch.setattr("jev_control_plane.provider.urlopen", fake_urlopen)
    provider = ZenFreeProvider(client_id="our-client")

    with pytest.raises(JevProviderError) as error:
        provider.system_one(
            state="x",
            questions={
                "done": {
                    "type": "noul",
                    "instructions": "Is this done?",
                }
            },
        )

    assert error.value.code == "authentication"
    assert error.value.status == 403


def test_zen_free_uses_optional_opencode_bearer(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["headers"] = {
            key.lower(): value for key, value in request.header_items()
        }
        return FakeResponse(
            {
                "model": "jev-1.13-free",
                "answers": {"route": {"choice": "a", "confidence": 1.0}},
            }
        )

    monkeypatch.setattr("jev_control_plane.provider.urlopen", fake_urlopen)
    provider = ZenFreeProvider(
        client_id="our-client",
        user_agent="OurClient/1.0",
        api_key="zen-test-key",
    )
    provider.system_one(
        state="x",
        questions={
            "route": {
                "type": "choice",
                "instructions": "Pick one",
                "criteria": {"a": "A", "b": "B"},
            }
        },
    )

    assert seen["headers"]["authorization"] == "Bearer zen-test-key"
    assert provider.status().credential_configured is True


def test_zen_sentinel_is_never_sent_as_bearer(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["headers"] = {
            key.lower(): value for key, value in request.header_items()
        }
        return FakeResponse(
            {
                "model": "jev-1.13-free",
                "answers": {"ready": {"noul": 1.0}},
            }
        )

    monkeypatch.setattr("jev_control_plane.provider.urlopen", fake_urlopen)
    provider = ZenFreeProvider(api_key="zen")
    provider.system_one(
        state={"ready": True},
        questions={
            "ready": {
                "type": "noul",
                "instructions": "Is ready true?",
            }
        },
    )

    assert "authorization" not in seen["headers"]
