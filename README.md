# Jev Browser Control Plane

Thin integration around official TypeSafe Jev and existing open-source browser runtimes.

## Principle

Reuse upstream implementations. Project-owned code is limited to routing, confidence policy, independent verification, and the existing secure remote-browser attachment.

## Core stack

- TypeSafe SDK 0.7.1 for official Jev decisions. `JevRouter` exposes all three System One question types: `choose`, `noul`, and `score`. The official SDK is the only supported transport; see docs/JEV_DECISION.md for why the OpenCode Zen free endpoint is not used.
- `checkpoint.py` records a decision together with the browser action it precedes, and refuses to resume without a fresh snapshot.
- browser-use/jev-ultrafast for the fast browser action loop.
- browser-harness 0.1.13 for local Chrome/Edge CDP execution.
- workflow-use as an optional deterministic replay layer after a task succeeds.
- the existing browser bridge for the remote Windows session.

See docs/ARCHITECTURE.md, docs/JEV_DECISION.md, and artifacts/IMPLEMENTATION_REPORT.md.

## Architecture

Goal or planner -> official Jev -> jev-ultrafast -> browser-harness -> local Edge or Chrome.

For remote Windows control, the existing secure browser bridge remains the transport. The bridge keeps authentication, tool policy, serialized browser writes, and replay protection outside this repository.

A model DONE choice is never treated as proof. The requested outcome is verified independently after execution.

## Local checks

Use Python 3.12 or newer.

```bash
PYTHONPATH=src python -m jev_control_plane.cli bridge-health
PYTHONPATH=src python -m jev_control_plane.cli bridge-tools
PYTHONPATH=src .venv2/bin/pytest -q
PYTHONPATH=src python scripts/validate_skills.py
python -m compileall -q src tests scripts
```

`scripts/check.sh` covers the same ground. To verify the Jev layer against the real SDK, use `scripts/verify_jev.sh` instead, which builds its own venv.

## Skills

Workflow skills live in `skills/`, one `SKILL.md` per directory. `skills/README.md` lists them and records their provenance. `scripts/validate_skills.py` checks the front matter, the confirmation guidance, and that no vocabulary from the ported source project has crept back in.

## Verifying the Jev path

```bash
./scripts/verify_jev.sh                        # SDK contract tests, offline
TYPESAFE_API_KEY=... ./scripts/verify_jev.sh    # plus the live smoke test
```

`verify_jev.sh` builds a local venv, installs the project with its dev extras (which pins `typesafe-sdk`), and runs everything. It exists because a restricted agent sandbox cannot load `pydantic_core`, the SDK's native dependency, so these checks have to run from a normal terminal.

`tests/test_sdk_contract.py` asserts the router's question objects and answer parsing against the installed SDK, and skips when the SDK is not importable. `scripts/jev_smoke.py` runs one live question of each type; it is read-only and needs a TypeSafe account key in the environment.
