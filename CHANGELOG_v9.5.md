# PriceWatch v9.5

- Added `OZON_PROXY_URL` support (`http://user:password@host:port`).
- Proxy applies only to the dedicated Ozon Chromium session; WB and PostgreSQL are unchanged.
- Ozon Chromium now runs headful under Xvfb by default (`OZON_HEADLESS=false`).
- Added lightweight anti-automation browser patches (webdriver/languages/plugins/WebGL).
- Removed the hard-coded Ozon browser User-Agent so Chromium exposes its real matching version.
- Preserved Ozon cookies/storage state in PostgreSQL as before.
- Clear error now distinguishes missing proxy from a proxy that is also blocked.
- Ozon requests are serialized with a configurable minimum interval (`OZON_MIN_INTERVAL_MS`, default 8000 ms) to reduce re-blocking during bulk imports.
- Direct Ozon server calls are skipped when a proxy is configured, avoiding useless Timeweb 307s.
- `/api/health` now exposes only a safe boolean `ozonProxy` flag so you can verify the ENV was picked up.
