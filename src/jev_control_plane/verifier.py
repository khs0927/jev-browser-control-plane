from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class Verification:
    ok: bool
    reason: str


def require(predicate: Callable[[Any], bool], state: Any, reason: str) -> Verification:
    """Treat model DONE as a claim and verify the outcome independently."""
    try:
        ok = bool(predicate(state))
    except Exception as exc:
        return Verification(False, f"verifier raised: {exc}")
    return Verification(ok, reason if ok else f"not verified: {reason}")
