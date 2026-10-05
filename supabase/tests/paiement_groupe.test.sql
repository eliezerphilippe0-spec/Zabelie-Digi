-- Tests du paiement groupé (0128) — panier multi-vendeurs. Transaction annulée.
--
--   G1. Fermé tant qu'aucune vente réelle ; ouvert de lui-même dès la première.
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
--   G10. La meneuse échoue (n'importe quel chemin) → tout le groupe tombe ;
--        jamais sur un groupe confirmé.
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
-- L'ouverture : fermé sans vente réelle, ouvert dès la première (instruction
-- porteur du 2026-10-05). Chaque cas qui NE doit PAS ouvrir est posé avant
-- celui qui ouvre : un garde retiré se voit au cas qu'il gardait.
create function pg_temp.vente(p_live boolean, p_statut order_status, p_montant integer)
returns void language sql as $$
  insert into orders (buyer_id, product_id, amount_htg, status, zabelie_payment_is_live)
  values ('00000000-0000-0000-0000-0000000f0004', '00000000-0000-0000-0000-0000000f00a1', p_montant, p_statut, p_live);
$$;
do $$
begin
  if exists (select 1 from orders where status in ('paid', 'delivered') and zabelie_payment_is_live and amount_htg > 0) then
    raise exception 'G1 : base de test impure, une vente réelle existe déjà';
  end if;
  if (select ouvrir_apres_premiere_vente from zabelie_panier_config) is distinct from true then
    raise exception 'G1 KO : l''ouverture à la première vente n''est pas armée par défaut';
  end if;
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : ouvert sans aucune vente'; end if;
  begin
    perform zabelie_group_create('00000000-0000-0000-0000-0000000f0003', 'moncash');
    raise exception 'G1 KO : un groupe s''ouvre alors que le paiement groupé est fermé';
  exception when raise_exception then
    -- Le PRÉFIXE de la fonction, pas un mot : le message d'échec du test
    -- contient lui-même « fermé » et serait avalé (mutation survivante).
    if sqlerrm not like 'zabelie_group_create:%' then raise; end if;
  end;
  perform pg_temp.vente(false, 'paid', 1000);
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : une vente d''ESSAI ouvre le panier groupé'; end if;
  perform pg_temp.vente(true, 'refunded', 1000);
  perform pg_temp.vente(true, 'pending', 1000);
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : une vente remboursée ou impayée ouvre le panier groupé'; end if;
  perform pg_temp.vente(true, 'paid', 0);
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : une acquisition gratuite ouvre le panier groupé'; end if;

  -- Production + profil test ne suffit pas à faire une vente réelle.
  update profiles set is_test=true where id='00000000-0000-0000-0000-0000000f0004';
  perform pg_temp.vente(true,'paid',1000);
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : acheteur test ouvre le panier'; end if;
  update orders set status='refunded' where zabelie_payment_is_live and amount_htg>0;
  update profiles set is_test=false where id='00000000-0000-0000-0000-0000000f0004';
  update profiles set is_test=true where id='00000000-0000-0000-0000-0000000f0001';
  perform pg_temp.vente(true,'paid',1000);
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : vendeur test ouvre le panier'; end if;
  update orders set status='refunded' where zabelie_payment_is_live and amount_htg>0;
  update profiles set is_test=false where id='00000000-0000-0000-0000-0000000f0001';

  -- Simule une auto-vente antérieure à 0132, pas un contournement autorisé.
  alter table orders disable trigger zabelie_order_seller_guard;
  insert into orders(buyer_id,product_id,amount_htg,status,zabelie_payment_is_live)
  values('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000f00a1',1000,'paid',true);
  alter table orders enable trigger zabelie_order_seller_guard;
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : auto-vente historique ouvre le panier'; end if;
  begin
    update orders set status='delivered' where buyer_id='00000000-0000-0000-0000-0000000f0001';
    raise exception 'G1 KO : auto-vente historique livrée';
  exception when sqlstate 'ZB132' then null; end;
  -- La réparation compensatoire reste possible ; aucune preuve effacée.
  update orders set status='refunded' where buyer_id='00000000-0000-0000-0000-0000000f0001';

  perform pg_temp.vente(true, 'paid', 1000);
  if not zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : la première vente réelle n''ouvre pas'; end if;
  perform zabelie_group_abort(zabelie_group_create('00000000-0000-0000-0000-0000000f0003', 'moncash'));

  update zabelie_panier_config set ouvrir_apres_premiere_vente = false;
  if zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : désarmé, il reste ouvert'; end if;
  update zabelie_panier_config set paiement_groupe = true;
  if not zabelie_panier_groupe_ouvert() then raise exception 'G1 KO : le drapeau manuel n''ouvre pas'; end if;
  raise notice 'G1 OK — fermé sans vente réelle (essai, remboursée, impayée, gratuite) ; ouvert dès la première ; drapeau manuel';
