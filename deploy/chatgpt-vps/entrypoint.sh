#!/bin/sh
set -eu
umask 077
runtime_home=/home/runner
mkdir -p "$runtime_home/state/logs" "$runtime_home/browser-profile" "$runtime_home/.local/share/ChatCmdClient/workspace"
test -s /run/secrets/vnc_password || { echo 'Missing VNC password secret' >&2; exit 1; }
x11vnc -storepasswd "$(cat /run/secrets/vnc_password)" "$runtime_home/state/vnc.pass" >/dev/null 2>&1
chown runner:runner "$runtime_home" "$runtime_home/state" "$runtime_home/state/logs" \
  "$runtime_home/state/vnc.pass" "$runtime_home/browser-profile" "$runtime_home/.local" \
  "$runtime_home/.local/share" "$runtime_home/.local/share/ChatCmdClient" \
  "$runtime_home/.local/share/ChatCmdClient/workspace"
exec gosu runner supervisord -n -c /etc/supervisor/conf.d/runtime.conf
