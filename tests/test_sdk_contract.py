"""Contract tests against the real TypeSafe SDK.

These are skipped when `typesafe_sdk` is not importable, so the unit suite still
runs without the dependency. When it is installed they assert that the question
objects `JevRouter` builds are valid SDK objects, and that answers produced by
the SDK's own models parse through this repository's router without loss.

That second half is not hypothetical. The wire schema types `ScoreAnswer.score`
as a float even though a rubric normally yields a whole level; an earlier version
of this router coerced it to `int` and silently truncated fractional scores.
Stub-based tests could not catch that, because the stub declared whatever the
router expected.
"""

from types import SimpleNamespace

import pytest

from jev_control_plane.router import JevRouter

# A bare `pytest.importorskip` is not enough here. When the SDK is installed but
# its native dependency cannot be loaded, the failure surfaces as a plain
# `ImportError` from dlopen, which pytest reports as a collection error and which
# aborts the whole suite. Catch it and skip, carrying the reason through.
try:
    from typesafe_sdk import (
        Choice,
        ChoiceAnswer,
        Noul,
        NoulAnswer,
        Score,
        ScoreAnswer,
    )
except Exception as exc:  # noqa: BLE001
    pytest.skip(
        f"typesafe-sdk is not importable in this environment: {exc!r}",
        allow_module_level=True,
    )


class CapturingClient:
    """Records the questions and returns a caller-supplied answer."""

    def __init__(self, answers):
        self._answers = answers
        self.captured = None

    def system_one(self, **kwargs):
        self.captured = kwargs
        return SimpleNamespace(model="jev-contract", answers=dict(self._answers))


def test_noul_builds_a_real_sdk_question():
    client = CapturingClient({"q": SimpleNamespace(noul=0.9)})
    JevRouter(client=client).noul(state="x", instructions="Is this true?", question_name="q")

    question = client.captured["questions"]["q"]
    assert isinstance(question, Noul)
    wire = question.model_dump(exclude_none=True)
    assert wire["type"] == "noul"
    assert wire["instructions"] == "Is this true?"
    # An unset optional must not reach the wire.
    assert "criteria" not in wire


def test_noul_criteria_reach_the_wire():
    client = CapturingClient({"q": SimpleNamespace(noul=0.9)})
    JevRouter(client=client).noul(
        state="x",
        instructions="Is this true?",
        question_name="q",
        criteria={"true": "the page loaded", "false": "an error was shown"},
    )
    wire = client.captured["questions"]["q"].model_dump(exclude_none=True)
    assert wire["criteria"] == {
        "true": "the page loaded",
        "false": "an error was shown",
    }


def test_score_preserves_rubric_order_on_the_wire():
    client = CapturingClient({"s": SimpleNamespace(score=0.0, legend={}, probabilities={})})
    JevRouter(client=client).score(
        state="x",
        instructions="How severe?",
        criteria=["minor", "moderate", "severe"],
        question_name="s",
    )
    question = client.captured["questions"]["s"]
    assert isinstance(question, Score)
    wire = question.model_dump(exclude_none=True)
    assert wire["type"] == "score"
    assert wire["criteria"] == ["minor", "moderate", "severe"]


def test_choice_builds_a_real_sdk_question():
    client = CapturingClient({"route": SimpleNamespace(choice="a", confidence=0.9, probabilities={"a": 0.9})})
    JevRouter(client=client).choose(
        state="x", instructions="Pick", candidates={"a": None, "b": None}
    )
    question = client.captured["questions"]["route"]
    assert isinstance(question, Choice)
    assert question.model_dump(exclude_none=True)["type"] == "choice"


def test_noul_answer_parses_without_a_confidence_field():
    answer = NoulAnswer.model_validate({"type": "noul", "noul": 0.98})
    client = CapturingClient({"q": answer})
    result = JevRouter(client=client).noul(state="x", instructions="Is this true?", question_name="q")
    assert result.noul == 0.98
    # The SDK's noul answer carries no confidence, which is why the router needs
    # disposition_for_noul rather than DecisionPolicy.disposition.
    assert not hasattr(answer, "confidence")


def test_choice_answer_parses_confidence_and_probabilities():
    answer = ChoiceAnswer.model_validate(
        {
            "type": "choice",
            "choice": "billing",
            "confidence": 0.99,
            "probabilities": {"billing": 0.99, "technical": 0.01},
        }
    )
    client = CapturingClient({"route": answer})
    result = JevRouter(client=client).choose(
        state="x",
        instructions="Which team?",
        candidates={"billing": None, "technical": None},
    )
    assert result.choice == "billing"
    assert result.confidence == 0.99
    assert result.probabilities == {"billing": 0.99, "technical": 0.01}
    assert result.model == "jev-contract"


def test_score_answer_does_not_truncate_a_fractional_score():
    """The regression this file exists for."""
    answer = ScoreAnswer.model_validate(
        {
            "type": "score",
            "score": 1.5,
            "confidence": 0.6,
            "legend": {0: "low", 1: "mid", 2: "high"},
            "probabilities": {0: 0.2, 1: 0.5, 2: 0.3},
        }
    )
    client = CapturingClient({"s": answer})
    result = JevRouter(client=client).score(
        state="x",
        instructions="How severe?",
        criteria=["low", "mid", "high"],
        question_name="s",
    )
    assert result.score == 1.5
    assert result.confidence == 0.6
    assert result.legend == {0: "low", 1: "mid", 2: "high"}
    assert result.probabilities == {0: 0.2, 1: 0.5, 2: 0.3}


def test_score_answer_serializes_non_string_legend_entries():
    answer = ScoreAnswer.model_validate(
        {
            "type": "score",
            "score": 0.0,
            "confidence": 0.4,
            "legend": {0: {"label": "low", "detail": "no action"}},
            "probabilities": {0: 1.0},
        }
    )
    client = CapturingClient({"s": answer})
    result = JevRouter(client=client).score(
        state="x", instructions="How severe?", criteria=["low", "high"], question_name="s"
    )
    assert result.legend[0] == '{"detail": "no action", "label": "low"}'
