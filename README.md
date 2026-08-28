# PriceGuru v10.0 — Cloud + persistent Ozon Chrome

Architecture:

- PriceGuru UI/API/WB: Timeweb App Platform.
- Data/history: Timeweb PostgreSQL.
- Ozon: separate Timeweb Cloud Server running a persistent graphical Chromium profile 24/7.
- One-time Ozon login is done by the user through a private noVNC screen over an SSH tunnel. PriceGuru never stores the Ozon password; the Chrome profile stores the resulting session/cookies on the VPS disk.

The `ozon-vps/` directory is intentionally included in the same Git repository. App Platform builds the root `Dockerfile`; the Cloud Server runs `ozon-vps/docker-compose.yml`.

## Required Timeweb App Platform ENV

Existing v9.x values stay unchanged:

- `DATABASE_URL`
- `PGSSL=true`
- `APP_PASSWORD`
- `SESSION_SECRET`

Add:

- `OZON_AGENT_KEY` — long random secret shared only with the Ozon VPS worker.

`OZON_PROXY_URL` in App Platform is not used in v10 and may be deleted. If a proxy is needed, configure it only inside `ozon-vps/.env`.

## Expected health

Before the VPS worker starts:

```json
{"ok":true,"version":"10.0","database":"postgres","ozonMode":"cloud-vps-browser","ozonAgentConfigured":true,"ozonAgentOnline":false}
```

After the VPS worker starts:

```json
{"ok":true,"version":"10.0","database":"postgres","ozonMode":"cloud-vps-browser","ozonAgentConfigured":true,"ozonAgentOnline":true}
```

See `V10_SETUP_TIMEWEB.md` for the exact setup flow.
