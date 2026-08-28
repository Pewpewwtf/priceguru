# Деплой PriceWatch v9 в Timeweb Cloud через GitHub

## 1. Создать GitHub-репозиторий

Создайте пустой репозиторий, например `pricewatch`.

Распакуйте этот архив и загрузите **содержимое папки** в корень репозитория. В корне должны быть:

- `Dockerfile`
- `package.json`
- `server.js`
- `db.js`
- `collectors.js`
- папка `public`

`.env` в GitHub не загружайте.

## 2. Создать PostgreSQL в Timeweb

В Timeweb Cloud → **Базы данных** → создать PostgreSQL.

Одной базы `default_db` достаточно.

Скопируйте реквизиты подключения из вкладки **Подключение**. Соберите строку:

```text
postgresql://USER:PASSWORD@HOST:PORT/default_db
```

Если пароль содержит специальные символы (`@`, `:`, `/`, `#` и т.п.), их нужно URL-encode.

## 3. Создать приложение

Timeweb Cloud → **App Platform** → Создать.

Тип: **Dockerfile**.

Подключите GitHub и выберите репозиторий `pricewatch`.

Dockerfile находится в корне. В нем указан `EXPOSE 8080`.

Рекомендация для старта из-за Chromium/Ozon: не брать конфигурацию с совсем маленьким объемом RAM; ориентир — от 2 ГБ RAM.

## 4. Переменные окружения

В настройках приложения добавьте:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/default_db
APP_PASSWORD=<ваш пароль для входа>
SESSION_SECRET=<случайная длинная строка, 32+ символа>
PGSSL=true
REFRESH_INTERVAL_MINUTES=60
LOOKUP_CONCURRENCY=3
```

Если база подключена без TLS, используйте `PGSSL=false`.

Секреты должны храниться только в ENV Timeweb, не в GitHub.

## 5. Health check

Путь проверки состояния:

```text
/api/health
```

После деплоя откройте технический домен Timeweb.

На `/api/health` должно быть примерно:

```json
{"ok":true,"version":9,"database":"postgres"}
```

Если там `database: memory`, значит `DATABASE_URL` не был передан приложению — в таком режиме production использовать нельзя.

## 6. Автодеплой

Если репозиторий подключен через ваш GitHub-аккаунт, Timeweb может автоматически пересобирать приложение после новых commit/push.

Ваш процесс версий может быть таким:

```text
v9 archive → commit "PriceWatch v9"
v10 archive → commit "PriceWatch v10"
```

При необходимости можно в Timeweb выбрать конкретный commit для деплоя.

## 7. Перенести товары из v8

В локальной v8: **Экспорт** → получится JSON.

В облачной v9: **Импорт v8** → выбрать этот JSON.

После этого товары и конкуренты хранятся в PostgreSQL, а не на конкретном компьютере.

## 8. Если Ozon не работает в Timeweb

Сначала посмотрите ошибку напротив ссылки в массовом импорте. Если в ней есть сообщение об anti-bot/check, значит Ozon режет IP дата-центра.

Тогда добавляются ENV:

```text
OZON_PROXY_SERVER=http://host:port
OZON_PROXY_USERNAME=user
OZON_PROXY_PASSWORD=password
```

После изменения ENV перезапустите deploy.
