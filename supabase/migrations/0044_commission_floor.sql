-- ============================================================================
-- 0044 — D-4 : l'arrondi de la commission va au VENDEUR (`floor`)
-- ============================================================================
-- ⚠️ NON APPLIQUÉE. Décision commerciale D-4 (`docs/02-DECISIONS.md`),
--    arbitrée par le porteur le 2026-07-26.
--
-- CE QUI CHANGE, ET POURQUOI CE N'ÉTAIT PAS UN CHOIX. `round()` en PostgreSQL
-- arrondit le demi vers le HAUT : sur 25 HTG à 10 %, la commission était 3 et
-- non 2,5 — la fraction allait TOUJOURS à la plateforme, jamais au vendeur.
-- Personne n'avait décidé ça ; c'est le défaut de la fonction dont on a
-- hérité. `floor()` rend la fraction au vendeur.
--
-- Mesuré sur 1 → 5 000 HTG : les deux règles diffèrent sur UNE VENTE SUR DEUX,
-- d'exactement 1 gourde. Coût maximal pour la plateforme : 1 HTG par vente,
-- 0,5 en moyenne. Sur 25 HTG le vendeur reçoit 23 au lieu de 22.
--
-- LA RÈGLE VIVAIT À DEUX ENDROITS — c'est le vrai défaut corrigé ici. Le même
-- `round()` était recopié dans `confirm_payment` (marketplace) ET dans
-- `zabelie_biz_confirm_invoice_payment` (facturation pro). Deux copies d'une
-- règle commerciale finissent toujours par diverger. Elles appellent
-- désormais UNE fonction unique : le prochain arbitrage se fera en un seul
-- endroit.
--
-- ⚠️ ORDRE D'APPLICATION. Cette migration remplace `confirm_payment` dans sa
-- version de PRODUCTION (`0027`). Les versions `0037` / `0038` (B2), non
-- appliquées, ont été mises à jour pour appeler le même helper — mais elles
-- le SUPPOSENT présent. Si B2 est appliquée un jour sans `0044`, elle
-- échouera sur une fonction manquante, ce qui est le bon échec : bruyant.
--
-- AUCUN EFFET SUR LE REGISTRE : `net = brut − commission` par soustraction,
-- l'identité de `0033` tient quel que soit l'arrondi.
--
-- ⚠️ À APPLIQUER AVANT LA PREMIÈRE VENTE. Le grand livre est append-only :
-- chaque ligne portera la règle en vigueur au moment où elle est écrite.
-- ============================================================================

-- ── La règle, en un seul endroit ────────────────────────────────────────────
create or replace function zabelie_commission_htg(
  p_gross_htg bigint,
  p_rate_bps  integer
)
returns bigint
language sql
immutable
set search_path = public
as $fn$
  -- `floor` et non `round` : l'arrondi va au VENDEUR (D-4). Le montant reste
  -- entier en gourdes — jamais de flottant sur le money-path.
  select floor(p_gross_htg::numeric * p_rate_bps / 10000)::bigint;
$fn$;
revoke all on function zabelie_commission_htg(bigint, integer)
  from public, anon, authenticated;

-- ── Marketplace — remplacement CONDITIONNEL ────────────────────────────────
-- ⚠️ Piège d'ordre, découvert en répétition et rendu impossible ici.
-- `confirm_payment` est remplacée par PLUSIEURS migrations : `0027` (version
-- en production), puis `0037`/`0038` (B2, non appliquées), puis `0043` §6
-- (B3). Cette migration-ci porte le corps de `0027`. Appliquée telle quelle
-- APRÈS B2 — ce que fait `supabase/tests/run.sh`, qui applique par numéro
-- croissant — elle REVENAIT en arrière et supprimait la consommation de
-- stock, en silence. C'est exactement la divergence de copies que ce fichier
-- prétend corriger, reproduite en la corrigeant.
--
-- D'où le garde : on ne remplace QUE si la version en place ignore le stock.
-- `0037`/`0038`/`0043` appellent déjà le même helper, donc `floor` s'applique
-- dans tous les cas — l'ordre d'application ne peut plus rien casser.
do $guard$
begin
  if exists (
    select 1 from pg_proc
     where proname = 'confirm_payment'
       and pg_get_functiondef(oid) like '%zabelie_consume_stock%'
  ) then
    raise notice
      'confirm_payment est déjà en version B2/B3 (stock) — elle appelle le helper, rien à faire.';
  else
    execute $cp$
