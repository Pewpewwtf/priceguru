# Update v9.3 -> v9.4
1. Replace repository files with the contents of this archive.
2. Commit and push to GitHub.
3. Let Timeweb redeploy.
4. Do not change DATABASE_URL, PGSSL or other existing ENV variables.
5. Check `/api/health`; expected version is `9.4` and database is `postgres`.
6. Retry the same Ozon product URL.
