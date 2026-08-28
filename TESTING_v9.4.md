# v9.4 testing

Completed before packaging:
- `node --check` for server.js, db.js, collectors.js, ozon-parser.js and public/app.js.
- Pure Ozon composer parser test against serialized `widgetStates`, including SKU 1551955042.
- Exact `webPrice.cardPrice` parsing test.
- Nested-widget fallback test.
- Missing-price negative test.
- ZIP integrity check after packaging.

Browser end-to-end limitation in the build environment:
- The environment has Chromium, but browser navigation is blocked by an administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`), including mocked URLs. Therefore a live/browser-network Ozon E2E test cannot be executed here.
- The browser-origin composer approach used in v9.4 follows the currently working Ozon pattern: warm an Ozon page/session, then call composer API using `fetch()` from that Ozon page context.
