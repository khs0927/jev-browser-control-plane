# Jev Browser Control Plane

Thin integration around official TypeSafe Jev and existing open-source browser runtimes.

## Principle

Reuse upstream implementations. Project-owned code is limited to routing, confidence policy, independent verification, and the existing secure remote-browser attachment.

## Core stack

- TypeSafe SDK 0.7.1 for official Jev decisions.
- browser-use/jev-ultrafast for the fast browser action loop.
- browser-harness 0.1.13 for local Chrome/Edge CDP execution.
- workflow-use as an optional deterministic replay layer after a task succeeds.
- the existing browser bridge for the remote Windows session.

See docs/ARCHITECTURE.md and artifacts/IMPLEMENTATION_REPORT.md.

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
python -m compileall -q src tests
```
