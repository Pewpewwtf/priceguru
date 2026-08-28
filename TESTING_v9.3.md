# Testing v9.3

Проверено перед упаковкой:

- `node --check`: `server.js`, `db.js`, `collectors.js`, `public/app.js`;
- mock PostgreSQL failure: `initDb()` возвращает `DB_UNAVAILABLE` с исходной причиной;
- после неудачного подключения `getState()` возвращает `DB_UNAVAILABLE`, а не `null.query`;
- memory mode: добавление товара, чтение состояния, цена 150000 без искажения;
- статическая проверка: авторизация включается только через `AUTH_ENABLED`;
- ZIP проверен через `unzip -t`.

Ограничение: реальное подключение к вашей базе Timeweb и запросы к WB/Ozon из вашего IP могут быть проверены только после deploy в вашем аккаунте.
