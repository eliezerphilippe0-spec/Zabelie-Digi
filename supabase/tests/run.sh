#!/usr/bin/env bash
# Applique le bootstrap + les migrations, puis exécute les tests SQL money-path.
# Chaque *.test.sql tourne dans une transaction annulée (begin/rollback).
# Échoue (exit ≠ 0) à la première assertion fausse grâce à ON_ERROR_STOP.
#
# Usage : DATABASE_URL=postgres://... bash supabase/tests/run.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "→ bootstrap (auth/storage stubs)"
"${PSQL[@]}" -f "$ROOT/supabase/tests/_bootstrap.sql"

echo "→ migrations"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "  • $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "→ tests"
for t in $(ls "$ROOT"/supabase/tests/*.test.sql | sort); do
  echo "  • $(basename "$t")"
  "${PSQL[@]}" -f "$t"
done

bash "$ROOT/supabase/tests/seller_pricing_concurrent.sh"

echo "✓ tests SQL money-path OK"
