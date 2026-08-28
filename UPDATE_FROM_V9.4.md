# Update v9.4 -> v9.5

1. Replace repository files with v9.5 and push.
2. Existing DATABASE_URL / PGSSL settings stay unchanged.
3. Add Timeweb ENV `OZON_PROXY_URL` in format `http://USER:PASSWORD@HOST:PORT`.
4. Optional: `OZON_HEADLESS=false` (this is already the default).
5. Redeploy and confirm `/api/health` reports version 9.5 and database postgres.
6. Retry the same Ozon URL.

Use a Russian residential/ISP HTTP(S) proxy with a sticky/static session. Datacenter proxies are much more likely to receive Ozon 403.

After redeploy, `/api/health` should include `"ozonProxy":true`. No proxy credentials are exposed.
