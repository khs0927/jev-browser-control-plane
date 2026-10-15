#!/usr/bin/env python3
"""Local process readiness only; never report login or goal completion."""
import json
from pathlib import Path
import socket
import urllib.request


def browser_state(proc=Path('/proc')):
    present = False
    unsafe = False
    try:
        entries = list(proc.iterdir())
    except OSError:
        return False, False
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / 'cmdline').read_bytes().decode().strip('\0').split('\0')
        except (OSError, UnicodeError):
            continue
        if not args or Path(args[0]).name not in ('chromium', 'chrome'):
            continue
        if '--user-data-dir=/home/runner/browser-profile' not in args:
            continue
        if any(arg.startswith('--type=') for arg in args):
            continue
        present = True
        if any(arg.split('=', 1)[0] in ('--no-sandbox', '--disable-setuid-sandbox',
                                       '--disable-namespace-sandbox', '--disable-seccomp-filter-sandbox')
               for arg in args):
            unsafe = True
    return present, present and not unsafe


def check():
    present, sandbox_flags = browser_state()
    checks = {'browser_process': present, 'sandbox_flags_allowed': sandbox_flags,
              'display_socket': Path('/tmp/.X11-unix/X99').is_socket()}
    try:
        # Do not honor proxy environment variables for container loopback checks.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:8080/api/ping', timeout=2) as response:
            checks['chatcmd_http'] = response.status == 200
    except (OSError, ValueError):
        checks['chatcmd_http'] = False
    try:
        with socket.create_connection(('127.0.0.1', 6080), timeout=2):
            checks['novnc_port'] = True
    except OSError:
        checks['novnc_port'] = False
    return {'checks': checks, 'runtime_ready': all(checks.values()),
            'chatgpt_login_verified': False, 'bridge_delivery_verified': False,
            'goal_completion_verified': False}


if __name__ == '__main__':
    result = check()
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result['runtime_ready'] else 1)
