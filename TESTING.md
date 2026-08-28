# PriceWatch v9.1 — проверка перед выдачей

Проверено 28.08.2026:

- `node --check`: `server.js`, `collectors.js`, `db.js`, `public/app.js`, smoke test;
- `package.json` валиден;
- WB fixture v4: `149900` копеек → `1499 ₽`;
- 403 не интерпретируется как валидный товар;
- `curl` subprocess + HTTP status marker проверены на локальном mock HTTP server;
- Dockerfile явно устанавливает `curl` и `ca-certificates`;
- WB curl использует IPv4, browser-like headers и redirect;
- retry предусмотрен для 403/429;
- fallback hosts: `card.wb.ru` и `search.wb.ru`;
- после curl: Node fetch и Chromium fallback;
- PostgreSQL схема v9 не менялась: обновление не требует миграции и не удаляет данные;
- ZIP проходит `unzip -t`.

Ограничение: реальный запрос из IP Timeweb нельзя выполнить из тестовой среды ChatGPT. Поэтому финальный production-тест — повторить ту же WB-ссылку после deploy v9.1. Диагностика теперь покажет статус каждого транспорта.
