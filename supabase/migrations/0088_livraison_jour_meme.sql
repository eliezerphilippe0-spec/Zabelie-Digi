select zabelie_migration_garde('0088_livraison_jour_meme.sql');

-- ============================================================================
-- 0088 — Livraison le JOUR MÊME pour les services et les produits numériques
-- ============================================================================
-- ⚠️ ÉTAT : RÉDIGÉE, NON APPLIQUÉE.
--
-- POURQUOI — une contrainte restée en arrière de trois couches.
--
-- `0020` a posé `check (delivery_days is null or delivery_days > 0)`. Depuis,
-- le reste du produit a avancé sans elle :
--
--   • `app/api/products/route.ts:118` accepte `0` et le documente en toutes
--     lettres : « 0 est VALIDE et signifie le jour même (demande porteur
--     2026-08-11) : un cours par Zoom, une consultation, une retouche photo se
--     livrent dans l'heure — exiger au moins 1 jour obligeait le vendeur à
--     annoncer plus lent qu'il ne l'est » ;
--   • `lib/i18n.ts` porte `product.delivery.sameday` — « Livré le jour même » —
--     dans les quatre langues ;
--   • la fiche produit a sa branche d'affichage pour `deliveryDays === 0`.
--
-- Trois couches savaient dire « jour même ». La base refusait de l'enregistrer,
-- et son refus arrivait à l'écran du vendeur sous cette forme :
--
--   new row for relation "products" violates check constraint
--   "products_delivery_days_check"
--
-- C'est le même motif que le produit gratuit, hier : une demande appliquée
-- partout sauf à l'endroit qui tranche. Une couche oubliée ne se voit pas —
-- elle attend qu'un vendeur tombe dessus.
--
-- ── PÉRIMÈTRE : SERVICE ET NUMÉRIQUE, PAS LE PHYSIQUE ───────────────────────
-- Un service se rend dans l'heure, un fichier se télécharge à la seconde. Un
-- article LIVRABLE, non : il faut le remettre, et `0` y signifierait une
-- promesse que personne ne peut tenir. La contrainte garde donc `> 0` pour
-- `physical`, en accord avec `zabelie_product_variants.price_htg > 0` (0036)
-- et avec le refus du rail gratuit (`0087`) sur la même famille.
--
-- ⚠️ `delivery_days` reste un champ d'AFFICHAGE. `0020` le dit et rien ne l'a
-- changé : aucune logique financière, aucun délai de maturation, aucun calcul
-- d'escrow n'en dépend. Élargir la contrainte n'ouvre donc aucun chemin
-- d'argent — c'est ce qui rend cette migration sûre, et c'est vérifié, pas
-- supposé : `grep -rn "delivery_days" supabase/migrations/` ne rend que `0020`
-- et ce fichier.
-- ============================================================================

alter table products drop constraint if exists products_delivery_days_check;

alter table products
  add constraint products_delivery_days_check
  check (
    delivery_days is null
    or (delivery_days = 0 and kind <> 'physical')   -- le jour même
    or delivery_days > 0
  );

comment on constraint products_delivery_days_check on products is
  '0088 : delivery_days = 0 signifie « livre le jour meme » et n''est admis que '
  'pour un service ou un produit numerique. Un article livrable garde un delai '
  'd''au moins un jour — 0 y serait une promesse intenable.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
-- Connu-positif ET connu-négatif, dans la même transaction, sur des lignes
-- jetées avant de sortir. Une contrainte qu'on n'a pas vue REFUSER n'a pas
-- démontré qu'elle pouvait.
do $$
declare
  v_seller uuid;
  v_ok     boolean;
begin
  select id into v_seller from profiles limit 1;

  if v_seller is null then
    -- CI sur base vierge : on le DIT plutôt que de laisser un vert muet passer
    -- pour une vérification.
    raise notice '0088 : aucun profil disponible, contrainte non eprouvee ICI '
                 '(elle l''est dans supabase/tests/livraison_jour_meme.test.sql)';
    return;
  end if;

  -- P1 — CONNU-POSITIF : un service à 0 jour passe.
  insert into products (id, seller_id, title, slug, price_htg, kind, delivery_days)
  values ('00000000-0000-0000-0000-0000000d0088', v_seller, 'Sonde 0088',
          'sonde-0088', 100, 'service', 0);

  -- P2 — CONNU-NÉGATIF : un délai négatif reste refusé.
  v_ok := false;
  begin
    update products set delivery_days = -1
     where id = '00000000-0000-0000-0000-0000000d0088';
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception '0088 KO: un delai NEGATIF a ete accepte — la contrainte ne '
                    'borne plus rien' using errcode = 'ZB088';
  end if;

  delete from products where id = '00000000-0000-0000-0000-0000000d0088';

  raise notice '0088 OK: service a 0 jour accepte ; delai negatif refuse';
end $$;
