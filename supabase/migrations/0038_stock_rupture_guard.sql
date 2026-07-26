-- ============================================================================
-- 0038 — CORRECTIF : survente quand la réservation expire pendant le paiement
-- ============================================================================
-- BUG REPRODUIT sur 0037 : TTL de réservation dépassé pendant que l'acheteur
-- est encore sur la page de l'opérateur (réseau instable). Le cron libère,
-- un autre acheteur prend l'unité, puis le premier paiement confirme.
-- `zabelie_consume_stock` ne trouvait plus de réservation « held », renvoyait
-- 0 sans rien dire, et confirm_payment poursuivait : commande `paid`, vendeur
-- crédité, acheteur débité — pour une unité qui n'existe plus.
-- → SURVENTE SILENCIEUSE. Sur un catalogue où le vendeur a une ou deux unités,
--   c'est un incident du premier jour de mauvais réseau, pas un cas d'école.
--
-- Trois issues possibles ; on retient la seule correcte :
--   ✗ survente silencieuse   (l'ancienne)
--   ✗ stock négatif          (visible mais faux)
--   ✓ RÉ-ACQUISITION si le stock est encore là, sinon RUPTURE explicite :
--     paiement encaissé mais NON honoré → commande `disputed`, vendeur NON
--     crédité, aucune livraison, motif inscrit pour remboursement.
--
-- On tente d'abord de reprendre l'unité : si personne ne l'a prise entre-temps,
-- la vente doit aboutir normalement. La rupture est le dernier recours.
-- ============================================================================

-- ─────────── 1. TTL : doit couvrir la durée de vie d'une session opérateur ──
-- 30 min était en dessous d'un paiement MonCash sur connexion instable — le
-- TTL doit être SUPÉRIEUR à la fenêtre de session de l'opérateur, jamais
-- l'inverse.
-- ⚠️ À VÉRIFIER contre le timeout réel de MonCash (non documenté publiquement,
--    à confirmer auprès de Digicel). 120 min est une borne prudente en
--    attendant, pas une valeur mesurée.
update zabelie_stock_limits
   set value = 120,
       comment = 'Durée de vie d''une réservation non payée (minutes). DOIT rester supérieure à la fenêtre de session de l''opérateur. ⚠️ Valeur prudente — à confirmer contre le timeout réel MonCash.',
       updated_at = now()
 where key = 'reservation_ttl_minutes';

-- ─────────── 2. Consommation STRICTE : ne ment jamais sur le stock ──────────

create function zabelie_consume_stock_strict(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     record;
  v_avail integer;
  v_any   boolean := false;
begin
  -- PASSE 1 — vérifier que TOUTES les lignes peuvent être honorées avant d'en
  -- consommer une seule. Sans cela, une commande à plusieurs articles pourrait
  -- être partiellement consommée puis déclarée en rupture.
  for v_r in
    select * from zabelie_stock_reservations
     where order_id = p_order_id
     order by variant_id
     for update
  loop
    v_any := true;
    if v_r.status = 'released' then
      -- Le TTL a expiré pendant le paiement : l'unité est-elle encore là ?
      select quantity_available into v_avail
        from zabelie_stock where variant_id = v_r.variant_id for update;
      if coalesce(v_avail, 0) < v_r.quantity then
        return 'rupture';
      end if;
    end if;
  end loop;

  if not v_any then
    return 'aucune'; -- produit digital / sans stock : rien à faire
  end if;

  -- PASSE 2 — application.
  for v_r in
    select * from zabelie_stock_reservations
     where order_id = p_order_id
     order by variant_id
     for update
  loop
    if v_r.status = 'consumed' then
      continue; -- rejeu de confirm_payment
    elsif v_r.status = 'held' then
      update zabelie_stock
         set quantity_reserved = quantity_reserved - v_r.quantity,
             updated_at = now()
       where variant_id = v_r.variant_id;
    else -- 'released' : ré-acquisition, vérifiée en passe 1
      update zabelie_stock
         set quantity_available = quantity_available - v_r.quantity,
             updated_at = now()
       where variant_id = v_r.variant_id;
    end if;
    update zabelie_stock_reservations set status = 'consumed' where id = v_r.id;
  end loop;

  return 'ok';
end;
$$;
revoke all on function zabelie_consume_stock_strict(uuid)
  from public, anon, authenticated;

-- ─────────── 3. confirm_payment : la rupture bloque la vente ────────────────

create or replace function confirm_payment(
  p_idempotency_key text,
  p_provider_ref    text default null,
  p_raw             jsonb default null,
  p_amount          integer default null,
  p_usd_cents       integer default null
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment    payments;
  v_order      orders;
  v_seller_id  uuid;
  v_wallet_id  uuid;
  v_credited   integer;
  v_tier       creator_tier;
  v_rate_bps   integer;
  v_commission bigint;
  v_net        bigint;
  v_stock      text;
begin
  select * into v_payment
    from payments where idempotency_key = p_idempotency_key for update;
  if not found then
    raise exception 'confirm_payment: aucun paiement pour idempotency_key %',
      p_idempotency_key;
  end if;
  if v_payment.status = 'confirmed' then
    return v_payment; -- rejeu : no-op
  end if;

  select * into v_order from orders where id = v_payment.order_id;

  -- Garde-fou HTG (MonCash) : opérateur ≠ commande → REJET.
  if p_amount is not null and p_amount <> v_order.amount_htg then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  -- Garde-fou USD (Stripe/Zelle).
  if p_usd_cents is not null
     and (v_payment.expected_usd_cents is null
          or p_usd_cents <> v_payment.expected_usd_cents) then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  -- 0038 : STOCK AVANT ARGENT. On ne crédite personne si la marchandise ne
  -- peut pas être livrée.
  v_stock := zabelie_consume_stock_strict(v_order.id);

  if v_stock = 'rupture' then
    -- Le paiement est RÉEL (montant correct, encaissé chez l'opérateur) : on
    -- ne peut pas le faire disparaître. Mais la vente ne peut pas aboutir.
    -- → paiement confirmé, commande en litige, AUCUN crédit vendeur, AUCUNE
    --   livraison. Le motif est inscrit pour que l'admin rembourse.
    update payments
       set status = 'confirmed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw, '{}'::jsonb)
                 || jsonb_build_object('stock_rupture', true,
                                       'refund_required', true,
                                       'detected_at', now()),
           confirmed_at = now()
     where id = v_payment.id returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id returning * into v_order;

  if v_order.coupon_id is not null then
    perform zabelie_coupon_consume(v_order.coupon_id);
  end if;

  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id where o.id = v_order.id;
  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  v_commission := round(v_order.amount_htg::numeric * v_rate_bps / 10000);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id) on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id and exists (select 1 from ins);

  get diagnostics v_credited = row_count;

  if v_credited > 0 then
    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_wallet_id, 'credit', v_net, v_order.id, 'order_credit:' || v_order.id,
       'Vente nette en attente #' || left(v_order.id::text, 8))
    on conflict (idempotency_key) do nothing;

    insert into platform_earnings (order_id, gross_htg, commission_htg, rate_bps)
    values (v_order.id, v_order.amount_htg, v_commission, v_rate_bps)
    on conflict (order_id) do nothing;

    update products p set sales_count = p.sales_count + 1 where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ─────────── 4. Remboursement : JAMAIS de restock après expédition ──────────
-- Garantie explicite : `zabelie_release_stock` ne touche que les réservations
-- encore « held ». Après une vente, elles sont « consumed » — la marchandise
-- est partie. Un remboursement post-livraison ne remet donc RIEN en vente :
-- l'article est chez l'acheteur, peut-être abîmé, peut-être jamais rendu.
-- Le ré-approvisionnement après retour est une DÉCISION VENDEUR, saisie à la
-- main, jamais un effet de bord du remboursement.
comment on function zabelie_release_stock(uuid) is
  'Libère les réservations ENCORE HELD d''une commande. Sans effet sur les unités déjà vendues (consumed) : pas de restock automatique après livraison — c''est une décision vendeur.';

-- Vue de suivi : commandes payées mais non honorables (à rembourser).
create view zabelie_stock_ruptures as
select o.id            as order_id,
       o.buyer_id,
       o.amount_htg,
       p.confirmed_at,
       p.provider_ref,
       p.raw->>'detected_at' as detected_at
  from orders o
  join payments p on p.order_id = o.id
 where o.status = 'disputed'
   and p.status = 'confirmed'
   and coalesce((p.raw->>'stock_rupture')::boolean, false);
revoke all on zabelie_stock_ruptures from anon, authenticated;
