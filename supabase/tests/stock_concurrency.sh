#!/usr/bin/env bash
# Test de CONCURRENCE RÉELLE du stock (chantier B, migration 0036).
#
# Critère d'acceptation de la spec §5 : 50 commandes simultanées sur 1 unité en
# stock → 1 succès, 49 échecs propres, 0 survente.
#
# Un test en une seule session psql ne prouverait RIEN : il faut de vraies
# connexions concurrentes pour que le verrou `FOR UPDATE` soit sollicité. Ce
# script lance donc N processus psql en parallèle sur la même variante.
#
# Usage : DATABASE_URL=... bash supabase/tests/stock_concurrency.sh
set -uo pipefail

DB="${DATABASE_URL:?DATABASE_URL requis}"
N="${CONCURRENCY:-50}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

VARIANT="00000000-0000-0000-0000-0000000d0001"
SELLER="00000000-0000-0000-0000-0000000d0002"
PRODUCT="00000000-0000-0000-0000-0000000d0003"

psql -q "$DB" <<SQL
insert into auth.users (id, email) values ('$SELLER', 'stock.seller@test.local')
  on conflict do nothing;
insert into profiles (id, display_name, role) values ('$SELLER', 'Vendeur Stock', 'creator')
  on conflict do nothing;
insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category)
values ('$PRODUCT', '$SELLER', 'piece-test-concurrence', 'Plaquettes de frein',
        'Test de concurrence', 2500, 'physical', 'published', 'Design')
  on conflict do nothing;
insert into zabelie_product_variants (id, product_id, sku, price_htg)
values ('$VARIANT', '$PRODUCT', 'SKU-CONC-1', 2500) on conflict do nothing;
-- UNE seule unité en stock.
insert into zabelie_stock (variant_id, quantity_available) values ('$VARIANT', 1)
  on conflict (variant_id) do update set quantity_available = 1, quantity_reserved = 0;
delete from zabelie_stock_reservations where variant_id = '$VARIANT';
SQL

echo "→ $N tentatives simultanées sur 1 unité en stock…"

for i in $(seq 1 "$N"); do
  (
    # Chaque tentative = une commande distincte, une connexion distincte.
    psql -tA "$DB" -c "
      with o as (
        insert into orders (buyer_id, product_id, amount_htg, status)
        values ('$SELLER', '$PRODUCT', 2500, 'pending') returning id
      )
      select zabelie_reserve_stock('$VARIANT', (select id from o), 1)->>'ok';
    " 2>/dev/null > "$TMP/$i.out"
  ) &
done
wait

OK=$(cat "$TMP"/*.out 2>/dev/null | grep -c '^true$' || true)
KO=$(cat "$TMP"/*.out 2>/dev/null | grep -c '^false$' || true)
ERR=$(( N - OK - KO ))

read -r AVAIL RESERVED HELD <<<"$(psql -tA -F' ' "$DB" -c "
  select s.quantity_available, s.quantity_reserved,
         (select count(*) from zabelie_stock_reservations
           where variant_id = '$VARIANT' and status = 'held')
    from zabelie_stock s where s.variant_id = '$VARIANT';")"

echo "   succès=$OK  refus=$KO  erreurs=$ERR"
echo "   stock : disponible=$AVAIL réservé=$RESERVED réservations_held=$HELD"

FAIL=0
[ "$OK" -eq 1 ]       || { echo "✗ attendu 1 succès, obtenu $OK"; FAIL=1; }
[ "$KO" -eq $((N-1)) ]|| { echo "✗ attendu $((N-1)) refus propres, obtenu $KO"; FAIL=1; }
[ "$ERR" -eq 0 ]      || { echo "✗ $ERR tentative(s) en erreur — un refus doit être propre, pas une exception"; FAIL=1; }
[ "$AVAIL" -eq 0 ]    || { echo "✗ disponible attendu 0, obtenu $AVAIL"; FAIL=1; }
[ "$RESERVED" -eq 1 ] || { echo "✗ réservé attendu 1 (SURVENTE si >1), obtenu $RESERVED"; FAIL=1; }
[ "$HELD" -eq 1 ]     || { echo "✗ 1 réservation attendue, obtenue $HELD"; FAIL=1; }

if [ "$FAIL" -eq 0 ]; then
  echo "✓ OK — 1 succès, $((N-1)) refus propres, 0 survente"
else
  echo "✗ ÉCHEC du test de concurrence"; exit 1
fi
