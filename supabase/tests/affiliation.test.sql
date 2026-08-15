-- Tests de l'affiliation (0081). Transaction annulée à la fin.
--
--   A1. La CASCADE au centime : paiement = commission (brut) + affilié (net)
--       + net vendeur final. Invariant 0033 vrai pour les DEUX wallets.
--   A2. Rejeu de confirm_payment : aucun double crédit, ni vendeur ni affilié.
--   A3. refund AVANT maturité : les DEUX escrows repris, pendings à zéro,
--       deux débits au ledger, invariant intact. Second refund idempotent.
--   A4. Sans attribution : comportement d'avant 0081, à l'identique.
--   A5. ZB081 : taux hors bornes refusé. ZB081b : attribution immuable.
--   A6. Dormance : config.actif = false à l'application.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000160001', 'a.vandè@test.local'),
  ('00000000-0000-0000-0000-000000160002', 'a.achtè@test.local'),
  ('00000000-0000-0000-0000-000000160003', 'a.afilye@test.local');
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role, tier) values
  ('00000000-0000-0000-0000-000000160001', 'Vandè Afil', 'creator', 'standard'),
  ('00000000-0000-0000-0000-000000160002', 'Achtè Afil', 'buyer', 'standard'),
  ('00000000-0000-0000-0000-000000160003', 'Afilye', 'buyer', 'standard');

insert into products (id, seller_id, slug, title, description, price_htg, kind, status, category)
values ('00000000-0000-0000-0000-000000170001',
        '00000000-0000-0000-0000-000000160001',
        'ebook-afil', 'E-book affilié', 'Test', 1000, 'fichier', 'published', 'Design');

insert into zabelie_affiliates (user_id, code)
values ('00000000-0000-0000-0000-000000160003', 'zab4test');
insert into zabelie_affiliate_rates (product_id, rate_bps)
values ('00000000-0000-0000-0000-000000170001', 2000); -- 20 %

-- ── A6 d'abord : dormance ───────────────────────────────────────────────────
do $$
begin
  if (select actif from zabelie_affiliate_config) then
    raise exception 'A6 KO : actif devrait être FALSE à l''application';
  end if;
  raise notice 'A6 OK — affiliation dormante par défaut';
end $$;

-- ── A1 — la cascade au centime ──────────────────────────────────────────────
do $$
declare
  v_order    uuid;
  v_w_vend   uuid; v_w_aff uuid;
  v_pend_v   bigint; v_pend_a bigint;
  v_ecart    bigint;
