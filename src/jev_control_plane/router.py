from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class Decision:
    choice: str
    confidence: float | None
    probabilities: Mapping[str, float]


class JevRouter:
    """Compatibility wrapper around the official TypeSafe Jev SDK."""

    def __init__(self, client: Any | None = None, choice_type: Any | None = None) -> None:
        self._client = client
        self._choice_type = choice_type

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

    @staticmethod
    def _answer(response: Any, name: str) -> Any:
        for attr in ("answers", "choices"):
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
        answer = self._answer(response, question_name)

        choice = str(getattr(answer, "choice"))
        if choice not in candidates:
            raise RuntimeError(f"Jev returned unknown candidate {choice!r}")

        confidence = getattr(answer, "confidence", None)
        if confidence is not None:
            confidence = float(confidence)

        raw_probabilities = getattr(answer, "probabilities", None) or {}
        probabilities = {
            str(key): float(value) for key, value in dict(raw_probabilities).items()
        }

        return Decision(
            choice=choice,
            confidence=confidence,
            probabilities=probabilities,
        )
