from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import re
from time import monotonic
from typing import Any, Callable

from .bridge import BrowserBridge, BrowserBridgeError

ELEMENT = re.compile(
    r'^\s*-\s+(?P<role>link|button|textbox|searchbox|checkbox|radio|tab|combobox)'
    r'\s+"(?P<name>(?:\\.|[^"\\])*)".*?\[ref=(?P<ref>(?:f\d+)?e\d+)\]'
)
ALLOWED_ACTIONS = {"click", "fill", "type"}
MAX_RULES = 24


@dataclass(frozen=True)
class ActionRule:
    action: str
    role: str
    name: str
    value: str | None = None

    @classmethod
    def parse(cls, raw: dict[str, Any]) -> "ActionRule":
        if not isinstance(raw, dict):
            raise ValueError("action rules must be objects")
        action = raw.get("action")
        role = raw.get("role")
        name = raw.get("name")
        value = raw.get("value")
        if action not in ALLOWED_ACTIONS:
            raise ValueError("action must be click, fill, or type")
        if not isinstance(role, str) or not role.strip() or len(role) > 64:
            raise ValueError("role must be a non-empty string")
        if not isinstance(name, str) or not name.strip() or len(name) > 512:
            raise ValueError("name must be a non-empty string")
        if action in {"fill", "type"}:
            if not isinstance(value, str) or len(value) > 4000:
                raise ValueError("fill/type requires an explicit value up to 4000 characters")
        elif value is not None:
            raise ValueError("click rules must not contain a value")
        return cls(action=action, role=role, name=name, value=value)


def snapshot_text(value: Any) -> str:
    """Extract textual accessibility-tree content without assuming one bridge shape."""

    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        preferred = []
        for key in ("snapshot", "tree", "content", "text", "result"):
            item = value.get(key)
            if isinstance(item, str):
                preferred.append(item)
        if preferred:
            return "\n".join(preferred)
        parts = [snapshot_text(item) for item in value.values()]
        return "\n".join(part for part in parts if part)
    if isinstance(value, list):
        parts = [snapshot_text(item) for item in value]
        return "\n".join(part for part in parts if part)
    return ""


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _elements(text: str) -> list[tuple[str, str, str]]:
    found: list[tuple[str, str, str]] = []
    for line in text.splitlines():
        match = ELEMENT.match(line)
        if not match or "[disabled]" in line:
            continue
        name = match["name"].replace(r'\"', '"').replace(r"\\", "\\")
        found.append((match["role"], name, match["ref"]))
    return found


def action_table(text: str, rules: list[ActionRule]) -> list[dict[str, Any]]:
    elements = _elements(text)
    counts = Counter((role, name) for role, name, _ in elements)
    rows: list[dict[str, Any]] = []
    for index, rule in enumerate(rules):
        if counts[(rule.role, rule.name)] != 1:
            continue
        ref = next(
            ref
            for role, name, ref in elements
            if (role, name) == (rule.role, rule.name)
        )
        element = f'{rule.role} "{rule.name}"'
        if rule.action == "click":
            tool = "browser_click"
            arguments = {"element": element, "ref": ref}
        else:
            tool = "browser_type"
            arguments = {
                "element": element,
                "ref": ref,
                "text": rule.value,
            }
        rows.append(
            {
                "id": f"action-{index}",
                "description": (
                    f'{rule.action} {rule.role} "{rule.name}"'
                    + (
                        " with the explicit supplied value"
                        if rule.action in {"fill", "type"}
                        else ""
                    )
                ),
                "tool": tool,
                "arguments": arguments,
            }
        )
    return rows


def compact_snapshot(
    text: str,
    *,
    goal: str,
    rules: list[ActionRule],
    completion_text: str,
    max_chars: int = 6400,
) -> dict[str, Any]:
    terms = {
        term.casefold()
        for term in re.findall(r"[\w가-힣]{2,}", f"{goal} {completion_text}")
    }
    names = {rule.name.casefold() for rule in rules}
    ranked = sorted(
        enumerate(text.splitlines()),
        key=lambda pair: (
            -int(any(name in pair[1].casefold() for name in names)) * 100
            - sum(term in pair[1].casefold() for term in terms),
            pair[0],
        ),
    )
    selected: list[tuple[int, str]] = []
    remaining = max_chars
    for index, line in ranked:
        if len(line) > 1000 or len(line) + 1 > remaining or len(selected) >= 40:
            continue
        selected.append((index, line))
        remaining -= len(line) + 1
    return {
        "page_lines": [line for _, line in sorted(selected)],
        "total_lines": len(text.splitlines()),
        "omitted_lines": len(text.splitlines()) - len(selected),
    }