begin
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-000000160002',
          '00000000-0000-0000-0000-000000170001', 1000, 'pending')
  returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_order, 'moncash', v_order::text, 'pending');
  -- L'attribution, figée à la commande (ce que la route de checkout écrit).
  insert into zabelie_order_attribution (order_id, affiliate_id, rate_bps)
  values (v_order, '00000000-0000-0000-0000-000000160003', 2000);

  perform confirm_payment(v_order::text, 'REF-A1', null, 1000);

  -- 1000 = 100 (commission 10 %) + 180 (20 % de 900) + 720 (net final).
  select w.id, w.pending_htg into v_w_vend, v_pend_v
    from wallets w where owner_id = '00000000-0000-0000-0000-000000160001';
  select w.id, w.pending_htg into v_w_aff, v_pend_a
    from wallets w where owner_id = '00000000-0000-0000-0000-000000160003';
  if v_pend_v <> 720 then
    raise exception 'A1 KO : net vendeur attendu 720, obtenu %', v_pend_v;
  end if;
  if v_pend_a <> 180 then
    raise exception 'A1 KO : commission affilié attendue 180, obtenue %', v_pend_a;
  end if;
  if (select commission_htg from platform_earnings where order_id = v_order) <> 100 then
    raise exception 'A1 KO : commission plateforme attendue 100';
  end if;
  -- Invariant 0033, par wallet.
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_w_vend;
  if v_ecart <> 0 then raise exception 'A1 KO : écart vendeur %', v_ecart; end if;
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_w_aff;
  if v_ecart <> 0 then raise exception 'A1 KO : écart affilié %', v_ecart; end if;

  -- ── A2 — rejeu : no-op intégral ───────────────────────────────────────────
  perform confirm_payment(v_order::text, 'REF-A1', null, 1000);
  if (select pending_htg from wallets where id = v_w_vend) <> 720
     or (select pending_htg from wallets where id = v_w_aff) <> 180 then
    raise exception 'A2 KO : le rejeu a modifié un solde';
  end if;
  raise notice 'A1+A2 OK — 1000 = 100 + 180 + 720, invariant tenu, rejeu no-op';

  -- ── A3 — refund avant maturité : les DEUX repris ──────────────────────────
  if refund_order(v_order) <> 'reversed' then
    raise exception 'A3 KO : premier refund devait rendre reversed';
  end if;
  if (select pending_htg from wallets where id = v_w_vend) <> 0
     or (select pending_htg from wallets where id = v_w_aff) <> 0 then
    raise exception 'A3 KO : un pending a survécu au remboursement';
  end if;
  if (select count(*) from wallet_transactions
       where order_id = v_order and type = 'debit') <> 2 then
    raise exception 'A3 KO : attendu DEUX débits au ledger (vendeur + affilié)';
  end if;
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_w_vend;
  if v_ecart <> 0 then raise exception 'A3 KO : écart vendeur après refund %', v_ecart; end if;
  select ecart_htg into v_ecart from zabelie_wallet_coherence where wallet_id = v_w_aff;
  if v_ecart <> 0 then raise exception 'A3 KO : écart affilié après refund %', v_ecart; end if;
  if refund_order(v_order) <> 'already_reversed' then
    raise exception 'A3 KO : second refund devait rendre already_reversed';
  end if;
  raise notice 'A3 OK — deux escrows repris, deux débits, idempotent';
end $$;

-- ── A4 — sans attribution : l'ancien monde, à l'identique ───────────────────
do $$
declare v_order uuid; v_pend bigint;
begin
  insert into orders (buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-000000160002',
          '00000000-0000-0000-0000-000000170001', 1000, 'pending')
  returning id into v_order;
  insert into payments (order_id, rail, idempotency_key, status)
  values (v_order, 'moncash', v_order::text, 'pending');

  perform confirm_payment(v_order::text, 'REF-A4', null, 1000);

  select pending_htg into v_pend from wallets
   where owner_id = '00000000-0000-0000-0000-000000160001';
  -- 720 (A1, remboursé → 0) + 900 pleins : le vendeur sans affilié garde tout.
  if v_pend <> 900 then
    raise exception 'A4 KO : net attendu 900 sans attribution, obtenu %', v_pend;
  end if;
  if (select count(*) from escrow_entries where order_id = v_order) <> 1 then
    raise exception 'A4 KO : un seul escrow attendu sans attribution';
  end if;
  raise notice 'A4 OK — sans attribution, rien ne change';
end $$;

-- ── A5 — bornes et immuabilité ──────────────────────────────────────────────
do $$
begin
  begin
    update zabelie_affiliate_rates set rate_bps = 300
     where product_id = '00000000-0000-0000-0000-000000170001';
    raise exception 'A5a KO : 3 %% accepté (minimum 5 %%)';
  exception when others then
    if sqlerrm not like 'ZB081%' then raise; end if;
  end;
  begin
    update zabelie_affiliate_rates set rate_bps = 5000
     where product_id = '00000000-0000-0000-0000-000000170001';
    raise exception 'A5b KO : 50 %% accepté (maximum 40 %%)';
  exception when others then
    if sqlerrm not like 'ZB081%' then raise; end if;
  end;
  begin
    update zabelie_order_attribution set rate_bps = 100
     where order_id in (select order_id from zabelie_order_attribution limit 1);
    raise exception 'A5c KO : une attribution a pu être modifiée';
  exception when others then
    if sqlerrm not like 'ZB081b%' then raise; end if;
  end;
  raise notice 'A5 OK — bornes tenues, attribution immuable';
end $$;

rollback;
