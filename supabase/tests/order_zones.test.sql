-- Tests de la zone de remise d'une commande physique (0161). Transaction annulée.
--
--   Z1. Connu-POSITIF : le service-role pose une zone (commune, puis quartier)
--       sur une commande physique en attente — les lignes existent.
--   Z2. Connus-NÉGATIFS du garde ZB161 : un département seul, une zone fermée,
--       une zone inconnue, une commande numérique, une commande déjà payée, et
--       un `update` vers un département. Sans eux, Z1 pourrait être vert parce
--       que le garde laisse TOUT passer.
--   Z3. Lecture : l'acheteur lit la sienne ; un tiers rien ; le vendeur rien
--       AVANT le paiement puis la ligne APRÈS ; anon n'a aucun droit.
--   Z4. Le client n'écrit jamais : ni insert, ni update, ni delete.
--   Z5. Cascade : supprimer la commande emporte sa zone.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c6101', 'oz-acheteur@test.local'),
  ('00000000-0000-0000-0000-0000000c6102', 'oz-vendeur@test.local'),
  ('00000000-0000-0000-0000-0000000c6103', 'oz-tiers@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000c6101', 'OZ Acheteur'),
  ('00000000-0000-0000-0000-0000000c6102', 'OZ Vendeur'),
  ('00000000-0000-0000-0000-0000000c6103', 'OZ Tiers')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000c6110', '00000000-0000-0000-0000-0000000c6102', 'oz-objet-test', 'Objet', 'physical', 100, 'published'),
  ('00000000-0000-0000-0000-0000000c6111', '00000000-0000-0000-0000-0000000c6102', 'oz-fichier-test', 'Fichier', 'fichier', 100, 'draft');
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000c6120', '00000000-0000-0000-0000-0000000c6101', '00000000-0000-0000-0000-0000000c6110', 100, 'pending'),
  ('00000000-0000-0000-0000-0000000c6121', '00000000-0000-0000-0000-0000000c6101', '00000000-0000-0000-0000-0000000c6111', 100, 'pending'),
  ('00000000-0000-0000-0000-0000000c6122', '00000000-0000-0000-0000-0000000c6101', '00000000-0000-0000-0000-0000000c6110', 100, 'paid');

-- Fixtures : un département existant, une commune et un quartier ouverts, une commune fermée.
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-oz', 'Komin Tès OZ', 'Commune Test OZ'
  from zabelie_zones where code = 'HT-OU';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'katye', 'katye-test-oz', 'Katye Tès OZ', 'Quartier Test OZ'
  from zabelie_zones where slug = 'komin-test-oz';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr, is_active)
select id, 'komin', 'komin-ferme-oz', 'Komin Fèmen OZ', 'Commune Fermee OZ', false
  from zabelie_zones where code = 'HT-OU';

-- ── Z1 — le connu-positif ───────────────────────────────────────────────────
insert into zabelie_order_zones (order_id, zone_id)
select '00000000-0000-0000-0000-0000000c6120', id from zabelie_zones where slug = 'katye-test-oz';
do $$
begin
  if (select count(*) from zabelie_order_zones) <> 1 then
    raise exception 'Z1: la zone de remise (quartier) n''est pas enregistree';
  end if;
  -- Une commune seule est acceptee aussi (sur une autre commande en attente).
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000c6123', '00000000-0000-0000-0000-0000000c6101',
          '00000000-0000-0000-0000-0000000c6110', 100, 'pending');
  insert into zabelie_order_zones (order_id, zone_id)
  select '00000000-0000-0000-0000-0000000c6123', id from zabelie_zones where slug = 'komin-test-oz';
  if (select count(*) from zabelie_order_zones) <> 2 then
    raise exception 'Z1: la commune seule devait etre acceptee';
  end if;
end $$;

