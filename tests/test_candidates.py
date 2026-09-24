import pytest

from jev_control_plane.candidates import parse_candidates, validate_choice


def test_parse_candidates_adds_abstain():
    parsed = parse_candidates(
        [
            {
                "id": "continue",
                "description": "Click Continue",
                "tool": "click",
                "arguments": {"name": "Continue"},
            }
        ]
    )
    assert [candidate.id for candidate in parsed] == ["continue", "abstain"]


def test_unknown_choice_is_rejected():
    parsed = parse_candidates(
        [{"id": "safe", "description": "Safe action", "tool": "click"}]
    )
    with pytest.raises(ValueError):
        validate_choice("invented", parsed)


def test_abstain_cannot_execute():
    with pytest.raises(ValueError):
        parse_candidates(
            [
                {
                    "id": "abstain",
                    "description": "Stop",
                    "tool": "click",
                    "arguments": {},
                }
            ]
        )
