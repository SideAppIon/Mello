# Переход с PostgreSQL на Yandex Managed Service for MySQL

Бэкенд переписан с PostgreSQL (`pg`) на MySQL 8.0 (`mysql2`). Ниже — как подключиться
и перенести существующие данные без потерь.

## Что изменилось в коде

- `src/db.ts` — пул `mysql2/promise` вместо `pg.Pool`. Плейсхолдеры `$1, $2` автоматически
  транслируются в `?`. `TINYINT(1)` возвращается как `boolean`, чтобы JSON-ответы API не
  изменились. Добавлен помощник `insertOne()` — аналог `INSERT ... RETURNING *`.
- `src/migrate.ts` — схема под MySQL (`CHAR(36)` вместо `UUID`, `DATETIME`, `JSON`, `TINYINT(1)`,
  внешние ключи InnoDB, `CHECK`-констрейнты).
- `src/lib/taskAssembly.ts` — сборка тегов/исполнителей/подзадач/вложений в Node вместо
  `json_agg(...) FILTER (...)` / `json_object_agg`, которых нет в MySQL.
- Роуты: `RETURNING` → генерация UUID в приложении + `SELECT`; `ON CONFLICT` →
  `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE`; `= ANY(...)` → `IN (...)`.

## 1. Создать кластер MySQL в Yandex Cloud

В консоли Yandex Cloud → **Managed Service for MySQL** → создать кластер:
- Версия: **8.0**
- Создать БД `mello` и пользователя `mello_user`
- Хост получит FQDN вида `rc1a-xxxxxxxx.mdb.yandexcloud.net`, порт `3306`

## 2. Настроить подключение

Скопируйте `.env.example` в `.env` и заполните:

```env
DATABASE_URL=mysql://mello_user:ПАРОЛЬ@rc1a-xxxxxxxx.mdb.yandexcloud.net:3306/mello
```

### TLS

Yandex требует TLS при подключении извне сети кластера. Скачайте корневой сертификат:

```bash
mkdir -p ~/.mysql
curl -o ~/.mysql/root.crt https://storage.yandexcloud.net/cloud-certs/CA.pem
```

и укажите путь, чтобы включить проверку цепочки сертификатов:

```env
MYSQL_SSL_CA_PATH=/Users/ВЫ/.mysql/root.crt
```

Без `MYSQL_SSL_CA*` соединение всё равно шифруется, но без проверки сертификата
(`rejectUnauthorized: false`) — как было в прежней pg-конфигурации. Для локального
MySQL без TLS поставьте `DB_SSL=false`.

## 3. Создать схему

```bash
npm install
npm run migrate
```

Скрипт идемпотентен: повторный запуск пропускает уже существующие таблицы/ключи.

## 4. Перенести данные из старой PostgreSQL

Данные копируются напрямую из исходной PostgreSQL в новую MySQL. Сначала должна быть
создана схема (шаг 3).

```bash
PG_URL="postgresql://mello_user:ПАРОЛЬ@rc1b-xxxxxxxx.mdb.yandexcloud.net:6432/mello" \
DATABASE_URL="mysql://mello_user:ПАРОЛЬ@rc1a-xxxxxxxx.mdb.yandexcloud.net:3306/mello" \
npm run migrate:data
```

Скрипт (`scripts/migrate-data.js`):
- читает таблицы в порядке зависимостей (родители → дети);
- на время вставки отключает проверку внешних ключей;
- `jsonb` → JSON-текст, `boolean` → `0/1`, `timestamptz` → `DATETIME`;
- использует `INSERT IGNORE`, поэтому **повторный запуск безопасен** и дозаливает недостающее.

Проверьте число строк в выводе — оно должно совпасть с источником. Для контроля:

```sql
-- в обеих БД
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM tasks) AS tasks,
  (SELECT COUNT(*) FROM task_comments) AS comments;
```

> `pg` остаётся в `devDependencies` только ради этого скрипта и не попадает в бандл функции.

## 5. Деплой на Yandex Cloud Functions

Обновите `DATABASE_URL` (и при желании `MYSQL_SSL_CA` с PEM-содержимым сертификата) в `.env`,
затем:

```bash
npm run package      # или ./scripts/deploy.sh для полного деплоя
```

Помните: переменные окружения нужно передавать в функцию **на каждом деплое**
(`--environment ...`), иначе подключение к БД отвалится с 504.

## Откат

Старый PostgreSQL-кластер не трогается скриптом переноса (только читается), поэтому до
переключения трафика можно вернуться на ветку с pg-версией в любой момент.