def run_browser_flow(
    bridge: BrowserBridge,
    *,
    chooser: Callable[..., dict[str, Any]],
    goal: str,
    action_rules: list[dict[str, Any]],
    completion_text: str,
    scope: str | None = None,
    max_steps: int = 12,
    total_timeout_s: float = 90.0,
    min_confidence: float = 0.70,
) -> dict[str, Any]:
    if not isinstance(goal, str) or not goal.strip() or len(goal) > 4000:
        raise ValueError("goal must contain 1 to 4000 characters")
    if (
        not isinstance(action_rules, list)
        or not 1 <= len(action_rules) <= MAX_RULES
    ):
        raise ValueError(f"action_rules must contain 1 to {MAX_RULES} rules")
    rules = [ActionRule.parse(item) for item in action_rules]
    if len(set(rules)) != len(rules):
        raise ValueError("duplicate action rules are not allowed")
    if (
        not isinstance(completion_text, str)
        or not completion_text.strip()
        or len(completion_text) > 2000
    ):
        raise ValueError("completion_text must contain 1 to 2000 characters")
    if isinstance(max_steps, bool) or not isinstance(max_steps, int) or not 1 <= max_steps <= 30:
        raise ValueError("max_steps must be 1 to 30")
    if (
        isinstance(total_timeout_s, bool)
        or not isinstance(total_timeout_s, (int, float))
        or not 1 <= total_timeout_s <= 300
    ):
        raise ValueError("total_timeout_s must be 1 to 300")

    started = monotonic()
    history: list[dict[str, Any]] = []
    seen: Counter[str] = Counter()
    executed: set[tuple[str, str]] = set()

    def result(status: str, *, error: str | None = None) -> dict[str, Any]:
        return {
            "status": status,
            "verified": status == "verified",
            "steps": history,
            "elapsed_ms": round((monotonic() - started) * 1000, 3),
            "error": error,
            "automatic_fallback": False,
        }

    try:
        current_raw = bridge.call("browser_snapshot", {}, scope=scope)
        current_text = snapshot_text(current_raw)
        if not current_text:
            return result("execution_uncertain", error="browser snapshot had no text")

        for step in range(1, max_steps + 1):
            if monotonic() - started >= total_timeout_s:
                return result("time_budget")

            identity = fingerprint(current_text)
            seen[identity] += 1
            if seen[identity] >= 3:
                return result("loop_detected")

            candidates = action_table(current_text, rules)
            completed = completion_text in current_text
            if completed:
                candidates.append(
                    {
                        "id": "finish",
                        "description": (
                            "The explicit completion text is visible. "
                            "Finish only if the current observation still matches."
                        ),
                        "tool": None,
                        "arguments": {},
                    }
                )
            if not candidates:
                return result(
                    "needs_input",
                    error="no unique authorized action is visible on the current page",
                )

            decision = chooser(
                goal=goal,
                observation=compact_snapshot(
                    current_text,
                    goal=goal,
                    rules=rules,
                    completion_text=completion_text,
                ),
                candidates=candidates,
                history=history[-6:],
                min_confidence=min_confidence,
            )
            choice = decision["choice_id"]
            entry = {
                "step": step,
                "choice_id": choice,
                "confidence": decision["confidence"],
                "executed": False,
                "execution_state": "not_started",
            }
            history.append(entry)

            if choice == "abstain":
                return result("abstained")
            if choice == "finish":
                confirmed = snapshot_text(
                    bridge.call("browser_snapshot", {}, scope=scope)
                )
                if fingerprint(confirmed) != identity:
                    return result("stale_observation")
                if completion_text not in confirmed:
                    return result("stale_observation")
                return result("verified")

            signature = (identity, choice)
            if signature in executed:
                return result("loop_detected")
            executed.add(signature)

            candidate = decision["candidate"]
            tool = candidate.get("tool")
            arguments = candidate.get("arguments")
            if not isinstance(tool, str) or not isinstance(arguments, dict):
                return result("invalid_choice")

            # Check that the page did not change between the Jev decision and execution.
            confirmed = snapshot_text(
                bridge.call("browser_snapshot", {}, scope=scope)
            )
            if fingerprint(confirmed) != identity:
                return result("stale_observation")

            entry["execution_state"] = "unconfirmed"
            bridge.call(
                tool,
                arguments,
                scope=scope,
                mutation_id=bridge.mutation_id(goal, f"{step}:{choice}"),
            )
            entry["executed"] = True
            entry["execution_state"] = "confirmed"

            after = snapshot_text(bridge.call("browser_snapshot", {}, scope=scope))
            if not after:
                return result(
                    "execution_uncertain",
                    error="post-action snapshot had no text",
                )
            entry["page_changed"] = fingerprint(after) != identity
            if not entry["page_changed"]:
                return result("no_progress")
            current_text = after

        return result("step_budget")
    except BrowserBridgeError as exc:
        return result("execution_uncertain", error=str(exc))
