-- Tests des relances de paiement abandonné (0124). Transaction annulée.
--
--   R1. Connu-POSITIF : un paiement réel abandonné il y a 5 h est dû, dans
--       la langue de l'achat, avec un jeton de désabonnement.
--   R2. Connu-NÉGATIFS : essai (non réel), trop récent, trop ancien, payé
--       depuis, produit retiré, acheteur = vendeur, essai en cours — rien.
--   R3. Une relance réservée n'est plus due : jamais deux.
--   R4. Désabonnement : le jeton coupe, un jeton inconnu rend false ; anon
--       ne lit ni les tables ni la liste.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b2001', 'relance-vandè@test.local'),
  ('00000000-0000-0000-0000-0000000b2002', 'relance-achteur@test.local'),
  ('00000000-0000-0000-0000-0000000b2003', 'relance-lot@test.local');
insert into profiles (id, display_name) select id, 'Relans' from auth.users
  where id::text like '00000000-0000-0000-0000-0000000b200%' on conflict (id) do nothing;
insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000b2010', '00000000-0000-0000-0000-0000000b2001', 'relans-a', 'Gid A', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000b2011', '00000000-0000-0000-0000-0000000b2001', 'relans-b', 'Gid B', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000b2012', '00000000-0000-0000-0000-0000000b2001', 'relans-c', 'Gid C', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000b2013', '00000000-0000-0000-0000-0000000b2001', 'relans-d', 'Gid D', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000b2014', '00000000-0000-0000-0000-0000000b2001', 'relans-e', 'Gid E', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-0000000b2015', '00000000-0000-0000-0000-0000000b2001', 'relans-f', 'Gid F', 'fichier', 1000, 'published');

-- Fabrique de commandes : (acheteur, produit, statut, réel, âge en heures, langue).
create temp table fx (b text, p text, s order_status, live boolean, h integer, l text);
insert into fx values
  ('2', '10', 'cancelled', true,  5,  'fr'),  -- R1 : dû
  ('2', '11', 'cancelled', false, 5,  'fr'),  -- essai : jamais
  ('2', '12', 'cancelled', true,  1,  'fr'),  -- trop récent
  ('2', '13', 'cancelled', true,  60, 'fr'),  -- trop ancien
  ('2', '14', 'cancelled', true,  5,  'fr'),  -- payé depuis ↓
  ('2', '14', 'paid',      true,  3,  'fr'),
  ('3', '15', 'cancelled', true,  6,  null),  -- produit retiré ↓
  ('1', '10', 'cancelled', true,  5,  'fr'),  -- ancienne auto-vente, avant 0132
  ('3', '10', 'cancelled', true,  6,  'en'),  -- essai en cours ↓
  ('3', '10', 'pending',   true,  0,  'en');
insert into orders (buyer_id, product_id, amount_htg, status, zabelie_payment_is_live, zabelie_lang, created_at)
select ('00000000-0000-0000-0000-0000000b200' || b)::uuid, ('00000000-0000-0000-0000-0000000b20' || p)::uuid,
       1000, s, live, l, now() - make_interval(hours => h)
from fx where b <> '1';
-- L'unique auto-vente historique garde la couverture R2 ; toute nouvelle
-- commande normale conserve le garde d'achat distinct de 0132.
alter table orders disable trigger zabelie_order_seller_guard;
insert into orders (buyer_id, product_id, amount_htg, status, zabelie_payment_is_live, zabelie_lang, created_at)
select ('00000000-0000-0000-0000-0000000b200' || b)::uuid, ('00000000-0000-0000-0000-0000000b20' || p)::uuid,
       1000, s, live, l, now() - make_interval(hours => h)
from fx where b = '1';
alter table orders enable trigger zabelie_order_seller_guard;
update products set status = 'archived' where id = '00000000-0000-0000-0000-0000000b2015';

do $$
declare r record; n integer;
begin
  select count(*) into n from zabelie_relances_dues(50) where email like 'relance-%';
  if n <> 1 then raise exception 'R1/R2 KO : % relances dues, 1 attendue', n; end if;
  select * into r from zabelie_relances_dues(50) where email like 'relance-%';
  if r.product_id <> '00000000-0000-0000-0000-0000000b2010' or r.buyer_id <> '00000000-0000-0000-0000-0000000b2002' then
    raise exception 'R1 KO : mauvaise relance %', r;
  end if;
  if r.lang <> 'fr' or r.titre <> 'Gid A' or r.slug <> 'relans-a' or r.prix_htg <> 1000 then raise exception 'R1 KO : contenu %', r; end if;
  if r.jeton is not null then raise exception 'R1 KO : jeton avant création'; end if;
  if zabelie_email_jeton(r.buyer_id) is null or zabelie_email_jeton(r.buyer_id) <> zabelie_email_jeton(r.buyer_id) then
    raise exception 'R1 KO : jeton instable';
  end if;
  raise notice 'R1 OK — un paiement réel abandonné est relancé, dans la langue de l''achat';
  raise notice 'R2 OK — essai, trop tôt, trop tard, payé, retiré, vendeur, essai en cours : rien';

  insert into zabelie_relances_paiement (buyer_id, product_id, order_id)
  values (r.buyer_id, r.product_id, r.order_id);
  select count(*) into n from zabelie_relances_dues(50) where email like 'relance-%';
  if n <> 0 then raise exception 'R3 KO : relance encore due après réservation'; end if;
  begin
    insert into zabelie_relances_paiement (buyer_id, product_id, order_id) values (r.buyer_id, r.product_id, r.order_id);
    raise exception 'R3 KO : deuxième réservation acceptée';
  exception when unique_violation then null;
  end;
  raise notice 'R3 OK — jamais deux relances pour le même produit';
end $$;

do $$
declare j uuid; n integer;
begin
  delete from zabelie_relances_paiement where buyer_id = '00000000-0000-0000-0000-0000000b2002';
  j := zabelie_email_jeton('00000000-0000-0000-0000-0000000b2002');
  set local role anon;
  if zabelie_email_desabonner(gen_random_uuid()) then raise exception 'R4 KO : jeton inconnu accepté'; end if;
  if not zabelie_email_desabonner(j) then raise exception 'R4 KO : jeton refusé'; end if;
  begin
    perform 1 from zabelie_email_prefs;
    raise exception 'R4 KO : anon lit les préférences';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from zabelie_relances_dues(1);
    raise exception 'R4 KO : anon lit les relances dues (et les e-mails)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform zabelie_email_jeton('00000000-0000-0000-0000-0000000b2002');
    raise exception 'R4 KO : anon obtient un jeton';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select count(*) into n from zabelie_relances_dues(50) where email like 'relance-%';
  if n <> 0 then raise exception 'R4 KO : un désabonné est encore relancé'; end if;
  raise notice 'R4 OK — désabonnement en un clic, rien d''exposé à anon';
end $$;

rollback;
