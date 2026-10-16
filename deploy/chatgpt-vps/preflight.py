#!/usr/bin/env python3
"""Report presence only, never credential values."""
import json
import pathlib
import shutil
import subprocess
import sys
ROOT = pathlib.Path(__file__).resolve().parent
checks = {
    'docker': bool(shutil.which('docker')),
    'chatcmd_source': (ROOT / 'vendor/chatcmd/Cargo.lock').is_file(),
    'vnc_secret': (ROOT / 'secrets/vnc_password').is_file(),
}
if checks['docker']:
    result = subprocess.run(['docker', 'compose', 'version'], capture_output=True)
    checks['compose'] = result.returncode == 0
    checks['docker_daemon'] = subprocess.run(['docker', 'info'], capture_output=True).returncode == 0
print(json.dumps({'checks': checks, 'ready_to_build': all(checks.values())}, indent=2))
sys.exit(0 if all(checks.values()) else 1)
