# PriceWatch v9.3 Cloud

Облачная версия PriceWatch для мониторинга цен Wildberries и Ozon.

## Главное в v9.3

- исправлен `Cannot read properties of null (reading 'query')`;
- PostgreSQL-запросы выполняются только после реального подключения к БД;
- при проблеме БД API возвращает понятную ошибку `PostgreSQL unavailable: ...` вместо падения;
- логин теперь **выключен по умолчанию**; наличие `APP_PASSWORD` само по себе больше не включает авторизацию;
- чтобы специально включить логин, добавьте `AUTH_ENABLED=true`;
- массовое добавление до 100 ссылок за раз сохранено;
- WB: curl → retry → второй endpoint → fetch → Chromium;
- Ozon: JSON endpoints → Chromium/Playwright.

## ENV для текущего Timeweb

Обязательные:

- `DATABASE_URL`
- `PGSSL=true`

Можно оставить уже созданные `APP_PASSWORD` и `SESSION_SECRET`: v9.3 их игнорирует, пока нет `AUTH_ENABLED=true`.

Для автообновления:

- `REFRESH_INTERVAL_MINUTES=60`
- `LOOKUP_CONCURRENCY=3`

## Health

Откройте `/api/health`. Нормальный production-ответ:

```json
{
  "ok": true,
  "version": "9.3",
  "database": "postgres",
  "dbError": null,
  "auth": false
}
```

Если `database` равен `error`, поле `dbError` покажет реальную причину подключения PostgreSQL.

Если база настроена, но временно недоступна, интерфейс теперь не падает с `null.query`: API вернет HTTP 503 с читаемой причиной.

## Обновление с v9.2

1. Замените содержимое GitHub содержимым этого архива.
2. Commit + push.
3. ENV менять не нужно.
4. Дождитесь нового deploy Timeweb.
5. Сначала откройте `/api/health`.
6. Проверяйте WB только когда `version` = `9.3` и `database` = `postgres`.

Подробности изменений: `CHANGELOG_v9.3.md`.
