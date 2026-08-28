# PriceWatch v9 — проверка перед выдачей

Проверено 28.08.2026:

- `node --check` для `server.js`, `db.js`, `collectors.js`, `public/app.js`, `test/smoke.mjs`;
- JSON-валидность `package.json`;
- ссылки frontend → `/style.css` и `/app.js`;
- чистая логика цены: `150 000 ₽` → `150000`, `799000` копеек → `7990`;
- извлечение артикула из WB URL;
- извлечение артикула из Ozon URL;
- memory DB: товар → конкурент → чтение state;
- импорт состояния v8 в новую структуру;
- Docker base image `mcr.microsoft.com/playwright:v1.62.1-noble` существует в Microsoft Container Registry;
- архив проверяется командой `unzip -t` после упаковки.

Ограничения среды тестирования:

- Docker/Podman в рабочем контейнере отсутствует, поэтому локально собрать Docker image здесь нельзя;
- npm registry из контейнера недоступен/таймаутится, поэтому реальные `express`, `pg`, `playwright` здесь не устанавливались;
- реальный Timeweb PostgreSQL и внешний Ozon endpoint доступны только после вашего deploy.

После первого Timeweb deploy проверка production:

1. `/api/health` → `ok: true`, `version: 9`, `database: postgres`;
2. добавить 2 WB ссылки списком;
3. добавить 2 конкурента списком;
4. проверить Ozon ссылку;
5. выполнить `Обновить цены`;
6. перезапустить deploy и убедиться, что товары сохранились (PostgreSQL).