-- ── Z2 — les connus-négatifs du garde ───────────────────────────────────────
do $$
declare
  v_dep    uuid := (select id from zabelie_zones where code = 'HT-OU');
  v_ferme  uuid := (select id from zabelie_zones where slug = 'komin-ferme-oz');
  v_komin  uuid := (select id from zabelie_zones where slug = 'komin-test-oz');
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-0000000c6124', '00000000-0000-0000-0000-0000000c6101',
          '00000000-0000-0000-0000-0000000c6110', 100, 'pending');

  begin
    insert into zabelie_order_zones (order_id, zone_id) values ('00000000-0000-0000-0000-0000000c6124', v_dep);
    raise exception 'Z2: un departement seul a ete accepte';
  exception when check_violation then null; end;

  begin
    insert into zabelie_order_zones (order_id, zone_id) values ('00000000-0000-0000-0000-0000000c6124', v_ferme);
    raise exception 'Z2: une zone fermee a ete acceptee';
  exception when check_violation then null; end;

  begin
    insert into zabelie_order_zones (order_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c6124', '00000000-0000-0000-0000-00000000dead');
    raise exception 'Z2: une zone inconnue a ete acceptee';
  exception when check_violation then null; end;

  begin
    insert into zabelie_order_zones (order_id, zone_id) values ('00000000-0000-0000-0000-0000000c6121', v_komin);
    raise exception 'Z2: une commande numerique a recu une zone de remise';
  exception when check_violation then null; end;

  begin
    insert into zabelie_order_zones (order_id, zone_id) values ('00000000-0000-0000-0000-0000000c6122', v_komin);
    raise exception 'Z2: une commande deja payee a recu une zone de remise';
  exception when check_violation then null; end;

  begin
    update zabelie_order_zones set zone_id = v_dep where order_id = '00000000-0000-0000-0000-0000000c6120';
    raise exception 'Z2: un update vers un departement a ete accepte';
  exception when check_violation then null; end;
end $$;

-- ── Z3 — la lecture ─────────────────────────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'zabelie_order_zones', 'select') then
    raise exception 'Z3: anon ne doit avoir aucun droit sur les zones de remise';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c6101', true);
do $$
begin
  if (select count(*) from zabelie_order_zones) <> 2 then
    raise exception 'Z3: l''acheteur ne lit pas ses zones de remise (%)', (select count(*) from zabelie_order_zones);
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c6103', true);
do $$
begin
  if (select count(*) from zabelie_order_zones) <> 0 then
    raise exception 'Z3: un tiers lit la zone de remise d''une autre commande';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c6102', true);
do $$
begin
  if (select count(*) from zabelie_order_zones) <> 0 then
    raise exception 'Z3: le vendeur lit la zone AVANT le paiement';
  end if;
end $$;

reset role;
update orders set status = 'paid' where id = '00000000-0000-0000-0000-0000000c6120';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c6102', true);
do $$
begin
  if (select count(*) from zabelie_order_zones) <> 1 then
    raise exception 'Z3: le vendeur ne lit pas la zone APRES le paiement (%)', (select count(*) from zabelie_order_zones);
  end if;
end $$;

-- ── Z4 — le client n'écrit jamais ───────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000c6101', true);
do $$
declare v_komin uuid;
begin
  select id into v_komin from zabelie_zones where slug = 'komin-test-oz';
  begin
    insert into zabelie_order_zones (order_id, zone_id) values ('00000000-0000-0000-0000-0000000c6124', v_komin);
    raise exception 'Z4: l''acheteur a ecrit une zone de remise';
  exception when insufficient_privilege then null; end;
  begin
    update zabelie_order_zones set zone_id = v_komin;
    raise exception 'Z4: l''acheteur a modifie une zone de remise';
  exception when insufficient_privilege then null; end;
  begin
    delete from zabelie_order_zones;
    raise exception 'Z4: l''acheteur a supprime une zone de remise';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── Z5 — la cascade ─────────────────────────────────────────────────────────
do $$
begin
  delete from orders where id = '00000000-0000-0000-0000-0000000c6123';
  if exists (select 1 from zabelie_order_zones where order_id = '00000000-0000-0000-0000-0000000c6123') then
    raise exception 'Z5: la zone survit a la suppression de sa commande';
  end if;
end $$;

rollback;
