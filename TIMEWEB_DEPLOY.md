# PriceGuru v10.0 — Timeweb deployment

App Platform still deploys from the repository root using the root `Dockerfile`.

Required App Platform ENV:

- `DATABASE_URL`
- `PGSSL=true`
- `APP_PASSWORD`
- `SESSION_SECRET`
- `OZON_AGENT_KEY` — new in v10; use a long random string.

`OZON_PROXY_URL` is no longer used by App Platform. Ozon browser/proxy settings live only on the separate Cloud Server in `ozon-vps/.env`.

Health endpoint: `/api/health`.

The separate Ozon VPS is installed from the `ozon-vps/` directory of the same Git repository. Follow `V10_SETUP_TIMEWEB.md`.
