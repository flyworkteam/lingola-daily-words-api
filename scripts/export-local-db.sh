#!/usr/bin/env bash
# Yerel MySQL dump — müşteri sunucusuna aktarmak için.
# Kullanım:
#   bash scripts/export-local-db.sh
#   scp dist/lingoladailywords-local.sql user@5.39.8.160:/tmp/
# Sunucuda:
#   mysql -u lingoladailywordsUser -p lingoladailywords < /tmp/lingoladailywords-local.sql
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist"
OUT_FILE="$OUT_DIR/lingoladailywords-local.sql"

DB_NAME="${LOCAL_DB_NAME:-lingoladailywords_local}"
DB_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
DB_USER="${LOCAL_DB_USER:-root}"

mkdir -p "$OUT_DIR"

echo "Exporting $DB_NAME from $DB_HOST ..."
mysqldump -h "$DB_HOST" -u "$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$DB_NAME" > "$OUT_FILE"

BYTES=$(wc -c < "$OUT_FILE" | tr -d ' ')
echo "Created: $OUT_FILE ($BYTES bytes)"
echo ""
echo "Alternatif (sunucuda API + VERB_API_TOKEN ile): npm run import:all"
