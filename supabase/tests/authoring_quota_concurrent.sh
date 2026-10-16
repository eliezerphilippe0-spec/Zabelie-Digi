#!/usr/bin/env bash
# Studio de création (0142, tâche 3.1, PRD T08) : dix demandes SIMULTANÉES,
# dix sessions réelles, sur le dernier quota d'un vendeur — une seule passe.
# Lancé uniquement par le harnais SQL isolé ; la base est jetée par la CI.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
V='19100000-0000-4000-8000-000000000001'
P='29100000-0000-4000-8000-000000000001'
SORTIES="$(mktemp -d)"

"${PSQL[@]}" -c "insert into auth.users(id,email) values ('$V','quota-concurrent@test.local') on conflict do nothing;"
"${PSQL[@]}" -c "insert into zabelie_authoring_projects(id,seller_id,titre,langue,public_vise) values ('$P','$V','Quota','fr','haiti');"
"${PSQL[@]}" -c "update zabelie_authoring_config set suggestions_vendeur_jour=1, operations_simultanees=10, suggestions_global_jour=10000 where id;"

pids=()
for n in $(seq 1 10); do
  ( "${PSQL[@]}" -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$V',true); select id from zabelie_authoring_demander('$P','plan',null,gen_random_uuid()); commit;" \
      > "$SORTIES/$n.txt" 2>&1 || true ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

n=$("${PSQL[@]}" -tAc "select count(*) from zabelie_authoring_operations where seller_id='$V'")
refus=$(grep -l "authoring_quota_vendeur" "$SORTIES"/*.txt | wc -l | tr -d ' ')
"${PSQL[@]}" -c "update zabelie_authoring_config set suggestions_vendeur_jour=10, operations_simultanees=2, suggestions_global_jour=100 where id;"
rm -rf "$SORTIES"

# Les deux comptes, et pas un seul : neuf refus POUR QUOTA prouvent que les
# dix sessions ont réellement couru jusqu'au contrôle (un vert sur un vide
# ne prouverait rien — docs/25 §2.4).
[ "$n" = "1" ] || { echo "T08 KO : $n operations inscrites sur le dernier quota"; exit 1; }
[ "$refus" = "9" ] || { echo "T08 KO : $refus refus pour quota au lieu de 9"; exit 1; }
echo "✓ quota concurrent du Studio OK (1 inscrite, 9 refusees)"
