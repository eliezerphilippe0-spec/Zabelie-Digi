-- Tests du paiement groupé (0128) — panier multi-vendeurs. Transaction annulée.
--
--   G1. Désactivé par défaut : aucun groupe ne s'ouvre.
--   G2. Scellement : refuse un groupe d'une commande, deux meneuses, une
--       commande d'un autre acheteur ; fige le total depuis la base.
--   G3. Connu-POSITIF : UN paiement du total sur la clé de la meneuse →
--       chaque commande payée, escrow et crédit par vendeur, identité du
--       grand livre préservée pour chacun, groupe confirmé.
--   G4. Rejeu (meneuse ou autre commande) : aucun double crédit.
--   G5. Connu-NÉGATIF : total faux → toutes les commandes en litige, aucun
--       crédit, groupe en échec.
--   G6. USD (Stripe) : total USD exact → confirmé ; faux → échec.
--   G7. Expiration de la meneuse → tout le groupe annulé.
--   G8. Une commande hors groupe se confirme exactement comme avant.
--   G9. Abandon avant paiement : commandes annulées ; jamais sur un groupe confirmé.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'gv1@test.local'),
  ('00000000-0000-0000-0000-0000000f0002', 'gv2@test.local'),
  ('00000000-0000-0000-0000-0000000f0003', 'gachteur@test.local'),
  ('00000000-0000-0000-0000-0000000f0004', 'gautre@test.local')
  on conflict do nothing;
insert into profiles (id, display_name) select id, 'Gwoup' from auth.users
  where id::text like '00000000-0000-0000-0000-0000000f000%' on conflict (id) do nothing;
update profiles set role = 'creator' where id in ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0002');

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000f00a1', '00000000-0000-0000-0000-0000000f0001', 'gwoup-a', 'Gid A', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000f00a2', '00000000-0000-0000-0000-0000000f0002', 'gwoup-b', 'Gid B', 'fichier', 3000, 'published');

-- Fabrique : un groupe de deux commandes (meneuse = vendeur 1), scellé.
create temp table g_ids (nom text primary key, id uuid);
create function pg_temp.groupe(p_nom text, p_rail payment_rail, p_usd1 integer default null, p_usd2 integer default null)
returns uuid language plpgsql as $$
declare g uuid; o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid();
begin
  g := zabelie_group_create('00000000-0000-0000-0000-0000000f0003', p_rail);
  insert into orders (id, buyer_id, product_id, amount_htg, status, group_id) values
    (o1, '00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f00a1', 1000, 'pending', g),
    (o2, '00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f00a2', 3000, 'pending', g);
  insert into payments (order_id, rail, idempotency_key, status, expected_usd_cents) values
    (o1, p_rail, o1::text, 'pending', p_usd1),
    (o2, 'groupe', o2::text, 'pending', p_usd2);
  insert into g_ids values (p_nom, g), (p_nom || ':meneuse', o1), (p_nom || ':autre', o2);
  return g;
end $$;

-- G1 ───────────────────────────────────────────────────────────────────────────
do $$
begin
  begin
    perform zabelie_group_create('00000000-0000-0000-0000-0000000f0003', 'moncash');
    raise exception 'G1 KO : un groupe s''ouvre alors que le paiement groupé est désactivé';
  exception when raise_exception then
    -- Le PRÉFIXE de la fonction, pas un mot : le message d'échec du test
    -- contient lui-même « désactivé » et serait avalé (mutation survivante).
    if sqlerrm not like 'zabelie_group_create:%' then raise; end if;
  end;
  raise notice 'G1 OK — désactivé par défaut';
end $$;
update zabelie_panier_config set paiement_groupe = true;

-- G2 ───────────────────────────────────────────────────────────────────────────
do $$
declare g uuid; r jsonb; o uuid := gen_random_uuid();
begin
  g := zabelie_group_create('00000000-0000-0000-0000-0000000f0003', 'moncash');
  insert into orders (id, buyer_id, product_id, amount_htg, status, group_id)
    values (o, '00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f00a1', 1000, 'pending', g);
  insert into payments (order_id, rail, idempotency_key, status) values (o, 'moncash', o::text, 'pending');
  begin perform zabelie_group_seal(g); raise exception 'G2 KO : groupe d''une seule commande scellé';
  exception when raise_exception then if sqlerrm not like '%au moins deux%' then raise; end if; end;

  o := gen_random_uuid();
  insert into orders (id, buyer_id, product_id, amount_htg, status, group_id)
    values (o, '00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f00a2', 3000, 'pending', g);
  insert into payments (order_id, rail, idempotency_key, status) values (o, 'moncash', o::text, 'pending');
  begin perform zabelie_group_seal(g); raise exception 'G2 KO : deux meneuses acceptées';
  exception when raise_exception then if sqlerrm not like '%exactement une%' then raise; end if; end;
  update payments set rail = 'groupe' where order_id = o;
  update orders set buyer_id = '00000000-0000-0000-0000-0000000f0004' where id = o;
  begin perform zabelie_group_seal(g); raise exception 'G2 KO : commande d''un autre acheteur acceptée';
  exception when raise_exception then if sqlerrm not like '%non conforme%' then raise; end if; end;

  update orders set buyer_id = '00000000-0000-0000-0000-0000000f0003' where id = o;
  r := zabelie_group_seal(g);
  if (r->>'total_htg')::int <> 4000 or (r->>'commandes')::int <> 2 then raise exception 'G2 KO : scellé %', r; end if;
  begin perform zabelie_group_seal(g); raise exception 'G2 KO : scellé deux fois';
  exception when raise_exception then if sqlerrm not like '%déjà scellé%' then raise; end if; end;
  perform zabelie_group_abort(g);
  raise notice 'G2 OK — scellement : au moins deux, une meneuse, un acheteur ; total figé depuis la base';
