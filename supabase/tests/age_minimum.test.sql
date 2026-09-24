-- Tests de l'âge minimum par rayon (0115). Transaction annulée à la fin.
--
--   A1. `zabelie_age_minimum` répond par l'ASCENDANCE : une fiche sous `klerin`
--       rend 18 ; une fiche d'un rayon voisin (`kasav`, même parent) rend 0 ;
--       une fiche sans sous-rayon rend 0 ; une fiche inconnue rend 0.
--   A2. La restriction posée sur un PARENT descend : poser 21 sur
--       `pwodwi-lokal` fait rendre 21 à `kasav` et à `klerin` (maximum).
--   A3. Ni `anon` ni `authenticated` n'exécutent la fonction ni ne lisent les
--       attestations.
--   A4. Une attestation ne se modifie pas ; elle suit la commande supprimée.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1501', 'a.achte@test.local'),
  ('00000000-0000-0000-0000-0000000a1502', 'a.vande@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000a1501', 'Achte Laj'),
  ('00000000-0000-0000-0000-0000000a1502', 'Vande Laj')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id)
select '00000000-0000-0000-0000-0000000a1510', '00000000-0000-0000-0000-0000000a1502',
       'klerin-test', 'Klerin tès', 'physical', 800, 'published', c.id
  from zabelie_categories c where c.slug = 'klerin';
insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id)
select '00000000-0000-0000-0000-0000000a1511', '00000000-0000-0000-0000-0000000a1502',
       'kasav-test', 'Kasav tès', 'physical', 150, 'published', c.id
  from zabelie_categories c where c.slug = 'kasav';
insert into products (id, seller_id, slug, title, kind, price_htg, status, category_id)
values ('00000000-0000-0000-0000-0000000a1512', '00000000-0000-0000-0000-0000000a1502',
        'liv-laj-test', 'Liv tès', 'fichier', 300, 'published', null);

do $$
begin
  if (select count(*) from products where id in (
        '00000000-0000-0000-0000-0000000a1510', '00000000-0000-0000-0000-0000000a1511')) <> 2 then
    raise exception 'A0 KO : les fiches de test ne sont pas creees — un insert … select vide passe en silence';
  end if;
end $$;

-- ── A1 — l'ascendance ───────────────────────────────────────────────────────
do $$
begin
  if zabelie_age_minimum('00000000-0000-0000-0000-0000000a1510') <> 18 then
    raise exception 'A1 KO : une fiche sous klerin devrait exiger 18 ans (%)',
      zabelie_age_minimum('00000000-0000-0000-0000-0000000a1510');
  end if;
  if zabelie_age_minimum('00000000-0000-0000-0000-0000000a1511') <> 0 then
    raise exception 'A1 KO : kasav, voisin de klerin, ne doit pas etre restreint';
  end if;
  if zabelie_age_minimum('00000000-0000-0000-0000-0000000a1512') <> 0 then
    raise exception 'A1 KO : une fiche sans sous-rayon ne doit pas etre restreinte';
  end if;
  if zabelie_age_minimum('00000000-0000-0000-0000-0000000a15ff') <> 0 then
    raise exception 'A1 KO : une fiche inconnue doit rendre 0';
  end if;
end $$;

-- ── A2 — la restriction d'un parent descend ─────────────────────────────────
savepoint a2;
update zabelie_categories set age_minimum = 21 where slug = 'pwodwi-lokal';
do $$
begin
  if zabelie_age_minimum('00000000-0000-0000-0000-0000000a1511') <> 21 then
    raise exception 'A2 KO : une restriction posee sur pwodwi-lokal ne descend pas vers kasav';
  end if;
  if zabelie_age_minimum('00000000-0000-0000-0000-0000000a1510') <> 21 then
    raise exception 'A2 KO : klerin doit rendre le MAXIMUM de son ascendance (21)';
  end if;
end $$;
rollback to savepoint a2;

-- ── A3 — aucun rôle public ──────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'zabelie_age_minimum(uuid)', 'execute')
     or has_function_privilege('authenticated', 'zabelie_age_minimum(uuid)', 'execute') then
    raise exception 'A3 KO : un role public execute zabelie_age_minimum';
  end if;
  if has_table_privilege('anon', 'zabelie_order_age_attestations', 'select')
     or has_table_privilege('authenticated', 'zabelie_order_age_attestations', 'insert') then
    raise exception 'A3 KO : un role public touche aux attestations';
  end if;
end $$;

-- ── A4 — non modifiable, suit la commande ───────────────────────────────────
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-0000000a1520', '00000000-0000-0000-0000-0000000a1501',
   '00000000-0000-0000-0000-0000000a1510', 800, 'pending');
insert into zabelie_order_age_attestations (order_id, age_minimum) values
  ('00000000-0000-0000-0000-0000000a1520', 18);

do $$
declare v_refus boolean := false;
begin
  begin
    update zabelie_order_age_attestations set age_minimum = 1
     where order_id = '00000000-0000-0000-0000-0000000a1520';
  exception when others then
    v_refus := sqlstate = '42501';
  end;
  if not v_refus then
    raise exception 'A4 KO : une attestation a ete modifiee';
  end if;
end $$;

delete from orders where id = '00000000-0000-0000-0000-0000000a1520';
do $$
begin
  if exists (select 1 from zabelie_order_age_attestations
              where order_id = '00000000-0000-0000-0000-0000000a1520') then
    raise exception 'A4 KO : l''attestation a survecu a sa commande';
  end if;
end $$;

rollback;
