from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .router import Decision


class Disposition(str, Enum):
    EXECUTE = "execute"
    PLANNER = "planner"
    REOBSERVE = "reobserve"


@dataclass(frozen=True)
class DecisionPolicy:
    """Conservative gate around Jev decisions."""

    auto_confidence: float = 0.88
    planner_confidence: float = 0.62

    def disposition(self, decision: Decision) -> Disposition:
        if decision.confidence is None:
            return Disposition.PLANNER
        if decision.confidence >= self.auto_confidence:
            return Disposition.EXECUTE
        if decision.confidence >= self.planner_confidence:
            return Disposition.PLANNER
        return Disposition.REOBSERVE


def disposition_for_noul(policy: DecisionPolicy, noul: float) -> Disposition:
    """Map a noul probability onto a disposition.

    ``NoulDecision`` carries no ``confidence`` field, because the probability that
    a statement is true is not the same quantity as a choice confidence. Use this
    instead of passing a noul result to :meth:`DecisionPolicy.disposition`, which
    would raise. The bands are the same numbers, applied explicitly.
    """
    if noul >= policy.auto_confidence:
        return Disposition.EXECUTE
    if noul >= policy.planner_confidence:
        return Disposition.PLANNER
    return Disposition.REOBSERVE
