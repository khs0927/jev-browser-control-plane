from jev_control_plane.aside_mcp import _choose
from jev_control_plane.provider import ProviderStatus


class StubProvider:
    def status(self):
        return ProviderStatus(
            source="stub",
            model="jev-test",
            endpoint="local",
            client_id=None,
            credential_required=False,
        )

    def system_one(self, **kwargs):
        criteria = kwargs["questions"]["aside_action"]["criteria"]
        assert "go" in criteria
        assert "abstain" in criteria
        return {
            "model": "jev-test",
            "answers": {
                "aside_action": {
                    "choice": "go",
                    "confidence": 0.91,
                    "probabilities": {"go": 0.91, "abstain": 0.09},
                }
            },
        }


def test_choose_returns_original_execution_payload(monkeypatch):
    from jev_control_plane import aside_mcp

    monkeypatch.setattr(aside_mcp, "_provider", lambda: StubProvider())
    result = _choose(
        goal="Continue",
        observation={"page": "ready"},
        candidates=[
            {
                "id": "go",
                "description": "Click Continue",
                "tool": "click",
                "arguments": {"name": "Continue"},
            }
        ],
        min_confidence=0.7,
    )
    assert result["choice_id"] == "go"
    assert result["execute"]["should_execute"] is True
    assert result["execute"]["arguments"] == {"name": "Continue"}


def test_choose_downgrades_low_confidence(monkeypatch):
    from jev_control_plane import aside_mcp

    class LowProvider(StubProvider):
        def system_one(self, **kwargs):
            return {
                "answers": {
                    "aside_action": {
                        "choice": "go",
                        "confidence": 0.5,
                        "probabilities": {"go": 0.5, "abstain": 0.5},
                    }
                }
            }

    monkeypatch.setattr(aside_mcp, "_provider", lambda: LowProvider())
    result = _choose(
        goal="Continue",
        observation="ready",
        candidates=[
            {
                "id": "go",
                "description": "Click Continue",
                "tool": "click",
                "arguments": {},
            }
        ],
        min_confidence=0.7,
    )
    assert result["choice_id"] == "abstain"
    assert result["suggested_choice_id"] == "go"
    assert result["execute"]["should_execute"] is False
