from __future__ import annotations

import asyncio
from functools import lru_cache
from time import perf_counter
from typing import Any

from mcp.server.fastmcp import FastMCP

from .candidates import (
    criteria_map,
    parse_candidates,
    validate_choice,
    validate_confidence,
)
from .provider import normalize_response, provider_from_env

mcp = FastMCP(
    "jev-control-plane",
    instructions=(
        "Jev is a bounded decision model, not a text generator. "
        "Use jev_step before browser actions when a finite candidate table exists. "
        "Execute only the returned original tool/arguments. "
        "Never invent selectors, input values, or actions outside the candidates."
    ),
)


@lru_cache(maxsize=1)
def _provider() -> Any:
    return provider_from_env()


def _system_one(
    *,
    state: Any,
    questions: dict[str, Any],
    model: str | None = None,
    timeout_s: float | None = None,
) -> dict[str, Any]:
    return normalize_response(
        _provider().system_one(
            state=state,
            questions=questions,
            model=model,
            timeout=timeout_s,
        )
    )


def _choose(
    *,
    goal: str,
    observation: dict[str, Any] | str,
    candidates: list[dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
    model: str | None = None,
    timeout_s: float | None = None,
    min_confidence: float = 0.0,
) -> dict[str, Any]:
    if not isinstance(goal, str) or not goal.strip() or len(goal) > 4000:
        raise ValueError("goal must contain 1 to 4000 characters")

    threshold = validate_confidence(min_confidence, name="min_confidence")
    parsed = parse_candidates(candidates)
    started = perf_counter()

    response = _system_one(
        state={
            "goal": goal,
            "observation": observation,
            "history": (history or [])[-6:],
            "rule": (
                "Return only one supplied candidate id. "
                "Do not invent tools, selectors, arguments, or text values."
            ),
        },
        questions={
            "aside_action": {
                "type": "choice",
                "instructions": (
                    "Which complete executable action should the Aside agent run next? "
                    "Pick exactly one candidate id from the criteria."
                ),
                "criteria": criteria_map(parsed),
            }
        },
        model=model,
        timeout_s=timeout_s,
    )
    answer = response["answers"]["aside_action"]
    choice = answer["choice"]
    candidate = validate_choice(choice, parsed)
    confidence = validate_confidence(answer.get("confidence", 0.0))

    downgraded = False
    suggested = None
    if confidence < threshold and candidate.id != "abstain":
        suggested = candidate.id
        candidate = next(item for item in parsed if item.id == "abstain")
        downgraded = True

    probabilities = answer.get("probabilities") or {}
    known = {item.id for item in parsed}
    if any(key not in known for key in probabilities):
        raise ValueError("Jev returned probability for an unknown candidate")

    return {
        "choice_id": candidate.id,
        "suggested_choice_id": suggested,
        "confidence": confidence,
        "probabilities": {
            item.id: float(probabilities.get(item.id, 0.0)) for item in parsed
        },
        "candidate": candidate.to_dict(),
        "downgraded_to_abstain": downgraded,
        "provider": _provider().status().source,
        "model": _provider().status().model,
        "timing_ms": round((perf_counter() - started) * 1000, 3),
        "execute": {
            "tool": candidate.tool,
            "arguments": candidate.arguments,
            "should_execute": candidate.id != "abstain" and bool(candidate.tool),
        },
    }


@mcp.tool(name="jev_provider_status")
async def jev_provider_status() -> dict[str, Any]:
    """Return the active Jev backend without exposing credentials."""
    return _provider().status().to_dict()


@mcp.tool(name="jev_system_one")
async def jev_system_one(
    state: dict[str, Any] | str | list[Any],
    questions: dict[str, Any],
    model: str | None = None,
    timeout_s: float | None = None,
) -> dict[str, Any]:
    """Run one raw System One request using Choice, Score and/or Noul questions."""
    return await asyncio.to_thread(
        _system_one,
        state=state,
        questions=questions,
        model=model,
        timeout_s=timeout_s,
    )


@mcp.tool(name="jev_choose")
async def jev_choose(
    goal: str,
    observation: dict[str, Any] | str,
    candidates: list[dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
    model: str | None = None,
    timeout_s: float | None = None,
) -> dict[str, Any]:
    """Choose exactly one app-owned candidate. This tool never executes it."""
    return await asyncio.to_thread(
        _choose,
        goal=goal,
        observation=observation,
        candidates=candidates,
        history=history,
        model=model,
        timeout_s=timeout_s,
        min_confidence=0.0,
    )


@mcp.tool(name="jev_step")
async def jev_step(
    goal: str,
    observation: dict[str, Any] | str,
    candidates: list[dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
    min_confidence: float = 0.70,
    model: str | None = None,
    timeout_s: float | None = None,
) -> dict[str, Any]:
    """Choose, validate, confidence-gate and return an execution payload."""
    return await asyncio.to_thread(
        _choose,
        goal=goal,
        observation=observation,
        candidates=candidates,
        history=history,
        model=model,
        timeout_s=timeout_s,
        min_confidence=min_confidence,
    )


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
