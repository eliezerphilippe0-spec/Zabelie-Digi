-- Tests du numéro de commande (0042). Transaction annulée à la fin.
-- Usage : psql "$DATABASE_URL" -f supabase/tests/order_ref.test.sql
--
--   OR1. Format : ZB-YYMMDD-XXXXX, date du jour, alphabet sans ambigus.
--   OR2. Deux commandes → deux numéros distincts.
--   OR3. Valeur fournie par l'application → ÉCRASÉE (la base est seule auteure).
--   OR4. Collision FORCÉE persistante → erreur explicite après 5 essais.
--   OR5. Collision forcée PUIS levée → le retry aboutit (pas d'échec prématuré).
--   OR6. UPDATE du numéro → refusé (immuabilité).
--   OR0. La panne du 2026-09-03 (0093 → 0094) : `search_path = public` SEUL
--        doit faire échouer l'insert (pgcrypto vit dans `extensions`, pas dans
--        `public`) ; `public, extensions` doit le laisser passer. Le cas
--        connu-négatif garde AUSSI le harnais : s'il remet un jour pgcrypto
--        dans `public`, l'insert réussit et OR0 rougit.
--
-- OR4/OR5 forcent la collision en REMPLAÇANT le générateur de candidats dans
-- la transaction (annulée ensuite) — règle du dépôt : un garde se prouve sur
-- un cas connu-négatif, pas en raisonnant.

begin;

-- ── OR0 — l'extension se résout par le search_path de la FONCTION ───────────
-- Mesuré en production le 2026-09-03 : `0093` a épinglé `public` seul, et
-- chaque `insert into orders` a levé 42883 dans le trigger — trois POST en
-- 404 au premier achat réel. La CI était verte parce que pgcrypto y vivait
-- dans `public`. Ce bloc ne peut être vert que si le harnais est fidèle.
do $$
declare v_avant text[];
begin
  select proconfig into v_avant
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'zabelie_order_ref_candidate';
  if v_avant is null or not exists (
    select 1 from unnest(v_avant) c where c = 'search_path=public, extensions'
  ) then
    raise exception 'OR0: zabelie_order_ref_candidate ne porte pas search_path = public, extensions (%)', v_avant;
  end if;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ff0a', 'oref0.seller@test.local'),
  ('00000000-0000-0000-0000-00000000ff0b', 'oref0.buyer@test.local');
delete from profiles where id in ('00000000-0000-0000-0000-00000000ff0a',
                                  '00000000-0000-0000-0000-00000000ff0b');
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000ff0a', 'Vendeur OR0', 'creator'),
  ('00000000-0000-0000-0000-00000000ff0b', 'Acheteur OR0', 'buyer');
insert into products (id, seller_id, slug, title, price_htg, kind, status)
values ('00000000-0000-0000-0000-00000000ff0c',
        '00000000-0000-0000-0000-00000000ff0a',
        'produit-oref0', 'Produit OR0', 1000, 'fichier', 'published');

-- Connu-NÉGATIF : l'état de 0093, tel quel.
alter function zabelie_order_ref_candidate(date) set search_path = public;
do $$
begin
  begin
    insert into orders (id, buyer_id, product_id, amount_htg, status)
    values ('00000000-0000-0000-0000-00000000ff0d',
            '00000000-0000-0000-0000-00000000ff0b',
            '00000000-0000-0000-0000-00000000ff0c', 1000, 'pending');
    raise exception 'OR0: l''insert a REUSSI avec search_path = public seul — '
                    'pgcrypto est dans public ici (harnais infidele a la '
                    'production) ou la fonction ne depend plus de l''extension';
  exception
    when undefined_function then
      raise notice 'OK — OR0a search_path = public seul → gen_random_bytes introuvable (panne du 2026-09-03 reproduite)';
  end;
end $$;

-- Connu-POSITIF : l'état de 0094.
alter function zabelie_order_ref_candidate(date) set search_path = public, extensions;
do $$
declare v_ref text;
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-00000000ff0e',
          '00000000-0000-0000-0000-00000000ff0b',
          '00000000-0000-0000-0000-00000000ff0c', 1000, 'pending');
  select order_ref into v_ref from orders
   where id = '00000000-0000-0000-0000-00000000ff0e';
  if v_ref !~ '^ZB-[0-9]{6}-[2345679ACDEFGHJKMNPQRSTVWXYZ]{5}$' then
    raise exception 'OR0: numero non conforme apres 0094 (%)', v_ref;
  end if;
  raise notice 'OK — OR0b search_path = public, extensions → commande créée (%)', v_ref;
end $$;

