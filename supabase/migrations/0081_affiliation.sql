select zabelie_migration_garde('0081_affiliation.sql');

-- ============================================================================
-- 0081 — AFFILIATION (option B : le VENDEUR choisit, produit par produit)
-- ============================================================================
-- Signal porteur du 2026-08-15 : « implémente tout ce qui manque, avancer ».
-- Spec : docs/37 §A. Option B (TikTok Shop) : le consentement du vendeur règle
-- la question « qui paie » — celui qui offre un taux achète sa distribution,
-- celui qui n'offre rien n'est jamais prélevé.
--
-- ─── DORMANTE À L'APPLICATION ──────────────────────────────────────────────
-- `zabelie_affiliate_config.actif` vaut FALSE : aucun code n'est délivré,
-- aucune attribution n'est écrite, personne n'est prélevé. Le porteur arme
-- par UPDATE. Une post-condition CASSE la migration si ce défaut change.
--
-- ─── LA LEÇON JUMIA, HÉRITÉE SANS AVOIR PAYÉ L'ERREUR ──────────────────────
-- Leur première version payait à la commande REÇUE — manipulée, bascule
-- forcée vers « payé au réglé » (docs/37, sources). Ici : attribution figée à
-- la CRÉATION de commande, crédit à la CONFIRMATION serveur du paiement,
-- maturation J+7 identique au vendeur, remboursement avant maturité qui
-- reprend les DEUX crédits.
--
-- ─── LA CASCADE, VÉRIFIABLE AU CENTIME (docs/06) ───────────────────────────
--   paiement = commission plateforme (sur brut)
--            + commission affilié   (sur net vendeur)
--            + net vendeur final
-- L'invariant 0033 (Σ ledger = balance + pending) reste vrai par wallet.
--
-- ─── LES DEUX FONCTIONS D'ARGENT RÉÉCRITES, ET LA PREUVE D'ORIGINE ─────────
-- `confirm_payment` et `refund_order` sont réécrites À PARTIR DU CORPS DE
-- PRODUCTION, lu le 2026-08-15 (md5 canoniques : 67b2603ac0604dfbaa36797f1b0e90cd
-- et f2fb8e88db64b6e8859d1fc0ec93a9fc) — pas du texte d'une migration, parce
-- que 0044 ne remplaçait que conditionnellement et que la prod porte la
-- branche rupture-de-stock de 0038 qu'aucun fichier ne montre seule. Le garde
-- ci-dessous refuse d'écraser un corps inattendu.
--
-- ─── POURQUOI LA CONTRAINTE D'ESCROW S'ÉLARGIT ─────────────────────────────
-- `escrow_entries.order_id` était UNIQUE : une commande, un escrow. Deux
-- bénéficiaires (vendeur + affilié) exigent (order_id, wallet_id). Les DEUX
-- consommateurs à ligne unique recensés — confirm_payment (`on conflict`),
-- refund_order (`select into`) — sont réécrits ICI MÊME : la contrainte et
-- ses lecteurs changent dans la même transaction, jamais l'un sans l'autre.
-- ============================================================================

-- ── 0. Garde d'origine : on n'écrase pas un corps qu'on n'a pas lu ──────────
do $$
declare
  v_confirm text := pg_get_functiondef('confirm_payment(text,text,jsonb,integer,integer)'::regprocedure);
  v_refund  text := pg_get_functiondef('refund_order(uuid)'::regprocedure);
begin
  if position('zabelie_consume_stock_strict' in v_confirm) = 0 then
    raise exception '0081 KO: confirm_payment en place ne porte pas la branche stock (0038) — corps inattendu, NE PAS écraser';
  end if;
  if position('affiliate_credit' in v_confirm) > 0 then
    raise exception '0081 KO: confirm_payment porte déjà l''affiliation — rejeu ?';
  end if;
  if position('zabelie_release_stock' in v_refund) = 0 then
    raise exception '0081 KO: refund_order en place ne libère pas le stock (0037) — corps inattendu';
  end if;
end $$;

-- ── 1. Configuration (ligne unique, règle dure n°3) ─────────────────────────
create table zabelie_affiliate_config (
  id           boolean primary key default true check (id),
  actif        boolean not null default false,
  taux_min_bps integer not null default 500  check (taux_min_bps between 1 and 5000),
  taux_max_bps integer not null default 4000 check (taux_max_bps between 100 and 8000),
  check (taux_max_bps > taux_min_bps)
);
insert into zabelie_affiliate_config default values;
comment on table zabelie_affiliate_config is
  'Affiliation (docs/37 §A, option B). actif=FALSE à l''application — s''arme par UPDATE. Bornes 5-40 % (docs/06), en bps, jamais en dur.';
alter table zabelie_affiliate_config enable row level security;

