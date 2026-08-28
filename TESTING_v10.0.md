# PriceGuru v10.0 — checks performed before packaging

Passed:

- `node --check` for cloud server/db/collectors/UI JS and Ozon VPS worker/parser.
- `bash -n` for VPS startup/config/update/status scripts.
- Ozon VPS parser fixture: serialized `widgetStates -> webPrice.cardPrice`.
- Price text parsing fixture.
- JSON validation for both package files.
- Cloud Ozon route verified to call the PostgreSQL-backed Ozon worker queue.
- noVNC is bound to VPS localhost only (`127.0.0.1:6080`) in Docker Compose; remote browser access is expected through an SSH tunnel.
- Secrets from the current Timeweb/PostgreSQL/proxy conversation were searched for and are not included in the archive.
- Official Playwright image `mcr.microsoft.com/playwright:v1.62.1-noble` is current and includes matching browsers/system dependencies; the npm Playwright package is pinned to the same version.

Could not be executed in this build environment:

- Full Docker build of `ozon-vps` (Docker daemon is unavailable here).
- Live Ozon login / account verification, because that requires the user's Ozon account and the final VPS network identity.
- `npm install` against the external npm registry from this container timed out; the Timeweb VPS Docker build will perform it.

The v10 design intentionally keeps PriceGuru health/API independent from the Ozon browser VPS: if the browser worker is unavailable, WB/UI/PostgreSQL remain online and Ozon returns an explicit worker-offline message.
