#!/usr/bin/env bash
# Полный деплой бэкенда Mello на Yandex Cloud Functions.
# Решает две проблемы: переменные окружения не теряются, а пакет с aws-sdk (> 3.5 МБ)
# загружается через Object Storage, а не напрямую.
set -euo pipefail

cd "$(dirname "$0")/.."

# Загружаем переменные из .env
set -a
source .env
set +a

PROFILE="${YC_PROFILE:-mello}"
FN_NAME="${FN_NAME:-mello-backend}"
PKG_BUCKET="${FN_PACKAGE_BUCKET:-mello-fn}"
PKG_KEY="mello-function.zip"

echo "==> Сборка"
npm run build

echo "==> Упаковка"
node scripts/package.js

echo "==> Загрузка пакета в бакет $PKG_BUCKET"
node scripts/upload-fn.js

echo "==> Создание версии функции $FN_NAME"
yc serverless function version create \
  --function-name "$FN_NAME" --runtime nodejs18 \
  --entrypoint index.handler --memory 256m \
  --execution-timeout 10s \
  --package-bucket-name "$PKG_BUCKET" --package-object-name "$PKG_KEY" \
  --profile "$PROFILE" \
  --environment DATABASE_URL="$DATABASE_URL" \
  --environment JWT_SECRET="$JWT_SECRET" \
  --environment JWT_EXPIRES_IN="$JWT_EXPIRES_IN" \
  --environment CORS_ORIGIN="$CORS_ORIGIN" \
  --environment NODE_ENV="$NODE_ENV" \
  --environment S3_BUCKET="$S3_BUCKET" \
  --environment S3_ACCESS_KEY="$S3_ACCESS_KEY" \
  --environment S3_SECRET_KEY="$S3_SECRET_KEY"

echo "==> Готово"