-- ── 2. Les affiliés ─────────────────────────────────────────────────────────
create table zabelie_affiliates (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  created_at timestamptz not null default now()
);
comment on table zabelie_affiliates is
  'Un affilié = un utilisateur + un code opaque (jamais son nom). Son argent vit dans wallets, comme tout le monde : même maturation, même retrait, même KYC (0079).';
alter table zabelie_affiliates enable row level security;
create policy zabelie_affiliates_own_read on zabelie_affiliates
  for select using (auth.uid() = user_id);

-- ── 3. Le taux par produit — l'opt-in du vendeur ────────────────────────────
create table zabelie_affiliate_rates (
  product_id uuid primary key references products (id) on delete cascade,
  rate_bps   integer not null,
  updated_at timestamptz not null default now()
);
comment on table zabelie_affiliate_rates is
  'Le CONSENTEMENT du vendeur, produit par produit (option B). Pas de ligne = pas de prélèvement, jamais. Bornes redites en base par ZB081.';
alter table zabelie_affiliate_rates enable row level security;
create policy zabelie_affiliate_rates_read on zabelie_affiliate_rates
  for select using (true);

create function zabelie_affiliate_rate_garde()
returns trigger
language plpgsql
as $$
declare v_cfg zabelie_affiliate_config;
begin
  select * into v_cfg from zabelie_affiliate_config;
  if new.rate_bps < v_cfg.taux_min_bps or new.rate_bps > v_cfg.taux_max_bps then
    raise exception 'ZB081: taux % bps hors bornes [%, %]',
      new.rate_bps, v_cfg.taux_min_bps, v_cfg.taux_max_bps;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger zabelie_affiliate_rate_garde_trg
  before insert or update on zabelie_affiliate_rates
  for each row execute function zabelie_affiliate_rate_garde();

-- ── 4. L'attribution — figée à la création de commande ──────────────────────
create table zabelie_order_attribution (
  order_id     uuid primary key references orders (id) on delete cascade,
  affiliate_id uuid not null references zabelie_affiliates (user_id) on delete cascade,
  rate_bps     integer not null check (rate_bps between 1 and 8000),
  created_at   timestamptz not null default now()
);
comment on table zabelie_order_attribution is
  'Attribution FIGÉE à la création de la commande (leçon Jumia) : le taux du moment, pas celui du paiement. Aucune mise à jour possible (ZB081b).';
alter table zabelie_order_attribution enable row level security;

create function zabelie_attribution_figee()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ZB081b: une attribution ne se modifie pas — elle se fige à la commande';
end;
$$;
create trigger zabelie_attribution_figee_trg
  before update on zabelie_order_attribution
  for each row execute function zabelie_attribution_figee();

-- ── 5. escrow_entries : (order_id) → (order_id, wallet_id) ──────────────────
do $$
declare v_con text;
begin
  select c.conname into v_con
    from pg_constraint c
   where c.conrelid = 'escrow_entries'::regclass
     and c.contype = 'u'
     and array_length(c.conkey, 1) = 1
     and (select a.attname from pg_attribute a
           where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) = 'order_id';
  if v_con is null then
    raise exception '0081 KO: contrainte unique(order_id) introuvable sur escrow_entries — état inattendu';
  end if;
  execute format('alter table escrow_entries drop constraint %I', v_con);
end $$;
alter table escrow_entries
  add constraint escrow_entries_order_wallet_key unique (order_id, wallet_id);

