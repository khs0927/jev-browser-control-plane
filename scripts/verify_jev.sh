#!/usr/bin/env bash
#
# Verify the Jev decision layer against the real TypeSafe SDK.
#
# This is the check that cannot run inside a restricted agent sandbox: the SDK
# depends on a native module (pydantic_core) that some macOS sandboxes refuse to
# load, and the agent process is not allowed to bypass that. Run this from your
# own terminal instead.
#
#   ./scripts/verify_jev.sh
#
# What it does:
#   1. creates .venv-jev (or reuses it) with Python >= 3.12
#   2. installs the project with its dev extras, which pins typesafe-sdk
#   3. runs the test suite, including tests/test_sdk_contract.py, which builds
#      real SDK question objects and parses real SDK answer models
#   4. validates the skills
#   5. if TYPESAFE_API_KEY is set, runs the live smoke test
#
# The live smoke is the only step that talks to the network. It is read-only and
# performs no browser work.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${REPO_ROOT}/.venv-jev"
PY="${VENV}/bin/python"

cd "${REPO_ROOT}"

step() { printf '\n==> %s\n' "$1"; }

step "Locating a Python >= 3.12"
INTERPRETER=""
for candidate in python3.13 python3.12 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)'; then
      INTERPRETER="$candidate"
      break
    fi
  fi
done
if [ -z "${INTERPRETER}" ]; then
  echo "error: no python3.12+ on PATH. This project requires >= 3.12." >&2
  exit 1
fi
echo "    using ${INTERPRETER} ($("${INTERPRETER}" -V 2>&1))"

step "Preparing ${VENV}"
if [ ! -x "${PY}" ]; then
  "${INTERPRETER}" -m venv "${VENV}"
fi
"${PY}" -m pip install --quiet --upgrade pip

step "Installing the project with dev extras"
# This pulls typesafe-sdk==0.7.1, which is what makes the contract tests real.
"${PY}" -m pip install --quiet -e ".[dev]"

step "Checking that the SDK is importable"
"${PY}" - <<'PY'
import sys
try:
    import typesafe_sdk
except Exception as exc:  # noqa: BLE001
    print(f"error: typesafe_sdk could not be imported: {exc!r}", file=sys.stderr)
    print("If this is a dlopen / code signature error, some macOS policies block", file=sys.stderr)
    print("loading unsigned native modules. Run this from a normal terminal.", file=sys.stderr)
    raise SystemExit(1)
print(f"    typesafe_sdk {getattr(typesafe_sdk, '__version__', 'unknown')} imported")
PY

step "Running the test suite"
"${PY}" -m pytest -q

step "Validating the skills"
"${PY}" scripts/validate_skills.py

if [ -n "${TYPESAFE_API_KEY:-}" ]; then
  step "Running the live Jev smoke test"
  PYTHONPATH=src "${PY}" scripts/jev_smoke.py
else
  step "Skipping the live smoke test"
  echo "    TYPESAFE_API_KEY is not set."
  echo "    Get a key at https://console.typesafe.ai/ and re-run:"
  echo "      TYPESAFE_API_KEY=... ./scripts/verify_jev.sh"
fi

printf '\nAll local verification passed.\n'
