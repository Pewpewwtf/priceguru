#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose ps
echo "--- last worker logs ---"
docker compose logs --tail=80 ozon-browser
