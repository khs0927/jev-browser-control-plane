#!/usr/bin/env python3
"""Fetch immutable upstream sources; never activate multiple senders."""
import argparse
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='Also prepare inactive alternatives')
    args = parser.parse_args()
    lock = json.loads((ROOT / 'upstreams.lock.json').read_text())
    for name, spec in lock.items():
        if spec.get('available') is False:
            print(name + ': unavailable upstream; not installed')
            continue
        if not args.all and spec['role'] != 'primary':
            continue
        target = ROOT / 'vendor' / name
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            run('git', 'clone', '--no-checkout', 'https://github.com/' + spec['repository'] + '.git', str(target))
        else:
            origin = run('git', '-C', str(target), 'remote', 'get-url', 'origin')
            if origin != 'https://github.com/' + spec['repository'] + '.git':
                raise RuntimeError('Unexpected upstream remote: ' + name)
            if run('git', '-C', str(target), 'status', '--porcelain'):
                raise RuntimeError('Preserving modified upstream: ' + name)
        run('git', '-C', str(target), 'fetch', 'origin', spec['commit'])
        run('git', '-C', str(target), 'checkout', '--detach', spec['commit'])
        assert run('git', '-C', str(target), 'rev-parse', 'HEAD') == spec['commit']
        print(name + ': pinned source ready (' + spec['role'] + ')')

if __name__ == '__main__':
    main()
