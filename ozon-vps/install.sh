#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ $(id -u) -ne 0 ]]; then echo "Run as root"; exit 1; fi
apt-get update
apt-get install -y git curl ca-certificates
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is missing"; exit 1
fi
bash configure.sh
docker compose up -d --build
sleep 3
bash status.sh