end $$;

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
  begin
    update payments set rail='groupe' where order_id=o;
    raise exception 'G2 KO : rail d’origine modifiable';
  exception when sqlstate 'ZB132' then null; end;
  -- Nouvelle fixture non payée, pas mutation de provenance d'un paiement.
  delete from payments where order_id=o;
  insert into payments(order_id,rail,idempotency_key,status) values(o,'groupe',o::text,'pending');
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
-- Panier de l'acheteur : les deux articles du groupe, et un troisième qui doit rester.
insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000f00a3', '00000000-0000-0000-0000-0000000f0002', 'gwoup-c', 'Gid C', 'fichier', 500, 'published');
insert into zabelie_carts (id, buyer_id) values ('00000000-0000-0000-0000-0000000f00c1', '00000000-0000-0000-0000-0000000f0003');
insert into zabelie_cart_items (cart_id, product_id) values
  ('00000000-0000-0000-0000-0000000f00c1', '00000000-0000-0000-0000-0000000f00a1'),
  ('00000000-0000-0000-0000-0000000f00c1', '00000000-0000-0000-0000-0000000f00a2'),
  ('00000000-0000-0000-0000-0000000f00c1', '00000000-0000-0000-0000-0000000f00a3');
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
  if (select array_agg(product_id::text order by product_id) from zabelie_cart_items
       where cart_id = '00000000-0000-0000-0000-0000000f00c1') is distinct from array['00000000-0000-0000-0000-0000000f00a3'] then
    raise exception 'G3 KO : le panier garde les articles payés, ou a perdu l''autre';
  end if;
  raise notice 'G3 OK — un paiement, deux commandes payées, deux vendeurs crédités, grand livre intact, panier vidé des seuls articles payés';

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

-- G10 ──────────────────────────────────────────────────────────────────────────
select pg_temp.groupe('echec', 'stripe', 1000, 3000);
select zabelie_group_seal((select id from g_ids where nom = 'echec'));
do $$
declare g uuid := (select id from g_ids where nom = 'echec');
        m uuid := (select id from g_ids where nom = 'echec:meneuse');
        a uuid := (select id from g_ids where nom = 'echec:autre');
        ok uuid := (select id from g_ids where nom = 'ok');
begin
  -- Le chemin le plus nu : un UPDATE direct, comme le ferait toute fonction d'échec.
  update payments set status = 'failed' where order_id = m;
  if (select status from payments where order_id = a) <> 'failed' then raise exception 'G10 KO : l''autre paiement reste %', (select status from payments where order_id = a); end if;
  if (select status from orders where id = a) <> 'cancelled' then raise exception 'G10 KO : l''autre commande reste %', (select status from orders where id = a); end if;
  if (select status from zabelie_order_groups where id = g) <> 'failed' then raise exception 'G10 KO : groupe'; end if;
  -- Groupe confirmé : un échec tardif sur la meneuse ne défait rien.
  update payments set status = 'failed' where order_id = (select id from g_ids where nom = 'ok:meneuse');
  if (select count(*) from orders where group_id = ok and status = 'paid') <> 2
     or (select status from zabelie_order_groups where id = ok) <> 'confirmed' then
    raise exception 'G10 KO : un groupe confirmé a été défait';
  end if;
  raise notice 'G10 OK — la meneuse échoue, le groupe tombe ; jamais un groupe confirmé';
end $$;

-- G11 : justificatif externe d'un enfant groupé, provenance de la meneuse.
-- La réponse de cron porte `provider`, pas `kobara_provider`, puis son
-- payload peut disparaître sans perdre le moyen d'origine non personnel.
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000f0004';
select pg_temp.groupe('refund-origin','kobara');
select zabelie_group_seal((select id from g_ids where nom='refund-origin'));
do $$
declare m uuid:=(select id from g_ids where nom='refund-origin:meneuse');
        a uuid:=(select id from g_ids where nom='refund-origin:autre');
        adm uuid:='00000000-0000-0000-0000-0000000f0004'; n bigint; unknown_order uuid:=gen_random_uuid();
        retry_order uuid:=gen_random_uuid(); failed_payment uuid; unknown_payment uuid;
