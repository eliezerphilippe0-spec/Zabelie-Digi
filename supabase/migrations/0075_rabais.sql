select zabelie_migration_garde('0075_rabais.sql');

-- ============================================================================
-- 0075 — RABAIS VENDEUR : l'ancien prix visible, et HONNÊTE (V-4, docs/35)
-- ============================================================================
-- La règle d'honnêteté, EN BASE et non négociable : l'ancien prix barré est
-- un prix RÉELLEMENT pratiqué. Le vendeur ne saisit JAMAIS le prix barré —
-- au moment où il pose un rabais, son prix courant DEVIENT l'ancien prix.
-- Le « barré gonflé » (afficher 5 000 barré sur un produit qui n'a jamais
-- coûté 5 000) est le dark pattern n°1 du e-commerce ; ici il est
-- structurellement impossible :
--
--   • `compare_at_htg` n'est écrit que par `zabelie_set_discount`, qui copie
--     le prix courant (ou conserve l'ORIGINE si un rabais existe déjà — un
--     rabais approfondi ne « re-barre » pas un prix déjà réduit) ;
--   • contrainte : `compare_at_htg > price_htg`, toujours ;
--   • retirer le rabais (`zabelie_clear_discount`) efface le barré, le prix
--     courant reste — jamais de remontée automatique.
--
-- V1 : produits à variante UNIQUE (la variante par défaut suit le prix dans
-- la même transaction — le chemin d'argent physique lit la variante). Un
-- produit à variantes multiples est refusé : le rabais par variante est un
-- chantier ultérieur, pas un cas silencieusement faux.
-- ============================================================================

alter table products
  add column compare_at_htg bigint
  check (compare_at_htg is null or compare_at_htg > price_htg);

comment on column products.compare_at_htg is
  'Ancien prix (rabais V-4, docs/35) — écrit UNIQUEMENT par zabelie_set_discount, qui copie le prix réellement pratiqué. Null = pas de rabais. Contrainte : toujours > price_htg.';

-- ── RPC : poser un rabais ───────────────────────────────────────────────────
create function zabelie_set_discount(
  p_user_id      uuid,
  p_product_id   uuid,
  p_new_price_htg bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products;
  v_variants integer;
begin
  select * into v_product from products
   where id = p_product_id and seller_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  if p_new_price_htg is null or p_new_price_htg <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'prix_invalide');
  end if;
  if p_new_price_htg >= v_product.price_htg then
    return jsonb_build_object('ok', false, 'reason', 'pas_une_baisse',
                              'prix_actuel_htg', v_product.price_htg);
  end if;

  select count(*) into v_variants from zabelie_product_variants
   where product_id = p_product_id and active;
  if v_variants > 1 then
    return jsonb_build_object('ok', false, 'reason', 'variantes_multiples');
  end if;

  update products
     set compare_at_htg = coalesce(compare_at_htg, price_htg),
         price_htg = p_new_price_htg
   where id = p_product_id;

  -- Le chemin d'argent physique lit la VARIANTE : elle suit, même geste.
  if v_variants = 1 then
    update zabelie_product_variants
       set price_htg = p_new_price_htg
     where product_id = p_product_id and active;
  end if;

  return jsonb_build_object('ok', true,
    'ancien_htg', coalesce(v_product.compare_at_htg, v_product.price_htg),
    'nouveau_htg', p_new_price_htg);
end;
$$;
revoke all on function zabelie_set_discount(uuid, uuid, bigint)
  from public, anon, authenticated;

-- ── RPC : retirer le rabais ─────────────────────────────────────────────────
create function zabelie_clear_discount(
  p_user_id    uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_product products;
begin
  select * into v_product from products
   where id = p_product_id and seller_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  update products set compare_at_htg = null where id = p_product_id;
  return jsonb_build_object('ok', true, 'prix_htg', v_product.price_htg);
end;
$$;
revoke all on function zabelie_clear_discount(uuid, uuid)
  from public, anon, authenticated;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'products' and column_name = 'compare_at_htg') then
    raise exception '0075: colonne compare_at_htg absente';
  end if;
  if not exists (select 1 from pg_proc where proname = 'zabelie_set_discount') then
    raise exception '0075: zabelie_set_discount absente';
  end if;
end $$;
