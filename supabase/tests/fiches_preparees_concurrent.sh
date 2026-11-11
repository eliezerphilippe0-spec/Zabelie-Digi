#!/usr/bin/env bash
# Fiches préparées (0171) : dix sessions réelles déposent chacune une fiche
# pour le même vendeur, qui en a déjà 19 en attente sur un plafond de 20 —
# une seule passe. Sans le verrou consultatif du garde, chaque session lirait
# « 19 en attente » et les dix passeraient (le plafond ne se lit pas dans la
# ligne qu'on insère).
# Lancé uniquement par le harnais SQL isolé ; la base est jetée par la CI.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
V='19710000-0000-4000-8000-000000000001'
SORTIES="$(mktemp -d)"

"${PSQL[@]}" -c "insert into auth.users(id,email) values ('$V','fiches-concurrent@test.local') on conflict do nothing;"
"${PSQL[@]}" -c "insert into profiles(id,display_name) values ('$V','Fiches concurrent') on conflict (id) do nothing;"
"${PSQL[@]}" -c "insert into zabelie_fiches_preparees(seller_id,kind,title) select '$V','fichier','deja ' || g from generate_series(1,19) g;"

# La transaction reste ouverte 0,4 s après l'insertion : sans ce délai les dix
# sessions se suivent sans se chevaucher et l'absence de verrou passerait
# inaperçue (même raison que service_zones_concurrent.sh).
pids=()
for n in 1 2 3 4 5 6 7 8 9 10; do
  ( "${PSQL[@]}" -c "begin; insert into zabelie_fiches_preparees(seller_id,kind,title) values ('$V','fichier','course $n'); select pg_sleep(0.4); commit;" \
      > "$SORTIES/$n.txt" 2>&1 || true ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

attente=$("${PSQL[@]}" -tAc "select count(*) from zabelie_fiches_preparees where seller_id='$V' and reprise_at is null and expires_at > now()")
# `|| true` : sans aucun refus, `grep -l` rend 1 et, sous `pipefail`, le script
# mourrait ici SANS RIEN DIRE — exactement le cas où le verrou manque. Mesuré
# en retirant le verrou : la première version sortait en silence.
refus=$( (grep -l "ZB171" "$SORTIES"/*.txt || true) | wc -l | tr -d ' ')
"${PSQL[@]}" -c "delete from zabelie_fiches_preparees where seller_id='$V';"
rm -rf "$SORTIES"

# Les deux comptes, et pas un seul : neuf refus ZB171 prouvent que les dix
# sessions ont réellement couru jusqu'au garde (un vert sur un vide ne
# prouverait rien — docs/25 §2.4).
[ "$attente" = "20" ] || { echo "ZB171 KO : $attente fiches en attente sur un plafond de 20"; exit 1; }
[ "$refus" = "9" ] || { echo "ZB171 KO : $refus refus au lieu de 9"; exit 1; }
echo "✓ plafond des fiches préparées concurrent OK (1 déposée, 9 refusées)"
