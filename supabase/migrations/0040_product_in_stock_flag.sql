-- ============================================================================
-- 0040 — Exclusion des produits en rupture du catalogue (spec §9)
-- ============================================================================
-- « Les produits hors stock sont exclus par défaut des résultats — un catalogue
-- fantôme détruit la confiance. » Jusqu'ici la fiche produit affichait bien la
-- rupture et bloquait l'achat, mais le produit restait LISTÉ.
--
-- Pourquoi un booléen dénormalisé plutôt qu'un filtre dans la requête :
-- le catalogue est paginé et filtré côté PostgREST, qui ne sait pas exprimer
-- « existe une variante active avec du stock » sans sous-requête. Un flag
-- indexé garde le catalogue rapide sur 3G, ce qui est le vrai contrainte ici.
--
-- Cohérence garantie par TRIGGER, jamais par l'application : un stock modifié
-- par n'importe quel chemin (vente, réservation, expiration, correction admin)
-- met le flag à jour dans la même transaction.
--
-- Produits DIGITAUX : jamais touchés par ces triggers (ils n'ont pas de
-- variantes), donc in_stock reste `true` à vie. Aucun impact sur l'existant.
-- ============================================================================

alter table products
  add column in_stock boolean not null default true;

-- Le catalogue filtre systématiquement sur (status, in_stock).
create index products_catalogue_stock_idx
  on products (status, in_stock, created_at desc)
  where status = 'published';

-- ─────────────────── Recalcul du flag pour UN produit ───────────────────────

create function zabelie_refresh_in_stock(p_product_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_has_stock boolean;
begin
  -- STOCK PHYSIQUE (disponible + réservé), PAS le seul disponible.
  -- Sinon un panier abandonné sur un vendeur qui n'a qu'UNE unité retirerait
  -- le produit du catalogue pendant toute la durée du TTL (120 min) — pour
  -- tout le monde. Sur des pièces détachées où l'unité isolée est la norme,
  -- ça se produirait quotidiennement.
  -- Un produit invisible ne se vend jamais ; un produit visible et
  -- temporairement pris se vend deux heures plus tard. C'est la tentative
  -- d'achat qui échoue proprement si l'unité part entre-temps (0038).
  select exists (
      select 1
        from zabelie_product_variants v
        join zabelie_stock s on s.variant_id = v.id
       where v.product_id = p_product_id
         and v.active
         and s.quantity_available + s.quantity_reserved > 0
    ) into v_has_stock;

  -- Écriture SEULEMENT si le booléen change. Sans ce garde, chaque mouvement
  -- de stock verrouillerait la ligne `products` et en créerait une nouvelle
  -- version — sur le produit le plus vendu, à chaque réservation. Invisible à
  -- 300 SKU, mordant à 5 000.
  update products p
     set in_stock = v_has_stock
   where p.id = p_product_id
     and p.in_stock is distinct from v_has_stock;
end;
$$;
revoke all on function zabelie_refresh_in_stock(uuid) from public, anon, authenticated;

-- ─────────────────── Déclencheurs ───────────────────────────────────────────

create function zabelie_stock_flag_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product uuid;
begin
  -- La table `zabelie_stock` porte variant_id ; `zabelie_product_variants`
  -- porte product_id. On remonte au produit dans les deux cas.
  if tg_table_name = 'zabelie_stock' then
    select product_id into v_product from zabelie_product_variants
     where id = coalesce(new.variant_id, old.variant_id);
  else
    v_product := coalesce(new.product_id, old.product_id);
  end if;

  if v_product is not null then
    perform zabelie_refresh_in_stock(v_product);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function zabelie_stock_flag_trigger() from public, anon, authenticated;

create trigger zabelie_stock_flag
  after insert or update of quantity_available, quantity_reserved or delete on zabelie_stock
  for each row execute function zabelie_stock_flag_trigger();

-- Une variante désactivée ou supprimée retire aussi son stock du décompte.
create trigger zabelie_variant_flag
  after insert or update of active or delete on zabelie_product_variants
  for each row execute function zabelie_stock_flag_trigger();

-- ─────────────────── Backfill des produits existants ────────────────────────
-- Seuls les produits qui ONT des variantes sont concernés ; les digitaux
-- gardent `true` (valeur par défaut de la colonne).

update products p
   set in_stock = exists (
         select 1
           from zabelie_product_variants v
           join zabelie_stock s on s.variant_id = v.id
          where v.product_id = p.id and v.active
            and s.quantity_available + s.quantity_reserved > 0
       )
 where exists (select 1 from zabelie_product_variants v where v.product_id = p.id);
