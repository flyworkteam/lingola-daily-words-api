#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist/customer-package"
ZIP="$ROOT/dist/lingola-api-musteri.zip"

rm -rf "$OUT_DIR" "$(dirname "$ZIP")"
mkdir -p "$OUT_DIR"

rsync -a \
  --exclude node_modules \
  --exclude .env \
  --exclude .env.local \
  --exclude dist \
  --exclude secrets \
  --exclude .git \
  --exclude '*.log' \
  "$ROOT/" "$OUT_DIR/"

mkdir -p "$OUT_DIR/secrets"
echo "Place firebase-service-account.json here" > "$OUT_DIR/secrets/README.txt"

(cd "$(dirname "$ZIP")" && zip -rq "$(basename "$ZIP")" "$(basename "$OUT_DIR")")

echo "Created: $ZIP"
echo "Send to customer with: docs/MUSTERI-KURULUM.md and deploy/env.sunucu.template (filled .env)"
