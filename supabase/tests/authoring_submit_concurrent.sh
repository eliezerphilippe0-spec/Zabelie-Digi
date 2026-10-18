#!/usr/bin/env bash
# Studio de création (0148, tâche 5.2, PRD T19) : dix « Soumettre à la revue »
# SIMULTANÉS pour le même projet, dix sessions réelles — une seule fiche.
# L'insertion elle-même porte l'unicité (index unique partiel) : aucune
# vérification préalable ne peut être doublée par une session concurrente.
# Lancé uniquement par le harnais SQL isolé ; la base est jetée par la CI.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
V='19200000-0000-4000-8000-000000000001'
P='29200000-0000-4000-8000-000000000001'
SORTIES="$(mktemp -d)"

"${PSQL[@]}" -c "insert into auth.users(id,email) values ('$V','soumission-concurrente@test.local') on conflict do nothing;"
"${PSQL[@]}" -c "insert into profiles(id,role,display_name) values ('$V','creator','Soumission concurrente') on conflict (id) do nothing;"
"${PSQL[@]}" -c "insert into zabelie_authoring_projects(id,seller_id,titre,langue,public_vise) values ('$P','$V','Soumission','ht','haiti');"

pids=()
for n in $(seq 1 10); do
  # Chaque session attend un instant avant d'insérer, pour que les dix
  # arrivent bien ensemble sur l'index (et non l'une après l'autre).
  ( "${PSQL[@]}" -c "begin; set local role service_role; select pg_sleep(0.2); insert into products(seller_id,slug,title,description,price_htg,kind,status,category,zabelie_authoring_project_id) values ('$V','soumission-concurrente-$n','Gid','Test',750,'fichier','draft','Design','$P'); commit;" \
      > "$SORTIES/$n.txt" 2>&1 || true ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

n=$("${PSQL[@]}" -tAc "select count(*) from products where zabelie_authoring_project_id='$P'")
refus=$(grep -l "products_zabelie_authoring_project_unique" "$SORTIES"/*.txt | wc -l | tr -d ' ')
"${PSQL[@]}" -c "delete from products where seller_id='$V'; delete from zabelie_authoring_projects where id='$P';"
rm -rf "$SORTIES"

# Les deux comptes, et pas un seul : neuf refus POUR UNICITÉ prouvent que les
# dix sessions ont réellement couru jusqu'à l'insertion (un vert sur un vide
# ne prouverait rien — docs/25 §2.4).
[ "$n" = "1" ] || { echo "T19 KO : $n fiches pour un seul projet"; exit 1; }
[ "$refus" = "9" ] || { echo "T19 KO : $refus refus d'unicite au lieu de 9"; exit 1; }
echo "✓ soumissions concurrentes du Studio OK (1 fiche, 9 refusees)"
