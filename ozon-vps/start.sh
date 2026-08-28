#!/usr/bin/env bash
set -euo pipefail
export DISPLAY=${DISPLAY:-:99}
mkdir -p /data/chrome-profile /data/logs

: "${VNC_PASSWORD:?VNC_PASSWORD is required}"

rm -f /tmp/.X99-lock || true
Xvfb "$DISPLAY" -screen 0 1920x1080x24 -ac +extension RANDR > /data/logs/xvfb.log 2>&1 &
sleep 1
openbox-session > /data/logs/openbox.log 2>&1 &

x11vnc -storepasswd "$VNC_PASSWORD" /data/vnc.pass >/dev/null 2>&1
x11vnc -display "$DISPLAY" -rfbauth /data/vnc.pass -forever -shared -noxdamage -rfbport 5900 -o /data/logs/x11vnc.log &
websockify --web=/usr/share/novnc 6080 localhost:5900 > /data/logs/novnc.log 2>&1 &

exec node /app/worker.js
