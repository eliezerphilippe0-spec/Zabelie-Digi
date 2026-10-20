#!/usr/bin/env bash
# Mutations ciblées de l'essayage virtuel (docs/74 ; tasks/essayage-todo.md,
# point de contrôle 4) : éligibilité, pause, plafond, quota, compteur.
#
# Pour chaque mutant, une copie de zabelie_essayage.test.sql reçoit, juste
# après son `begin;`, la fonction de 0150 avec UNE altération
# (`create or replace`), puis tourne. Le test doit ÉCHOUER : sinon le mutant
# survit et ce script échoue. Tout reste dans la transaction du test, annulée
# à la fin : la base n'est jamais modifiée.
#
# Un témoin (la fonction recopiée sans altération) doit, lui, PASSER : il
# prouve que l'extraction et l'injection ne cassent rien d'elles-mêmes.
#
# Les mutants ne dépendent pas de la date (un quota élargi « au mois »
# survivrait le 1er du mois) : chaque altération est attrapée tous les jours.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requis}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations/0150_zabelie_essayage.sql"
TEST="$ROOT/supabase/tests/zabelie_essayage.test.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# La définition d'une fonction de 0150, de `create function` au `$$;` qui la ferme.
fonction() {
  awk -v debut="create function public.zabelie_essayage_$1(" \
    'index($0, debut) == 1 { dedans = 1 } dedans { print } dedans && $0 == "$$;" { exit }' "$MIG" \
    | sed '1s/^create function/create or replace function/'
}

# Rend 0 si le test passe avec cette définition injectée, 1 sinon.
jouer() {
  local definition="$1" fichier="$TMP/essai.sql"
  awk -v def="$definition" '!fait && $0 == "begin;" { print; print def; fait = 1; next } { print }' "$TEST" > "$fichier"
  psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" -f "$fichier" > /dev/null 2>&1
}

echo "→ mutations ciblées de l'essayage (0150)"
for nom in eligible reserver compteur; do
  original="$(fonction "$nom")"
  [[ -n "$original" ]] || { echo "  ✗ fonction $nom introuvable dans 0150"; exit 1; }
  jouer "$original" || { echo "  ✗ témoin $nom : le test échoue sans mutation"; exit 1; }
done

survivants=0
# nom|fragment d'origine|fragment muté
while IFS='|' read -r nom avant apres; do
  [[ -z "$nom" || "$nom" == \#* ]] && continue
  original="$(fonction "$nom")"
  if [[ "$original" != *"$avant"* ]]; then
    echo "  ✗ $nom : fragment introuvable — $avant"
    survivants=$((survivants + 1))
    continue
  fi
  if jouer "${original/"$avant"/"$apres"}"; then
    echo "  ✗ SURVIT  $nom : $avant → $apres"
    survivants=$((survivants + 1))
  else
    echo "  ✓ tuée    $nom : $avant"
  fi
done <<'MUTANTS'
eligible|join public.zabelie_essayage_vendeurs v on v.seller_id = p.seller_id and v.actif|join public.zabelie_essayage_vendeurs v on v.seller_id = p.seller_id
eligible|and p.status = 'published'|and p.status is not null
eligible|and p.kind = 'physical'|and p.kind is not null
eligible|and nullif(btrim(p.cover_url), '') is not null|and true
eligible|and (p_acheteur is null or p.seller_id <> p_acheteur)|and true
reserver|  if c.en_pause then|  if false then
reserver|if v_n >= c.plafond_mois then|if v_n > c.plafond_mois then
reserver|where cree_le >= v_mois and statut <> 'echec';|where cree_le >= v_mois;
reserver|if v_n >= c.quota_jour then|if v_n > c.quota_jour then
reserver|and cree_le >= v_jour and statut <> 'echec'|and cree_le >= v_jour - interval '1 day' and statut <> 'echec'
reserver|and cree_le >= v_jour and statut <> 'echec'|and cree_le >= v_jour
reserver|  if not public.zabelie_essayage_eligible(p_produit, p_acheteur) then|  if false then
compteur|count(e.id) filter (where e.statut = 'reussi')::integer|count(e.id)::integer
compteur|count(e.id) filter (where e.statut = 'echec')::integer|0::integer
compteur|on e.cree_le >= date_trunc(|on e.cree_le + interval '1 day' >= date_trunc(
MUTANTS

if (( survivants > 0 )); then
  echo "✗ $survivants mutant(s) survivant(s) ou introuvable(s)"
  exit 1
fi
echo "✓ mutations de l'essayage : toutes tuées"
