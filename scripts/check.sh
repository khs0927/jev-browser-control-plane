#!/usr/bin/env bash
set -euo pipefail
python3 -m compileall -q src tests scripts
PYTHONPATH=src "${PYTHON:-.venv/bin/python}" -m pytest -q
PYTHONPATH=src python3 scripts/validate_skills.py
PYTHONPATH=src python3 -m jev_control_plane.cli bridge-health