-- La commande d'OR0 s'efface : OR1 repart d'un jeu de profils qu'il refait
-- lui-même, et une ligne d'`orders` retiendrait le profil par clé étrangère.
delete from orders where id = '00000000-0000-0000-0000-00000000ff0e';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ff01', 'oref.seller@test.local'),
  ('00000000-0000-0000-0000-00000000ff02', 'oref.buyer@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);
insert into profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000ff01', 'Vendeur OR', 'creator'),
  ('00000000-0000-0000-0000-00000000ff02', 'Acheteur OR', 'buyer');
insert into products (id, seller_id, slug, title, price_htg, kind, status)
values ('00000000-0000-0000-0000-00000000ff03',
        '00000000-0000-0000-0000-00000000ff01',
        'produit-oref', 'Produit OR', 1000, 'fichier', 'published');

do $$
declare
  v_ref_a text;
  v_ref_b text;
  v_msg   text;
begin
  -- ── OR1 · OR2 — format et unicité ────────────────────────────────────────
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-00000000ff10',
          '00000000-0000-0000-0000-00000000ff02',
          '00000000-0000-0000-0000-00000000ff03', 1000, 'pending');
  select order_ref into v_ref_a from orders
   where id = '00000000-0000-0000-0000-00000000ff10';

  if v_ref_a !~ '^ZB-[0-9]{6}-[2345679ACDEFGHJKMNPQRSTVWXYZ]{5}$' then
    raise exception 'OR1: format invalide: %', v_ref_a;
  end if;
  if substr(v_ref_a, 4, 6) <> to_char(current_date, 'YYMMDD') then
    raise exception 'OR1: la date du numero (%) n''est pas celle de la commande', v_ref_a;
  end if;

  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-00000000ff11',
          '00000000-0000-0000-0000-00000000ff02',
          '00000000-0000-0000-0000-00000000ff03', 1000, 'pending');
  select order_ref into v_ref_b from orders
   where id = '00000000-0000-0000-0000-00000000ff11';
  if v_ref_a = v_ref_b then
    raise exception 'OR2: deux commandes, un seul numero (%)', v_ref_a;
  end if;

  -- ── OR3 — valeur fournie écrasée ─────────────────────────────────────────
  insert into orders (id, buyer_id, product_id, amount_htg, status, order_ref)
  values ('00000000-0000-0000-0000-00000000ff12',
          '00000000-0000-0000-0000-00000000ff02',
          '00000000-0000-0000-0000-00000000ff03', 1000, 'pending',
          'ZB-999999-AAAAA');
  if exists (select 1 from orders
              where id = '00000000-0000-0000-0000-00000000ff12'
                and order_ref = 'ZB-999999-AAAAA') then
    raise exception 'OR3: une valeur fournie par le client a ete conservee';
  end if;

  raise notice 'OK — OR1 format · OR2 unicité · OR3 valeur client écrasée';
end;
$$;

-- ── OR4 — collision forcée persistante : erreur explicite après 5 essais ────
-- Le générateur est remplacé par une constante qui existe déjà en base.
create or replace function zabelie_order_ref_candidate(p_date date)
returns text language plpgsql as $$
begin
  return (select order_ref from orders
           where id = '00000000-0000-0000-0000-00000000ff10');
end;
$$;

do $$
declare
  v_msg text;
begin
  begin
    insert into orders (id, buyer_id, product_id, amount_htg, status)
    values ('00000000-0000-0000-0000-00000000ff13',
            '00000000-0000-0000-0000-00000000ff02',
            '00000000-0000-0000-0000-00000000ff03', 1000, 'pending');
    raise exception 'OR4: l''insert aurait du echouer apres 5 collisions';
  exception
    when sqlstate 'ZB042' then
      raise notice 'OK — OR4 collision persistante → erreur explicite (5 essais)';
  end;
end;
$$;

-- ── OR5 — collision transitoire : le retry aboutit ──────────────────────────
-- Les 2 premiers candidats collisionnent, le 3e est libre.
create temporary table zabelie_test_ref_calls (n integer not null default 0);
insert into zabelie_test_ref_calls values (0);

create or replace function zabelie_order_ref_candidate(p_date date)
returns text language plpgsql as $$
declare
  v_n integer;
begin
  update zabelie_test_ref_calls set n = n + 1 returning n into v_n;
  if v_n <= 2 then
    return (select order_ref from orders
             where id = '00000000-0000-0000-0000-00000000ff10');
  end if;
  return 'ZB-' || to_char(p_date, 'YYMMDD') || '-RETRY';
end;
$$;

do $$
declare
  v_ref   text;
  v_calls integer;
begin
  insert into orders (id, buyer_id, product_id, amount_htg, status)
  values ('00000000-0000-0000-0000-00000000ff14',
          '00000000-0000-0000-0000-00000000ff02',
          '00000000-0000-0000-0000-00000000ff03', 1000, 'pending');
  select order_ref into v_ref from orders
   where id = '00000000-0000-0000-0000-00000000ff14';
  select n into v_calls from zabelie_test_ref_calls;

  if v_ref not like 'ZB-%-RETRY' then
    raise exception 'OR5: le retry n''a pas servi le 3e candidat (%)', v_ref;
  end if;
  if v_calls <> 3 then
    raise exception 'OR5: % appels au generateur, 3 attendus', v_calls;
  end if;
  raise notice 'OK — OR5 collision transitoire → succès au 3e candidat';
end;
$$;

-- ── OR6 — immuabilité ───────────────────────────────────────────────────────
do $$
begin
  begin
    update orders set order_ref = 'ZB-260101-CCCCC'
     where id = '00000000-0000-0000-0000-00000000ff10';
    raise exception 'OR6: l''update du numero aurait du etre refuse';
  exception
    when sqlstate 'ZB043' then
      raise notice 'OK — OR6 order_ref immuable';
  end;
end;
$$;

rollback;
