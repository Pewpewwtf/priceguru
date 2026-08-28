# PriceWatch v9.1 Cloud

Облачная версия PriceWatch для мониторинга цен Wildberries и Ozon.

## Что изменилось относительно v8

- массовое добавление **своих товаров**: до 100 ссылок за раз, одна ссылка на строку;
- массовое добавление **конкурентов** к конкретному товару;
- прогресс и результат по каждой ссылке;
- данные больше не хранятся в Chrome/localStorage — используется PostgreSQL;
- сервер сам обновляет цены по расписанию, даже когда вкладка закрыта;
- импорт JSON-backup из локальной v8;
- экспорт cloud-backup;
- пароль на веб-интерфейс;
- Dockerfile для Timeweb App Platform / GitHub deploy;
- WB: curl-first public card API с retry + fetch/Chromium fallback;
- Ozon: сначала JSON endpoints, затем headless Chromium (Playwright); состояние Ozon cookies сохраняется в PostgreSQL;
- опциональный HTTP proxy для Ozon через ENV.

## Быстрый запуск локально

Нужен Node.js 20+ и PostgreSQL (или можно не задавать DATABASE_URL — тогда включится временный memory mode только для теста).

```bash
npm install
APP_PASSWORD=test npm start
```

Откройте http://localhost:8080

> Memory mode не предназначен для production: после рестарта данные исчезают.

## ENV

Скопируйте `.env.example` как ориентир. В Timeweb переменные задаются в панели приложения.

Обязательные для production:

- `DATABASE_URL` — строка подключения PostgreSQL;
- `APP_PASSWORD` — пароль для входа в PriceWatch;
- `SESSION_SECRET` — длинная случайная строка.

Дополнительно:

- `PGSSL=true` — если подключение к PostgreSQL идет через TLS;
- `REFRESH_INTERVAL_MINUTES=60` — частота автообновления;
- `LOOKUP_CONCURRENCY=3` — сколько карточек проверять параллельно;
- `OZON_PROXY_SERVER`, `OZON_PROXY_USERNAME`, `OZON_PROXY_PASSWORD` — если Ozon блокирует IP облака.

## Health check

`GET /api/health`

Должен вернуть `ok: true`, `version: 9` и `database: postgres` в production.

## Миграция из v8

1. Откройте локальную v8.
2. Нажмите **Экспорт**.
3. В v9 нажмите **Импорт v8**.
4. Выберите JSON.

Импорт заменяет текущую облачную базу товарами из backup.

## Важно про Ozon

Ozon активно использует антибот-защиту. v9 использует несколько способов автоматически:

1. JSON endpoints Ozon;
2. Chromium/Playwright в контейнере;
3. сохраняет полученные cookies в PostgreSQL между перезапусками приложения.

Если Timeweb IP будет стабильно получать антибот-проверку, задайте proxy через `OZON_PROXY_*`. Это не влияет на WB.

Подробный деплой: `TIMEWEB_DEPLOY.md`.


## Обновление v9 → v9.1

1. Замените файлы в GitHub содержимым архива v9.1.
2. Commit + push.
3. ENV и PostgreSQL не меняйте.
4. После деплоя `/api/health` должен показать `version: "9.1"`.
5. Повторите добавление WB-ссылки.

Если ошибка после v9.1 показывает `curl-card:403`, `curl-search:403`, `fetch-*:403` и `browser:403`, тогда блокируется уже сам внешний IP Timeweb. Только в этом случае добавляется `WB_PROXY_URL`.
