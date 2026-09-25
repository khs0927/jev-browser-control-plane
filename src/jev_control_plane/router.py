from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class Decision:
    choice: str
    confidence: float | None
    probabilities: Mapping[str, float]
    model: str | None = None


@dataclass(frozen=True)
class NoulDecision:
    """Probability that a single statement is true."""

    noul: float
    model: str | None = None


@dataclass(frozen=True)
class ScoreDecision:
    """Expected position on an ordered rubric, with the rubric and distribution.

    ``score`` stays a float because the wire schema types it as one, even though a
    rubric normally yields a whole level. Rounding here would silently discard
    whatever fractional position the model returned.
    """

    score: float
    confidence: float | None
    legend: Mapping[int, str]
    probabilities: Mapping[int, float]
    model: str | None = None


JevDecision = Decision | NoulDecision | ScoreDecision


class JevRouter:
    """Compatibility wrapper around the official TypeSafe Jev SDK."""

    def __init__(
        self,
        client: Any | None = None,
        choice_type: Any | None = None,
        noul_type: Any | None = None,
        score_type: Any | None = None,
    ) -> None:
        self._client = client
        self._choice_type = choice_type
        self._noul_type = noul_type
        self._score_type = score_type

    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client

        from typesafe_sdk import TypeSafeClient

        self._client = TypeSafeClient()
        return self._client

    def _choice(self, instructions: str, criteria: Mapping[str, Any]) -> Any:
        if self._choice_type is None:
            try:
                from typesafe_sdk import Choice
            except ImportError as exc:
                raise RuntimeError(
                    "typesafe-sdk is required for live Jev calls"
                ) from exc
            self._choice_type = Choice
        return self._choice_type(instructions=instructions, criteria=dict(criteria))

    def _noul(self, instructions: str, criteria: Mapping[str, Any] | None) -> Any:
        if self._noul_type is None:
            try:
                from typesafe_sdk import Noul
            except ImportError as exc:
                raise RuntimeError(
                    "typesafe-sdk is required for live Jev calls"
                ) from exc
            self._noul_type = Noul
        if criteria:
            return self._noul_type(instructions=instructions, criteria=dict(criteria))
        return self._noul_type(instructions=instructions)

    def _score(self, instructions: str, criteria: Sequence[Any]) -> Any:
        if self._score_type is None:
            try:
                from typesafe_sdk import Score
            except ImportError as exc:
                raise RuntimeError(
                    "typesafe-sdk is required for live Jev calls"
                ) from exc
            self._score_type = Score
        return self._score_type(instructions=instructions, criteria=list(criteria))

    @staticmethod
    def _answer(response: Any, name: str, *extra_containers: str) -> Any:
        for attr in ("answers", *extra_containers):
            container = getattr(response, attr, None)
            if container is None:
                continue
            if isinstance(container, Mapping):
                if name in container:
                    return container[name]
            else:
                try:
                    return container[name]
                except (KeyError, TypeError, AttributeError):
                    value = getattr(container, name, None)
                    if value is not None:
                        return value
        raise RuntimeError(f"Jev response did not contain answer {name!r}")

    @staticmethod
    def _model(response: Any) -> str | None:
        model = getattr(response, "model", None)
        return str(model) if isinstance(model, str) else None

    @staticmethod
    def _optional_float(value: Any) -> float | None:
        return float(value) if value is not None else None

    @staticmethod
    def _legend_text(value: Any) -> str:
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False, sort_keys=True)

    def choose(
        self,
        *,
        state: Any,
        instructions: str,
        candidates: Mapping[str, Any],
        question_name: str = "route",
    ) -> Decision:
        if not candidates:
            raise ValueError("candidates must not be empty")

        response = self._ensure_client().system_one(
            state=state,
            questions={
                question_name: self._choice(instructions, candidates),
            },
        )
        answer = self._answer(response, question_name, "choices")

        choice = str(getattr(answer, "choice"))
        if choice not in candidates:
            raise RuntimeError(f"Jev returned unknown candidate {choice!r}")

        raw_probabilities = getattr(answer, "probabilities", None) or {}
        probabilities = {
            str(key): float(value) for key, value in dict(raw_probabilities).items()
        }

        return Decision(
            choice=choice,
            confidence=self._optional_float(getattr(answer, "confidence", None)),
            probabilities=probabilities,
            model=self._model(response),
        )

    def noul(
        self,
        *,
        state: Any,
        instructions: str,
        question_name: str = "noul",
        criteria: Mapping[str, Any] | None = None,
    ) -> NoulDecision:
        """Ask whether a single statement is true and return its probability.

        `criteria` optionally describes the ``true`` and ``false`` outcomes. It is
        left off the request when unset, matching the SDK wire format.
        """
        if not instructions.strip():
            raise ValueError("instructions must not be empty")
        if criteria is not None and not criteria:
            raise ValueError("criteria must describe the true and false outcomes")

        response = self._ensure_client().system_one(
            state=state,
            questions={question_name: self._noul(instructions, criteria)},
        )
        answer = self._answer(response, question_name, "nouls")

        return NoulDecision(
            noul=float(getattr(answer, "noul")),
            model=self._model(response),
        )

    def score(
        self,
        *,
        state: Any,
        instructions: str,
        criteria: Sequence[Any],
        question_name: str = "score",
    ) -> ScoreDecision:
        """Place the observed state on an ordered rubric.

        `criteria` is ordered from the lowest level to the highest, and each entry
        defines one level starting at zero.
        """
        if not instructions.strip():
            raise ValueError("instructions must not be empty")
        if not criteria:
            raise ValueError("criteria must be a non-empty ordered rubric")

        response = self._ensure_client().system_one(
            state=state,
            questions={question_name: self._score(instructions, criteria)},
        )
        answer = self._answer(response, question_name, "scores")

        raw_legend = dict(getattr(answer, "legend", None) or {})
        raw_probabilities = dict(getattr(answer, "probabilities", None) or {})

        return ScoreDecision(
            score=float(getattr(answer, "score")),
            confidence=self._optional_float(getattr(answer, "confidence", None)),
            legend={
                int(key): self._legend_text(value)
                for key, value in raw_legend.items()
            },
            probabilities={
                int(key): float(value) for key, value in raw_probabilities.items()
            },
            model=self._model(response),
        )
