# PriceWatch v9.3

- Fixed `Cannot read properties of null (reading 'query')` when PostgreSQL is configured but not connected yet.
- Every PostgreSQL operation now waits for/checks a real pool before querying.
- Database failures return HTTP 503 with a readable `PostgreSQL unavailable: ...` message.
- Authentication is now opt-in. `APP_PASSWORD` alone no longer enables a login page.
- To enable login later, set `AUTH_ENABLED=true` together with `APP_PASSWORD`.
- Health endpoint reports v9.3 and whether authentication is enabled.
