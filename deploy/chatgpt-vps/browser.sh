#!/bin/sh
set -eu
until test -S /tmp/.X11-unix/X99; do sleep 1; done
until curl --fail --silent http://127.0.0.1:8080/api/ping >/dev/null; do sleep 1; done
# Dedicated profile, no cookie exports and no public CDP port.
exec chromium --user-data-dir="$HOME/browser-profile" \
  --no-first-run --no-default-browser-check \
  --disable-extensions-except=/opt/chatcmd-extension \
  --load-extension=/opt/chatcmd-extension \
  --window-size=1440,1000 \
  http://127.0.0.1:8080 https://chatgpt.com
