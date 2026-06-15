#!/usr/bin/env bash
# ОТКАТ на PostgreSQL-версию функции.
# Загружает сохранённый pg-артефакт (mello-function.pg-backup.zip) и создаёт новую
# версию функции со СТАРЫМ DATABASE_URL (PostgreSQL). Используйте, если MySQL-деплой
# оказался нерабочим.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

PROFILE="${YC_PROFILE:-mello}"
FN_NAME="${FN_NAME:-mello-backend}"
PKG_BUCKET="${FN_PACKAGE_BUCKET:-mello-fn}"
PKG_KEY="mello-function.zip"

# Старый PostgreSQL-адрес (на момент миграции). При откате БД снова берётся из PG.
PG_DATABASE_URL="postgresql://mello_user:StudyAdmin2025@rc1b-v41qkis4b870fv9n.mdb.yandexcloud.net:6432/mello"

echo "==> Восстановление pg-артефакта"
cp mello-function.pg-backup.zip mello-function.zip

echo "==> Загрузка в бакет $PKG_BUCKET"
node scripts/upload-fn.js

echo "==> Создание версии функции $FN_NAME со старым PostgreSQL DATABASE_URL"
yc serverless function version create \
  --function-name "$FN_NAME" --runtime nodejs18 \
  --entrypoint index.handler --memory 256m \
  --execution-timeout 10s \
  --package-bucket-name "$PKG_BUCKET" --package-object-name "$PKG_KEY" \
  --profile "$PROFILE" \
  --environment DATABASE_URL="$PG_DATABASE_URL" \
  --environment JWT_SECRET="$JWT_SECRET" \
  --environment JWT_EXPIRES_IN="$JWT_EXPIRES_IN" \
  --environment CORS_ORIGIN="$CORS_ORIGIN" \
  --environment NODE_ENV="$NODE_ENV" \
  --environment S3_BUCKET="$S3_BUCKET" \
  --environment S3_ACCESS_KEY="$S3_ACCESS_KEY" \
  --environment S3_SECRET_KEY="$S3_SECRET_KEY"

echo "==> Откат выполнен. Прод снова на PostgreSQL."