begin
  update payments set raw='{"kobara_provider":"natcash"}' where order_id=m;
  assert (select zabelie_original_method from payments where order_id=m)='natcash','G11: original provider absent';
  perform confirm_payment(m::text,'KOBARA-G11','{"provider":"natcash"}',4000);
  update payments set raw=null where order_id=m;
  assert (select zabelie_original_method from payments where order_id=m)='natcash','G11: payload purge erased origin';
  begin
    update payments set zabelie_original_method='moncash' where order_id=m;
    raise exception 'G11: original provider mutable';
  exception when sqlstate 'ZB132' then null; end;
  perform refund_order(a);
  select count(*) into n from wallet_transactions;
  begin
    perform zabelie_record_refund_receipt(a,adm,'moncash','G11-WRONG',now());
    raise exception 'G11: receipt accepted wrong provider';
  exception when invalid_parameter_value then null; end;
  perform zabelie_record_refund_receipt(a,adm,'natcash','G11-RIGHT',now());
  assert (select count(*) from wallet_transactions)=n,'G11: evidence moved money';
  assert (zabelie_solvency_report()->>'ok')::boolean,'G11: original refund incoherent';
  -- Plusieurs tentatives sur une commande : seul le moyen confirmé compte.
  insert into orders(id,buyer_id,product_id,amount_htg)
    values(retry_order,'00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-0000000f00a1',1000);
  insert into payments(order_id,rail,idempotency_key,status)
    values(retry_order,'moncash',retry_order::text||':failed','failed') returning id into failed_payment;
  insert into payments(order_id,rail,idempotency_key,raw)
    values(retry_order,'kobara',retry_order::text,'{"provider":"natcash"}');
  perform confirm_payment(retry_order::text,'KOBARA-RETRY','{"provider":"natcash"}',1000);
  perform refund_order(retry_order);
  select count(*) into n from wallet_transactions;
  begin
    perform zabelie_record_refund_receipt(retry_order,adm,'moncash','G11-FAILED-RAIL',now());
    raise exception 'G11: failed attempt certified as original method';
  exception when invalid_parameter_value then null; end;
  perform zabelie_record_refund_receipt(retry_order,adm,'natcash','G11-RETRY',now());
  -- Une répétition confirmée du même moyen ne rend pas la preuve ambiguë.
  insert into payments(order_id,rail,idempotency_key,status,raw)
    values(retry_order,'kobara',retry_order::text||':repeat','confirmed','{"provider":"natcash"}');
  assert (zabelie_record_refund_receipt(retry_order,adm,'natcash','G11-RETRY',now())->>'duplicate')::boolean,
    'G11: repeated confirmed method rejected';
  -- COUNT(DISTINCT) ignore NULL : la preuve doit aussi refuser ce mélange.
  insert into payments(order_id,rail,idempotency_key,status)
    values(retry_order,'kobara',retry_order::text||':unknown','confirmed') returning id into unknown_payment;
  assert (select zabelie_original_method from payments where id=unknown_payment) is null,
    'G11: unknown confirmed method invented';
  begin
    perform zabelie_record_refund_receipt(retry_order,adm,'natcash','G11-RETRY',now());
    raise exception 'G11: unknown confirmed attempt ignored';
  exception when invalid_parameter_value then null; end;
  delete from payments where id=unknown_payment;
  -- Historique contradictoire : refus, même si un justificatif existe déjà.
  update payments set status='confirmed' where id=failed_payment;
  begin
    perform zabelie_record_refund_receipt(retry_order,adm,'natcash','G11-RETRY',now());
    raise exception 'G11: contradictory confirmed methods certified';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from wallet_transactions)=n,'G11: retry evidence moved money';
  -- Ancien Kobara dont aucune preuve d'opérateur n'a été conservée : ne
  -- jamais permettre à un champ fourni de fabriquer le moyen d'origine.
  insert into orders(id,buyer_id,product_id,amount_htg)
    values(unknown_order,'00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-0000000f00a1',1000);
  insert into payments(order_id,rail,idempotency_key) values(unknown_order,'kobara',unknown_order::text);
  perform confirm_payment(unknown_order::text,'KOBARA-UNKNOWN','{}',1000);
  perform refund_order(unknown_order);
  begin
    update payments set zabelie_original_method='natcash' where order_id=unknown_order;
    raise exception 'G11: unknown original method invented';
  exception when sqlstate 'ZB132' then null; end;
  begin
    perform zabelie_record_refund_receipt(unknown_order,adm,'natcash','G11-UNKNOWN',now());
    raise exception 'G11: unknown original method certified';
  exception when invalid_parameter_value then null; end;
end $$;

rollback;
