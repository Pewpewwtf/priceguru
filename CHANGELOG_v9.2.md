# v9.2

- Web server starts before PostgreSQL initialization.
- `/api/health` responds even when the database is unavailable.
- PostgreSQL connection timeout is 10 seconds.
- Health response exposes `database` and `dbError` for diagnostics.
- Fixes Timeweb deploys hanging in `Health status: starting`.
