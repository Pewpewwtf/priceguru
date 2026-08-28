# PriceWatch v9.4

## Ozon
- Fixed parsing of Ozon `widgetStates`: widget payloads are JSON strings nested inside the composer response.
- Added exact parsing of `webProductHeading` + `webPrice` (`cardPrice`, `price`, fallbacks).
- Added a persistent Ozon Chromium session. The first Ozon request warms the session on `ozon.ru`; following lookups reuse it.
- Ozon composer API is now fetched from inside the warmed Ozon browser page instead of relying only on server-side HTTP or product-page DOM.
- Browser API retries once after 307/403 by rebuilding the Ozon browser session.
- DOM parsing remains only as the last fallback.
- Failure diagnostics now distinguish Direct HTTP, Browser API and DOM fallback.

## No infrastructure changes
No new ENV variables are required. Existing PostgreSQL/Timeweb settings remain valid.
Optional Ozon proxy variables are still supported if the Timeweb IP is actually challenged.