-- ── 6. confirm_payment — corps de PRODUCTION + prélèvement affilié ──────────
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
  v_stock      text;
  -- 0081 : le prélèvement affilié (option B — n'existe que si le vendeur a
  -- offert un taux ET qu'un code valide accompagnait la commande).
  v_attrib     zabelie_order_attribution;
  v_aff        bigint := 0;
  v_aff_wallet uuid;
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
  -- D-4 : règle unique, `floor` (l'arrondi va au vendeur). Suppose 0044.
  v_commission := zabelie_commission_htg(v_order.amount_htg, v_rate_bps);
  v_net        := v_order.amount_htg - v_commission;

  -- 0081 : commission affilié SUR LE NET VENDEUR (cascade docs/06), au taux
  -- FIGÉ à la commande. `floor` : l'arrondi va au vendeur, comme pour D-4.
  select * into v_attrib from zabelie_order_attribution where order_id = v_order.id;
  if found and v_attrib.affiliate_id <> v_seller_id then
    v_aff := floor(v_net * v_attrib.rate_bps / 10000.0);
    if v_aff > 0 then
      v_net := v_net - v_aff;
    else
      v_aff := 0;
    end if;
  end if;

  insert into wallets (owner_id) values (v_seller_id) on conflict (owner_id) do nothing;
  select id into v_wallet_id from wallets where owner_id = v_seller_id;

  with ins as (
    insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
    values (v_order.id, v_wallet_id, v_net, now() + interval '7 days', 'maturing')
    on conflict (order_id, wallet_id) do nothing
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

    -- 0081 : le crédit affilié — même escrow, même maturation, même ledger.
    -- DANS le bloc idempotent : un rejeu qui n'a pas crédité le vendeur ne
    -- crédite pas l'affilié non plus.
    if v_aff > 0 then
      insert into wallets (owner_id) values (v_attrib.affiliate_id)
      on conflict (owner_id) do nothing;
      select id into v_aff_wallet from wallets where owner_id = v_attrib.affiliate_id;

      with ins_aff as (
        insert into escrow_entries (order_id, wallet_id, amount_htg, matures_at, status)
        values (v_order.id, v_aff_wallet, v_aff, now() + interval '7 days', 'maturing')
        on conflict (order_id, wallet_id) do nothing
        returning amount_htg
      )
      update wallets w
         set pending_htg = w.pending_htg + (select amount_htg from ins_aff)
       where w.id = v_aff_wallet and exists (select 1 from ins_aff);

      insert into wallet_transactions
        (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
      values
        (v_aff_wallet, 'credit', v_aff, v_order.id,
         'affiliate_credit:' || v_order.id,
         'Commission affilié en attente #' || left(v_order.id::text, 8))
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return v_payment;
end;
$inner$;
revoke all on function confirm_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;

-- ── 7. refund_order — la boucle sur TOUS les escrows d'une commande ─────────
create or replace function refund_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $inner$
declare
  v_esc      escrow_entries;
  v_total    integer := 0;
  v_reversed integer := 0;
begin
  /* 0081 : une commande peut porter DEUX escrows (vendeur + affilié).
   * L'ancienne forme — `select into` à ligne unique — aurait remboursé l'un
   * des deux en silence, au hasard du plan d'exécution. La boucle reprend
   * chacun, et la clé d'idempotence porte le wallet : deux débits distincts,
   * deux traces distinctes. Les remboursements historiques (clé sans wallet)
   * restent intacts — leurs escrows sont déjà 'reversed', la boucle les
   * saute. */
  for v_esc in
    select * from escrow_entries where order_id = p_order_id
    order by created_at for update
  loop
    v_total := v_total + 1;
    if v_esc.status = 'reversed' then
      v_reversed := v_reversed + 1;
      continue;
    end if;

    if v_esc.status = 'maturing' then
      update wallets set pending_htg = pending_htg - v_esc.amount_htg
       where id = v_esc.wallet_id;
    else -- 'matured' : fonds déjà disponibles
      update wallets set balance_htg = balance_htg - v_esc.amount_htg
       where id = v_esc.wallet_id;
    end if;

    update escrow_entries set status = 'reversed' where id = v_esc.id;

    insert into wallet_transactions
      (wallet_id, type, amount_htg, order_id, idempotency_key, reference)
    values
      (v_esc.wallet_id, 'debit', -v_esc.amount_htg, p_order_id,
       'order_refund:' || p_order_id || ':' || v_esc.wallet_id,
       'Remboursement #' || left(p_order_id::text, 8))
    on conflict (idempotency_key) do nothing;
  end loop;

  if v_total = 0 then
    raise exception 'refund_order: aucun escrow pour order %', p_order_id;
  end if;
  if v_reversed = v_total then
    return 'already_reversed'; -- idempotent
  end if;

  update orders set status = 'refunded' where id = p_order_id;

  -- 0037 : la vente est annulée — les unités reviennent en vente.
  perform zabelie_release_stock(p_order_id);

  return 'reversed';
end;
$inner$;
revoke all on function refund_order(uuid) from public, anon, authenticated;

-- ── 8. Post-conditions ──────────────────────────────────────────────────────
do $$
declare
  v_confirm text := pg_get_functiondef('confirm_payment(text,text,jsonb,integer,integer)'::regprocedure);
  v_refund  text := pg_get_functiondef('refund_order(uuid)'::regprocedure);
begin
  if (select actif from zabelie_affiliate_config) then
    raise exception '0081 KO: l''affiliation ne doit PAS être armée à l''application';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'escrow_entries_order_wallet_key' and contype = 'u'
  ) then
    raise exception '0081 KO: contrainte (order_id, wallet_id) absente';
  end if;
  -- La réécriture n'a perdu NI le stock (0038), ni le coupon (BL-133), ni le
  -- garde USD (0009) — et porte bien l'affiliation. Croisé sur le texte réel.
  if position('zabelie_consume_stock_strict' in v_confirm) = 0
     or position('zabelie_coupon_consume' in v_confirm) = 0
     or position('expected_usd_cents' in v_confirm) = 0
     or position('affiliate_credit' in v_confirm) = 0 then
    raise exception '0081 KO: confirm_payment a perdu un mécanisme en route';
  end if;
  if position('for v_esc in' in v_refund) = 0 then
    raise exception '0081 KO: refund_order ne boucle pas sur les escrows';
  end if;
  if (select count(*) from zabelie_order_attribution) <> 0 then
    raise exception '0081 KO: une attribution existe déjà — la table doit naître vide';
  end if;
end $$;
