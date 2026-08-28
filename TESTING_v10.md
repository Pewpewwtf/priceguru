# PriceGuru v10.0 testing

Checked before packaging:
- Node syntax: server.js, collectors.js, ozon-agent-cloud.js, ozon-vps/worker.js, parsers.
- Bash syntax: ozon-vps/start.sh, configure.sh, update.sh, status.sh.
- Ozon composer/parser unit tests pass for both cloud and VPS parser copies.
- Ozon agent PostgreSQL schema/migration is present in db.js.
- Docker Compose keeps /data persistent and exposes noVNC only on 127.0.0.1:6080.
- Cloud health reports version 10.0 and cloud-vps-browser mode.

Not possible from this environment: a real Timeweb VPS deployment and a live authenticated Ozon session. Those must be verified after deployment with /api/health and noVNC.
