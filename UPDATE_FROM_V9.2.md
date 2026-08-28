# Обновление v9.2 → v9.3

1. Замените файлы в GitHub содержимым архива v9.3.
2. Commit + push.
3. Ничего не меняйте в PostgreSQL.
4. ENV можно оставить как есть. `APP_PASSWORD` больше не включает логин без `AUTH_ENABLED=true`.
5. После deploy откройте `/api/health`.
6. Ожидается `version: "9.3"`, `database: "postgres"`, `auth: false`.
7. Если `database: "error"`, пришлите `dbError`.
