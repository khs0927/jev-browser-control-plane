"""Browser handoff checkpoints recorded around a Jev decision.

A Jev decision is advisory classification evidence. It never authorizes a browser
action. The checkpoint makes that boundary explicit and machine-checkable: a
checkpoint is always created with ``requires_fresh_snapshot=True`` and
``browser_action_authorized=False``, and neither field can be set at construction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from .router import JevDecision

CHECKPOINT_KIND = "jev-decision-checkpoint"


@dataclass(frozen=True)
class BrowserSource:
    """Identity of the browser surface a decision was made against."""

    tab_id: str | None = None
    url: str | None = None
    page_title: str | None = None


@dataclass(frozen=True)
class JevDecisionCheckpoint:
    """A durable record of one Jev decision and the browser action it precedes.

    The two safety fields are ``init=False`` on purpose. In the TypeScript original
    they were literal types, which are erased at runtime; here a caller cannot
    construct a checkpoint that claims the action was already authorized.
    """

    purpose: str
    decision: JevDecision
    next_browser_action: str
    observed_at: str
    model: str | None = None
    source: BrowserSource | None = None
    kind: Literal["jev-decision-checkpoint"] = field(default=CHECKPOINT_KIND, init=False)
    requires_fresh_snapshot: Literal[True] = field(default=True, init=False)
    browser_action_authorized: Literal[False] = field(default=False, init=False)


def create_checkpoint(
    *,
    purpose: str,
    decision: JevDecision,
    next_browser_action: str,
    source: BrowserSource | None = None,
    observed_at: str | None = None,
) -> JevDecisionCheckpoint:
    """Record a Jev decision together with the browser action that follows it.

    Preserve the existing browser tab across the decision. After it, reattach to
    the same tab, take a fresh snapshot, and only then continue.
    """
    if not purpose.strip():
        raise ValueError("checkpoint requires a purpose")
    if not next_browser_action.strip():
        raise ValueError("checkpoint requires the next browser action")

    return JevDecisionCheckpoint(
        purpose=purpose.strip(),
        decision=decision,
        next_browser_action=next_browser_action.strip(),
        observed_at=observed_at or datetime.now(timezone.utc).isoformat(),
        model=decision.model,
        source=source,
    )


def assert_resume_allowed(
    checkpoint: JevDecisionCheckpoint, *, fresh_snapshot_taken: bool
) -> None:
    """Guard the resume path after a checkpoint.

    Raises unless a fresh snapshot of the same tab was taken after the decision.
    The page may have changed while Jev was deciding, so the decision must never
    be applied to a stale view.
    """
    if not fresh_snapshot_taken:
        raise PermissionError(
            "a Jev decision checkpoint requires a fresh browser snapshot before "
            "the next action; reattach to the same tab and re-observe the page"
        )
