import json
import sys

import pytest

from jev_control_plane.aside_setup import AsideSetupError, apply, plan


def test_plan_preserves_existing_settings(tmp_path):
    profile = tmp_path / "account"
    profile.mkdir()
    original = {
        "theme": "dark",
        "mcp": {
            "servers": {"keep-me": {"command": "example"}},
            "inventories": {"keep": True},
        },
    }
    (profile / "settings.json").write_text(json.dumps(original), encoding="utf-8")

    result, merged, agents, skill = plan(profile)

    assert merged["theme"] == "dark"
    assert merged["mcp"]["servers"]["keep-me"] == {"command": "example"}
    assert merged["mcp"]["inventories"] == {"keep": True}
    entry = merged["mcp"]["servers"]["jev-control-plane"]
    assert entry["command"] == sys.executable
    assert entry["transport"] == "stdio"
    assert "jev_control_plane.aside_mcp" in entry["args"]
    assert "BEGIN jev-browser-control-plane" in agents
    assert "Managed by jev-browser-control-plane" in skill
    assert result.settings_changed is True


def test_plan_refuses_unowned_mcp_collision(tmp_path):
    profile = tmp_path / "account"
    profile.mkdir()
    (profile / "settings.json").write_text(
        json.dumps(
            {
                "mcp": {
                    "servers": {
                        "jev-control-plane": {
                            "command": "some-other-program"
                        }
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(AsideSetupError):
        plan(profile)


def test_plan_refuses_unowned_skill(tmp_path):
    profile = tmp_path / "account"
    skill = profile / "skills" / "user" / "aside-jev" / "SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("user-owned", encoding="utf-8")
    with pytest.raises(AsideSetupError):
        plan(profile)


def test_apply_is_idempotent_and_keeps_other_settings(tmp_path):
    profile = tmp_path / "account"
    profile.mkdir()
    (profile / "settings.json").write_text(
        json.dumps({"custom": {"keep": [1, 2, 3]}}),
        encoding="utf-8",
    )

    first = apply(profile)
    second_plan, merged, _, _ = plan(profile)

    assert first["applied"] is True
    assert merged["custom"] == {"keep": [1, 2, 3]}
    assert second_plan.settings_changed is False
    assert second_plan.agents_changed is False
    assert second_plan.skill_changed is False
