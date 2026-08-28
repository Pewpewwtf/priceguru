#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

read -rp "PriceGuru cloud URL (https://...): " CLOUD_URL
read -rp "OZON_AGENT_KEY (same as Timeweb ENV): " OZON_AGENT_KEY
read -rsp "VNC password (use 8+ characters): " VNC_PASSWORD; echo
read -rp "Ozon proxy URL (optional, Enter = no proxy): " OZON_PROXY_URL

if [[ ! "$CLOUD_URL" =~ ^https?:// ]]; then echo "Bad CLOUD_URL"; exit 1; fi
if [[ -z "$OZON_AGENT_KEY" ]]; then echo "OZON_AGENT_KEY is empty"; exit 1; fi
if [[ ${#VNC_PASSWORD} -lt 8 ]]; then echo "VNC password must be at least 8 characters"; exit 1; fi

cat > .env <<ENV
CLOUD_URL=${CLOUD_URL%/}
OZON_AGENT_KEY=$OZON_AGENT_KEY
VNC_PASSWORD=$VNC_PASSWORD
OZON_PROXY_URL=$OZON_PROXY_URL
AGENT_ID=timeweb-ozon-vps
POLL_MS=1400
CHROME_PROFILE_DIR=/data/chrome-profile
ENV
chmod 600 .env
mkdir -p data

echo
if command -v docker >/dev/null 2>&1; then
  echo "Docker found."
else
  echo "Docker not found. Install it first: curl -fsSL https://get.docker.com | sh"
fi
echo "Configuration saved to $(pwd)/.env"