drop function if exists confirm_payment(text, text, jsonb, integer, integer);

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
as $inner$
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
$inner$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;
    $cp$;
  end if;
end
$guard$;

-- ── Facturation pro (`0022`) — même règle, même helper ─────────────────────
create or replace function zabelie_biz_confirm_invoice_payment(
  p_invoice      uuid,
  p_provider     payment_rail,
  p_provider_ref text,
  p_amount       bigint,
  p_idempotency  text          -- ex: 'biz_pay:<order_ref>' — anti-rejeu
) returns zabelie_biz_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv        zabelie_biz_invoices;
  v_bps        integer;
  v_commission bigint;
  v_net        bigint;
  v_owner      uuid;
  v_wallet     uuid;
  v_pay        zabelie_biz_payments;
begin
  -- Rejeu : même clé déjà encaissée → on renvoie le paiement existant.
  select * into v_pay from zabelie_biz_payments where idempotency_key = p_idempotency;
  if found then return v_pay; end if;

  select * into v_inv from zabelie_biz_invoices where id = p_invoice for update;
  if not found then raise exception 'confirm: facture introuvable'; end if;
  if v_inv.status not in ('sent', 'partially_paid', 'overdue') then
    raise exception 'confirm: facture non payable (statut %)', v_inv.status;
  end if;
  if p_amount <= 0 then raise exception 'confirm: montant invalide'; end if;
  if v_inv.paid_htg + p_amount > v_inv.total_htg then
    raise exception 'confirm: sur-paiement refusé (reste dû %)',
      v_inv.total_htg - v_inv.paid_htg;
  end if;

  -- Commission depuis la config (figée sur le paiement).
  select value into v_bps from zabelie_biz_config where key = 'commission_bps';
  v_bps := coalesce(v_bps, 1000);
  v_commission := zabelie_commission_htg(p_amount, v_bps);
  v_net := p_amount - v_commission;

  -- Wallet du pro (créé à la volée). owner_id = user du pro = profiles.id.
  select user_id into v_owner from zabelie_biz_professionals
   where id = v_inv.professional_id;
  insert into wallets (owner_id) values (v_owner) on conflict (owner_id) do nothing;
  select id into v_wallet from wallets where owner_id = v_owner;

  -- Enregistre le paiement (idempotent par clé unique).
  insert into zabelie_biz_payments
    (invoice_id, provider, provider_ref, amount_htg, commission_htg, net_htg,
     rate_bps, status, idempotency_key)
  values
    (p_invoice, p_provider, p_provider_ref, p_amount, v_commission, v_net,
     v_bps, 'confirmed', p_idempotency)
  returning * into v_pay;

  -- Crédit IMMÉDIAT du net au solde DISPONIBLE (sans escrow) + ligne au ledger.
  insert into wallet_transactions
    (wallet_id, type, amount_htg, idempotency_key, reference)
  values
    (v_wallet, 'credit', v_net, 'biz_invoice_credit:' || v_pay.id,
     'Facture ' || coalesce(v_inv.invoice_number, left(v_inv.id::text, 8)));
  update wallets set balance_htg = balance_htg + v_net where id = v_wallet;

  -- Avance l'état de la facture.
  update zabelie_biz_invoices
     set paid_htg = paid_htg + p_amount,
         status = (case when paid_htg + p_amount >= total_htg then 'paid'
                        else 'partially_paid' end)::zabelie_biz_invoice_status,
         updated_at = now()
   where id = p_invoice;

  return v_pay;
end;
$$;
revoke all on function zabelie_biz_confirm_invoice_payment(uuid, payment_rail, text, bigint, text)
  from public, anon, authenticated;
