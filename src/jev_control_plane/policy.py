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
