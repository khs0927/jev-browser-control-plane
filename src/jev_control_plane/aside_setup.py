from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any

SERVER_NAME = "jev-control-plane"
SKILL_DIR = Path("skills") / "user" / "aside-jev"
SKILL_MARKER = "<!-- Managed by jev-browser-control-plane. -->"
BEGIN = "# BEGIN jev-browser-control-plane"
END = "# END jev-browser-control-plane"


class AsideSetupError(RuntimeError):
    pass


@dataclass(frozen=True)
class AsidePlan:
    profile: Path
    settings_path: Path
    agents_path: Path
    skill_path: Path
    mcp_entry: dict[str, Any]
    settings_changed: bool
    agents_changed: bool
    skill_changed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile": str(self.profile),
            "settings_path": str(self.settings_path),
            "agents_path": str(self.agents_path),
            "skill_path": str(self.skill_path),
            "mcp_entry": self.mcp_entry,
            "changes": {
                "settings": self.settings_changed,
                "agents": self.agents_changed,
                "skill": self.skill_changed,
            },
        }


def mcp_entry() -> dict[str, Any]:
    return {
        "enabled": True,
        "transport": "stdio",
        "command": sys.executable,
        "args": ["-m", "jev_control_plane.aside_mcp"],
        "env": {
            "JEV_PROVIDER": "zen-free",
            "JEV_ZEN_CLIENT_ID": "jev-browser-control-plane",
        },
    }


def managed_instruction_block() -> str:
    return (
        f"{BEGIN}\n"
        "For browser tasks, use the installed aside-jev skill and route bounded "
        "action selection through the jev-control-plane MCP before choosing a "
        "browser action yourself. Prefer jev_browser_run for bounded multi-step "
        "flows; otherwise execute only caller-owned candidates returned by "
        "jev_step. Re-observe after page changes. Do not use Jev decisions "
        "as user approval for sensitive actions.\n"
        f"{END}"
    )


def managed_skill() -> str:
    return f"""---
name: "aside-jev"
description: "Automatically use Jev System One as the bounded decision layer for Aside browser actions."
---
{SKILL_MARKER}
# Aside Jev

For browser work, observe first and build a finite table of actions that are visible and already authorized. Call `jev_step` before choosing an action yourself.

Execute only the exact `tool` and `arguments` returned when `should_execute=true`. If Jev abstains, confidence is low, the provider fails, or the page changed, do not guess: re-observe or return control to the main planner.

Jev is a decision model, not a text generator. Never ask it to invent credentials, free-form text, selectors, URLs, or tool arguments. Use `jev_system_one` to batch bounded Choice/Score/Noul checks when useful. User approval remains mandatory for sensitive or irreversible side effects.
"""


def _profile(path: str | Path) -> Path:
    profile = Path(path).expanduser().resolve()
    if not profile.is_dir():
        raise AsideSetupError(f"Aside profile does not exist: {profile}")
    return profile


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AsideSetupError(f"Cannot parse {path}") from exc
    if not isinstance(value, dict):
        raise AsideSetupError(f"{path} must contain a JSON object")
    return value


def _merge_settings(settings: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    result = json.loads(json.dumps(settings))
    mcp = result.setdefault("mcp", {})
    if not isinstance(mcp, dict):
        raise AsideSetupError("settings.mcp must be an object")
    servers = mcp.setdefault("servers", {})
    if not isinstance(servers, dict):
        raise AsideSetupError("settings.mcp.servers must be an object")
    existing = servers.get(SERVER_NAME)
    if existing is not None and existing != entry:
        raise AsideSetupError(
            f"An unrelated {SERVER_NAME!r} MCP entry already exists; refusing to overwrite it"
        )
    servers[SERVER_NAME] = entry
    return result


def _merge_agents(original: str) -> str:
    begin_count = original.count(BEGIN)
    end_count = original.count(END)
    if begin_count != end_count or begin_count > 1:
        raise AsideSetupError("Managed AGENTS.md markers are damaged")
    block = managed_instruction_block()
    if begin_count == 1:
        start = original.index(BEGIN)
        finish = original.index(END, start) + len(END)
        merged = original[:start] + block + original[finish:]
    else:
        prefix = original.rstrip()
        merged = f"{prefix}\n\n{block}\n" if prefix else f"{block}\n"
    return merged


def _check_skill(original: str | None) -> None:
    if original is None:
        return
    header = original.splitlines()[:8]
    if SKILL_MARKER not in header:
        raise AsideSetupError(
            "Existing aside-jev skill is not managed by this project; refusing to overwrite it"
        )


def plan(profile_dir: str | Path) -> tuple[AsidePlan, dict[str, Any], str, str]:
    profile = _profile(profile_dir)
    settings_path = profile / "settings.json"
    agents_path = profile / "AGENTS.md"
    skill_path = profile / SKILL_DIR / "SKILL.md"
    entry = mcp_entry()

    settings = _read_json(settings_path)
    merged_settings = _merge_settings(settings, entry)

    agents = agents_path.read_text(encoding="utf-8") if agents_path.exists() else ""
    merged_agents = _merge_agents(agents)

    existing_skill = skill_path.read_text(encoding="utf-8") if skill_path.exists() else None
    _check_skill(existing_skill)
    skill = managed_skill()

    result = AsidePlan(
        profile=profile,
        settings_path=settings_path,
        agents_path=agents_path,
        skill_path=skill_path,
        mcp_entry=entry,
        settings_changed=merged_settings != settings,
        agents_changed=merged_agents != agents,
        skill_changed=skill != existing_skill,
    )
    return result, merged_settings, merged_agents, skill


def _backup(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(f"{path.name}.jev-control-plane.{stamp}.bak")
    shutil.copy2(path, backup)
    return backup


def _atomic_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        handle.write(content)
        temp = Path(handle.name)
    temp.replace(path)


def apply(profile_dir: str | Path) -> dict[str, Any]:
    result, settings, agents, skill = plan(profile_dir)
    backups: list[str] = []
    try:
        for path, changed in (
            (result.settings_path, result.settings_changed),
            (result.agents_path, result.agents_changed),
            (result.skill_path, result.skill_changed),
        ):
            if changed:
                backup = _backup(path)
                if backup:
                    backups.append(str(backup))

        if result.settings_changed:
            _atomic_text(
                result.settings_path,
                json.dumps(settings, indent=2, ensure_ascii=False) + "\n",
            )
        if result.agents_changed:
            _atomic_text(result.agents_path, agents)
        if result.skill_changed:
            _atomic_text(result.skill_path, skill)
    except Exception as exc:
        raise AsideSetupError(
            "Aside setup write failed. Backups were created; inspect them before retrying."
        ) from exc

    output = result.to_dict()
    output["applied"] = True
    output["backups"] = backups
    output["restart_required"] = True
    return output
