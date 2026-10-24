#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
command -v python3 >/dev/null
command -v docker >/dev/null
docker compose version >/dev/null
mkdir -p secrets evidence
if ! test -s secrets/vnc_password; then
  python3 -c 'import secrets; from pathlib import Path; Path("secrets/vnc_password").write_text(secrets.token_urlsafe(6))'
fi
chmod 700 secrets
chmod 600 secrets/vnc_password
python3 bootstrap.py --all
python3 preflight.py
docker compose build runtime
docker compose up -d runtime
docker compose ps
echo 'Runtime started locally. Public routing and logged-in E2E still require verification.'
