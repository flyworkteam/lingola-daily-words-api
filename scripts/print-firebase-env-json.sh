#!/usr/bin/env bash
# Production .env için tek satırlık FIREBASE_SERVICE_ACCOUNT_JSON üretir.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-$ROOT/secrets/firebase-service-account.json}"
if [[ ! -f "$FILE" ]]; then
  echo "Dosya bulunamadı: $FILE" >&2
  exit 1
fi
python3 - "$FILE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
print(json.dumps(data, separators=(",", ":")))
PY
