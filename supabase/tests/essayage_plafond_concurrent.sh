#!/usr/bin/env bash
# Essayage virtuel (0150, tâche 3.2) : réservations SIMULTANÉES, sessions
# réelles, au bord des limites.
#   1. Vingt acheteurs différents sur la DERNIÈRE place du plafond du mois :
#      un seul essai inscrit, dix-neuf refus « plafond ».
#   2. Un acheteur, dix demandes à la fois, sur la dernière place de son quota
#      du jour : un seul essai inscrit, neuf refus « quota ».
# Lancé uniquement par le harnais SQL isolé ; la base est jetée par la CI.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL")
S='15000000-0000-4000-8000-000000000001'
P='25000000-0000-4000-8000-000000000001'
SORTIES="$(mktemp -d)"

acheteur() { printf '15000000-0000-4000-8000-%012d' "$((100 + $1))"; }

"${PSQL[@]}" -c "insert into auth.users(id,email) values ('$S','essayage-concurrent-vendeur@test.local') on conflict do nothing;"
"${PSQL[@]}" -c "insert into profiles(id,display_name) values ('$S','Vandè konkiran') on conflict (id) do nothing;"
for n in $(seq 1 21); do
  A="$(acheteur "$n")"
  "${PSQL[@]}" -c "insert into auth.users(id,email) values ('$A','essayage-concurrent-$n@test.local') on conflict do nothing;"
  "${PSQL[@]}" -c "insert into profiles(id,display_name) values ('$A','Achtè $n') on conflict (id) do nothing;"
done
"${PSQL[@]}" -c "insert into products(id,seller_id,slug,title,kind,price_htg,status,category_id,cover_url)
  select '$P','$S','essayage-concurrent','Wòb konkiran','physical',1500,'published',id,'https://exemple/robe.jpg'
    from zabelie_categories where slug='wob';"
"${PSQL[@]}" -c "insert into zabelie_essayage_vendeurs(seller_id) values ('$S');"

# 1. Plafond : il reste exactement une place ce mois-ci.
"${PSQL[@]}" -c "update zabelie_essayage_config set quota_jour = 100, plafond_mois = (
  select count(*) from zabelie_essayage_essais
   where cree_le >= date_trunc('month', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince'
     and statut <> 'echec') + 1 where id;"
pids=()
for n in $(seq 1 20); do
  A="$(acheteur "$n")"
  ( "${PSQL[@]}" -tAc "begin; set local role service_role; select coalesce(refus, 'essai') from zabelie_essayage_reserver('$A','$P','simulation'); commit;" \
      > "$SORTIES/plafond-$n.txt" 2>&1 || true ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
inscrits=$("${PSQL[@]}" -tAc "select count(*) from zabelie_essayage_essais where produit_id='$P'")
refus=$(grep -lx "plafond" "$SORTIES"/plafond-*.txt | wc -l | tr -d ' ')

# 2. Quota : l'acheteur 21 n'a droit qu'à un essai aujourd'hui.
A21="$(acheteur 21)"
"${PSQL[@]}" -c "update zabelie_essayage_config set plafond_mois = 1000000, quota_jour = 1 where id;"
pids=()
for n in $(seq 1 10); do
  ( "${PSQL[@]}" -tAc "begin; set local role service_role; select coalesce(refus, 'essai') from zabelie_essayage_reserver('$A21','$P','simulation'); commit;" \
      > "$SORTIES/quota-$n.txt" 2>&1 || true ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
inscrits_quota=$("${PSQL[@]}" -tAc "select count(*) from zabelie_essayage_essais where acheteur_id='$A21'")
refus_quota=$(grep -lx "quota" "$SORTIES"/quota-*.txt | wc -l | tr -d ' ')

"${PSQL[@]}" -c "update zabelie_essayage_config set plafond_mois = 1000, quota_jour = 5 where id;"
rm -rf "$SORTIES"

# Les deux comptes à chaque fois : des refus POUR LA BONNE RAISON prouvent que
# toutes les sessions ont couru jusqu'au contrôle (un vert sur un vide ne
# prouverait rien).
[ "$inscrits" = "1" ] || { echo "Essayage KO : $inscrits essais inscrits sur la dernière place du plafond"; exit 1; }
[ "$refus" = "19" ] || { echo "Essayage KO : $refus refus pour plafond au lieu de 19"; exit 1; }
[ "$inscrits_quota" = "1" ] || { echo "Essayage KO : $inscrits_quota essais inscrits sur la dernière place du quota"; exit 1; }
[ "$refus_quota" = "9" ] || { echo "Essayage KO : $refus_quota refus pour quota au lieu de 9"; exit 1; }
echo "✓ plafond et quota concurrents de l'essayage OK (1 + 19, 1 + 9)"
