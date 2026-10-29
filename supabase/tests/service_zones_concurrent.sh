#!/usr/bin/env bash
# Zones de service (0158) : dix sessions réelles posent chacune une zone
# DIFFÉRENTE pour le même vendeur, sur un plafond de 1 — une seule passe.
# Sans le verrou consultatif du garde, chaque session lirait « 0 zone » et
# toutes passeraient (le plafond ne se lit pas dans la ligne qu'on insère).
# Lancé uniquement par le harnais SQL isolé ; la base est jetée par la CI.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
V='19200000-0000-4000-8000-000000000001'
SORTIES="$(mktemp -d)"

"${PSQL[@]}" -c "insert into auth.users(id,email) values ('$V','zones-concurrent@test.local') on conflict do nothing;"
"${PSQL[@]}" -c "insert into profiles(id,display_name) values ('$V','Zones concurrent') on conflict (id) do nothing;"
"${PSQL[@]}" -c "update profiles set role='creator' where id='$V';"
"${PSQL[@]}" -c "update zabelie_service_zone_config set max_zones=1 where id;"

# La transaction reste ouverte 0,4 s après l'insertion : sans ce délai les dix
# sessions se suivent sans se chevaucher et l'absence de verrou passerait
# inaperçue (mesuré : la mutation « sans verrou » survivait).
# Dix zones distinctes et actives : les départements du seed (0069).
zones=$("${PSQL[@]}" -tAc "select id from zabelie_zones where level='depatman' and is_active order by code limit 10")
[ "$(echo "$zones" | wc -l | tr -d ' ')" = "10" ] || { echo "ZB158 KO : moins de 10 departements actifs pour l'essai"; exit 1; }

pids=(); n=0
for z in $zones; do
  n=$((n + 1))
  ( "${PSQL[@]}" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$V',true); insert into zabelie_seller_service_zones(seller_id,zone_id) values ('$V','$z'); select pg_sleep(0.4); commit;" \
      > "$SORTIES/$n.txt" 2>&1 || true ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

lignes=$("${PSQL[@]}" -tAc "select count(*) from zabelie_seller_service_zones where seller_id='$V'")
refus=$(grep -l "ZB158" "$SORTIES"/*.txt | wc -l | tr -d ' ')
"${PSQL[@]}" -c "delete from zabelie_seller_service_zones where seller_id='$V';"
"${PSQL[@]}" -c "update zabelie_service_zone_config set max_zones=20 where id;"
rm -rf "$SORTIES"

# Les deux comptes, et pas un seul : neuf refus ZB158 prouvent que les dix
# sessions ont réellement couru jusqu'au garde (un vert sur un vide ne
# prouverait rien — docs/25 §2.4).
[ "$lignes" = "1" ] || { echo "ZB158 KO : $lignes zones posees sur un plafond de 1"; exit 1; }
[ "$refus" = "9" ] || { echo "ZB158 KO : $refus refus au lieu de 9"; exit 1; }
echo "✓ plafond des zones de service concurrent OK (1 posee, 9 refusees)"
