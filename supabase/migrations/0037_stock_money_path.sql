-- ============================================================================
-- 0037 — Chantier B : branchement du STOCK sur le money-path
-- ============================================================================
-- Sans ce branchement, le modèle de stock de 0036 est du code mort : il ne
-- protège de rien tant qu'aucune commande ne le sollicite.
--
-- Règle : le mouvement de stock est ATOMIQUE avec le mouvement d'argent.
--   • paiement confirmé  → les unités réservées quittent le stock (vendues)
--   • remboursement      → les unités reviennent en vente
--   • paiement abandonné → idem (via l'expiration à 48 h)
--   • réservation échue  → relibérée par le cron (0036), TTL 30 min
--
-- Pourquoi en base et non dans l'application : si la consommation était faite
-- après coup côté serveur Next, un crash entre les deux laisserait la
-- réservation « held » — puis le cron la relibérerait, remettant en vente une
-- unité DÉJÀ VENDUE ET PAYÉE. Le seul endroit sûr est la transaction qui
-- confirme le paiement.
--
-- Les trois fonctions ci-dessous sont reprises À L'IDENTIQUE de leur dernière
-- version (0027, 0006, 0024) ; seul l'appel de stock est ajouté, signalé par
-- un commentaire « 0037 ».
-- ============================================================================

-- ─────────── 1. confirm_payment : consommation du stock à la vente ──────────

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
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

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
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    -- 0037 : montant incohérent = pas de vente → le stock retourne en rayon.
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  -- Garde-fou USD (Stripe/Zelle) : montant reçu ≠ montant figé → REJET.
  if p_usd_cents is not null
     and (v_payment.expected_usd_cents is null
          or p_usd_cents <> v_payment.expected_usd_cents) then
    update payments
       set status = 'failed',
           provider_ref = coalesce(p_provider_ref, provider_ref),
           raw = coalesce(p_raw, raw)
     where id = v_payment.id
     returning * into v_payment;
    update orders set status = 'disputed' where id = v_payment.order_id;
    -- 0037 : idem côté rails USD.
    perform zabelie_release_stock(v_order.id);
    return v_payment;
  end if;

  update payments
     set status = 'confirmed',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         raw = coalesce(p_raw, raw),
         confirmed_at = now()
   where id = v_payment.id
   returning * into v_payment;

  update orders set status = 'paid'
   where id = v_payment.order_id
   returning * into v_order;

  -- 0037 : la vente est faite — les unités réservées quittent définitivement
  -- le stock, dans LA MÊME transaction que le paiement. Idempotent (0 si déjà
  -- consommé) ; sans effet pour un produit digital, qui n'a pas de réservation.
  perform zabelie_consume_stock(v_order.id);

  -- BL-133 : consommation du coupon ICI, au paiement confirmé — jamais au
  -- checkout. Best-effort : si le quota a basculé entre-temps (course sur le
  -- tout dernier usage), la fonction renvoie FALSE sans lever d'exception —
  -- le paiement, déjà facturé au prix remisé, reste confirmé quoi qu'il arrive.
  if v_order.coupon_id is not null then
    perform zabelie_coupon_consume(v_order.coupon_id);
  end if;

  -- Vendeur + tier → commission/net (LEDGER HTG, identique pour tous les rails).
  select p.seller_id into v_seller_id
    from products p join orders o on o.product_id = p.id
   where o.id = v_order.id;

  select tier into v_tier from profiles where id = v_seller_id;
  v_rate_bps   := commission_rate_bps(v_tier);
  -- D-4 : règle unique, `floor` (l'arrondi va au vendeur). Suppose 0044.
  v_commission := zabelie_commission_htg(v_order.amount_htg, v_rate_bps);
  v_net        := v_order.amount_htg - v_commission;

  insert into wallets (owner_id) values (v_seller_id)
  on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id) do nothing
    returning amount_htg
  )
  update wallets w
     set pending_htg = w.pending_htg + (select amount_htg from ins)
   where w.id = v_wallet_id
     and exists (select 1 from ins);

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

    update products p set sales_count = p.sales_count + 1
     where p.id = v_order.product_id;
  end if;

  return v_payment;
end;
$$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ─────────── 2. refund_order : le stock revient en vente ────────────────────

create or replace function refund_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esc escrow_entries;
begin
  select * into v_esc from escrow_entries where order_id = p_order_id for update;
  if not found then
    raise exception 'refund_order: aucun escrow pour order %', p_order_id;
  end if;

  if v_esc.status = 'reversed' then
    return 'already_reversed'; -- idempotent
  end if;

  if v_esc.status = 'maturing' then
    update wallets set pending_htg = pending_htg - v_esc.amount_htg
     where id = v_esc.wallet_id;
  else -- 'matured' : fonds déjà disponibles
    update wallets set balance_htg = balance_htg - v_esc.amount_htg
     where id = v_esc.wallet_id;
  end if;

  update escrow_entries set status = 'reversed' where id = v_esc.id;
  update orders set status = 'refunded' where id = p_order_id;

  insert into wallet_transactions
    (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
  values
    (v_esc.wallet_id, 'debit', -v_esc.amount_htg, p_order_id,
     'order_refund:' || p_order_id, 'Remboursement #' || left(p_order_id::text, 8))
  on conflict (idempotency_key) do nothing;

  -- 0037 : la vente est annulée — les unités reviennent en vente. Sans effet
  -- si elles ont déjà été consommées puis restituées (statut non 'held').
  perform zabelie_release_stock(p_order_id);

  return 'reversed';
end;
$$;
revoke all on function refund_order(uuid) from public, anon, authenticated;

-- ─────────── 3. Expiration d'un paiement abandonné (48 h) ───────────────────

create or replace function zabelie_expire_stale_payment(
  p_idempotency_key text,
  p_reason          text default 'abandoned'
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
begin
  select * into v_payment
    from payments
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'zabelie_expire_stale_payment: aucun paiement pour %',
      p_idempotency_key;
  end if;

  -- Jamais toucher un paiement déjà terminal (confirmé/échoué) : no-op rejouable.
  if v_payment.status <> 'pending' then
    return v_payment;
  end if;

  -- Trop récent : une confirmation tardive reste possible → no-op.
  if v_payment.created_at > now() - interval '48 hours' then
    return v_payment;
  end if;

  update payments
     set status = 'failed',
         raw = coalesce(raw, '{}'::jsonb)
               || jsonb_build_object('expired_reason', p_reason,
                                     'expired_at', now())
   where id = v_payment.id
   returning * into v_payment;

  -- La commande est libérée uniquement si rien ne l'a fait avancer entre-temps.
  update orders
     set status = 'cancelled'
   where id = v_payment.order_id
     and status = 'pending';

  -- 0037 : filet de sécurité. Le TTL de réservation (30 min) aura normalement
  -- déjà relibéré le stock bien avant ces 48 h — cet appel garantit qu'aucune
  -- unité ne reste immobilisée si le cron d'expiration a été interrompu.
  perform zabelie_release_stock(v_payment.order_id);

  return v_payment;
end;
$$;
revoke all on function zabelie_expire_stale_payment(text, text)
  from public, anon, authenticated;