end $$;

-- G3 / G4 ──────────────────────────────────────────────────────────────────────
select pg_temp.groupe('ok', 'moncash');
select zabelie_group_seal((select id from g_ids where nom = 'ok'));
do $$
declare g uuid := (select id from g_ids where nom = 'ok');
        m text := (select id from g_ids where nom = 'ok:meneuse')::text;
        a text := (select id from g_ids where nom = 'ok:autre')::text;
        pay payments; n integer; w record;
begin
  pay := confirm_payment(m, 'TXG', '{}'::jsonb, 4000);
  if pay.status <> 'confirmed' then raise exception 'G3 KO : meneuse %', pay.status; end if;
  if (select count(*) from orders where group_id = g and status = 'paid') <> 2 then raise exception 'G3 KO : commandes non payées'; end if;
  if (select count(*) from payments p join orders o on o.id = p.order_id where o.group_id = g and p.status = 'confirmed' and p.provider_ref = 'TXG') <> 2 then
    raise exception 'G3 KO : paiements';
  end if;
  if (select count(*) from escrow_entries e join orders o on o.id = e.order_id where o.group_id = g) <> 2 then raise exception 'G3 KO : escrows'; end if;
  if (select status from zabelie_order_groups where id = g) <> 'confirmed' then raise exception 'G3 KO : groupe'; end if;
  for w in select wl.id, wl.balance_htg, wl.pending_htg,
                  (select coalesce(sum(amount_htg), 0) from wallet_transactions t where t.wallet_id = wl.id) as ledger
             from wallets wl where wl.owner_id in ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0002') loop
    if w.ledger <> w.balance_htg + w.pending_htg then raise exception 'G3 KO : identité du grand livre rompue (%)', w; end if;
  end loop;
  if (select count(*) from wallets where owner_id in ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000f0002') and pending_htg > 0) <> 2 then
    raise exception 'G3 KO : chaque vendeur n''est pas crédité';
  end if;
  raise notice 'G3 OK — un paiement, deux commandes payées, deux vendeurs crédités, grand livre intact';

  select count(*) into n from wallet_transactions t join orders o on o.id = t.order_id where o.group_id = g;
  update zabelie_order_groups set confirmed_at = '2026-01-01' where id = g;
  perform confirm_payment(m, 'TXG', '{}'::jsonb, 4000);
  perform confirm_payment(a, 'TXG', '{}'::jsonb, 4000);
  if (select count(*) from wallet_transactions t join orders o on o.id = t.order_id where o.group_id = g) <> n then
    raise exception 'G4 KO : un rejeu a écrit au grand livre';
  end if;
  if (select confirmed_at from zabelie_order_groups where id = g) <> '2026-01-01' then
    raise exception 'G4 KO : un rejeu a reconfirmé le groupe';
  end if;
  -- La garde de rejeu du groupe est inatteignable par `confirm_payment` (la
  -- meneuse confirmée sort avant la branche) : on l'éprouve en direct.
  perform zabelie_confirm_group_payment(g, 'TXG', '{}'::jsonb, 4000, null);
  if (select confirmed_at from zabelie_order_groups where id = g) <> '2026-01-01' then
    raise exception 'G4 KO : rejeu direct du groupe non idempotent';
  end if;
  raise notice 'G4 OK — rejeu sur la meneuse ou une autre commande : aucun double crédit';
end $$;

-- G5 ───────────────────────────────────────────────────────────────────────────
select pg_temp.groupe('faux', 'moncash');
select zabelie_group_seal((select id from g_ids where nom = 'faux'));
do $$
declare g uuid := (select id from g_ids where nom = 'faux'); pay payments;
begin
  pay := confirm_payment((select id from g_ids where nom = 'faux:meneuse')::text, 'TXF', '{}'::jsonb, 1000);
  if pay.status <> 'failed' then raise exception 'G5 KO : meneuse %', pay.status; end if;
  if (select count(*) from orders where group_id = g and status = 'disputed') <> 2 then raise exception 'G5 KO : commandes pas toutes en litige'; end if;
  if exists (select 1 from escrow_entries e join orders o on o.id = e.order_id where o.group_id = g) then raise exception 'G5 KO : crédit malgré un total faux'; end if;
  if (select status from zabelie_order_groups where id = g) <> 'failed' then raise exception 'G5 KO : groupe'; end if;
  raise notice 'G5 OK — total faux : tout en litige, aucun crédit';
end $$;

-- G6 ───────────────────────────────────────────────────────────────────────────
select pg_temp.groupe('usd', 'stripe', 800, 2400);
select pg_temp.groupe('usdfaux', 'stripe', 800, 2400);
do $$
declare r jsonb; pay payments;
begin
  r := zabelie_group_seal((select id from g_ids where nom = 'usd'));
  if (r->>'expected_usd_cents')::int <> 3200 then raise exception 'G6 KO : USD attendu %', r; end if;
  perform zabelie_group_seal((select id from g_ids where nom = 'usdfaux'));
  pay := confirm_payment((select id from g_ids where nom = 'usd:meneuse')::text, 'cs_1', '{}'::jsonb, null, 3200);
  if pay.status <> 'confirmed' or (select count(*) from orders where group_id = (select id from g_ids where nom = 'usd') and status = 'paid') <> 2 then
    raise exception 'G6 KO : USD exact non confirmé';
  end if;
  pay := confirm_payment((select id from g_ids where nom = 'usdfaux:meneuse')::text, 'cs_2', '{}'::jsonb, null, 800);
  if pay.status <> 'failed' then raise exception 'G6 KO : USD faux accepté'; end if;
  raise notice 'G6 OK — Stripe : total USD du groupe vérifié';
end $$;

-- G7 ───────────────────────────────────────────────────────────────────────────
select pg_temp.groupe('exp', 'kobara');
select zabelie_group_seal((select id from g_ids where nom = 'exp'));
update payments set created_at = now() - interval '49 hours'
 where order_id = (select id from g_ids where nom = 'exp:meneuse');
do $$
declare g uuid := (select id from g_ids where nom = 'exp');
begin
  perform zabelie_expire_stale_payment((select id from g_ids where nom = 'exp:meneuse')::text, 'test');
  if (select count(*) from orders where group_id = g and status = 'cancelled') <> 2 then raise exception 'G7 KO : groupe non annulé'; end if;
  if (select count(*) from payments p join orders o on o.id = p.order_id where o.group_id = g and p.status = 'failed') <> 2 then raise exception 'G7 KO : paiements'; end if;
  if (select status from zabelie_order_groups where id = g) <> 'failed' then raise exception 'G7 KO : statut du groupe'; end if;
  raise notice 'G7 OK — la meneuse expire, tout le groupe est annulé';
end $$;

-- G8 ───────────────────────────────────────────────────────────────────────────
do $$
declare o uuid := gen_random_uuid(); pay payments;
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status)
    values (o, '00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000f00a1', 1000, 'pending');
  insert into payments (order_id, rail, idempotency_key, status) values (o, 'moncash', o::text, 'pending');
  pay := confirm_payment(o::text, 'TXS', '{}'::jsonb, 1000);
  if pay.status <> 'confirmed' or (select status from orders where id = o) <> 'paid' then raise exception 'G8 KO : commande seule'; end if;
  if coalesce(current_setting('zabelie.groupe_en_cours', true), '') <> '' then raise exception 'G8 KO : marqueur de groupe resté posé'; end if;
  raise notice 'G8 OK — une commande hors groupe se confirme comme avant';
end $$;

-- G9 ───────────────────────────────────────────────────────────────────────────
select pg_temp.groupe('ab', 'moncash');
do $$
declare g uuid := (select id from g_ids where nom = 'ab');
begin
  if zabelie_group_abort(g) <> 'abandonne' then raise exception 'G9 KO : abandon'; end if;
  if (select count(*) from orders where group_id = g and status = 'cancelled') <> 2 then raise exception 'G9 KO : commandes'; end if;
  if zabelie_group_abort((select id from g_ids where nom = 'ok')) <> 'deja_confirme' then raise exception 'G9 KO : groupe confirmé abandonné'; end if;
  if (select count(*) from orders where group_id = (select id from g_ids where nom = 'ok') and status = 'paid') <> 2 then raise exception 'G9 KO : groupe payé touché'; end if;
  raise notice 'G9 OK — abandon avant paiement ; jamais sur un groupe confirmé';
end $$;

rollback;
