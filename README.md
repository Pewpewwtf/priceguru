# PriceWatch v9.4 Cloud

Cloud price monitor for Wildberries + Ozon with PostgreSQL and bulk URL import.

## v9.4
The Ozon collector now uses a persistent Chromium session and requests Ozon's internal composer API from inside the warmed `ozon.ru` page. It parses serialized `widgetStates` and exact `webPrice` data rather than depending on visible DOM price text.

No new ENV variables are required when updating from v9.3.

## Health
`GET /api/health`
Expected after deployment:
```json
{"ok":true,"version":"9.4","database":"postgres","dbError":null,"auth":false}
```

## Optional Ozon proxy
Only if Browser API still reports anti-bot / 307 / 403 after v9.4:
- `OZON_PROXY_SERVER`
- `OZON_PROXY_USERNAME`
- `OZON_PROXY_PASSWORD`

See `TIMEWEB_DEPLOY.md` for deployment and `UPDATE_FROM_V9.3.md` for this update.
