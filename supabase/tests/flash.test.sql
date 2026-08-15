-- Tests des ventes flash (0080). Transaction annulée à la fin.
--
--   F1. Connu-POSITIF : une offre valide s'insère.
--   F2. Les bornes refusent : prix >= courant, rabais hors 10-70 %, fenêtre
--       trop longue, produit en brouillon.
--   F3. Pas deux offres vivantes sur le même produit ; l'annulation libère.
--   F4. Le plafond d'offres par vendeur tient.
--   F5. Une offre ne se MODIFIE pas — seule annulee_a peut bouger.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000140001', 'f.vandè@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000140001', 'Vandè Flash')
on conflict (id) do nothing;

insert into products (id, seller_id, title, slug, price_htg, kind, status) values
  ('00000000-0000-0000-0000-000000150001', '00000000-0000-0000-0000-000000140001',
   'Liv Kreyòl', 'liv-kreyol-flash', 1000, 'fichier', 'published'),
  ('00000000-0000-0000-0000-000000150002', '00000000-0000-0000-0000-000000140001',
   'Bwochi', 'bwochi-flash', 2000, 'fichier', 'draft');

-- ── F1 — connu-positif ──────────────────────────────────────────────────────
do $$
begin
  insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
  values ('00000000-0000-0000-0000-000000150001', 700, now() + interval '6 hours');
  raise notice 'F1 OK — offre valide (-30%%) acceptée';
end $$;

-- ── F2 — les bornes, une par une ────────────────────────────────────────────
do $$
begin
  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-000000150002', 1000, now() + interval '2 hours');
    raise exception 'F2a KO : offre acceptée sur un BROUILLON';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;

  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-000000150001', 950, now() + interval '2 hours');
    raise exception 'F2b KO : rabais de 5%% accepté (minimum 10%%)';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;

  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-000000150001', 100, now() + interval '2 hours');
    raise exception 'F2c KO : rabais de 90%% accepté (maximum 70%%)';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;

  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-000000150001', 700, now() + interval '48 hours');
    raise exception 'F2d KO : fenêtre de 48 h acceptée (maximum 24 h)';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;
  raise notice 'F2 OK — brouillon, rabais 5%% et 90%%, fenêtre 48 h : tous refusés';
end $$;

-- ── F3 — chevauchement refusé, annulation libère ────────────────────────────
do $$
declare v_id uuid;
begin
  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-000000150001', 600, now() + interval '3 hours');
    raise exception 'F3a KO : deux offres vivantes sur le même produit';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;

  update zabelie_flash_sales set annulee_a = now()
   where product_id = '00000000-0000-0000-0000-000000150001';

  insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
  values ('00000000-0000-0000-0000-000000150001', 600, now() + interval '3 hours')
  returning id into v_id;
  raise notice 'F3 OK — chevauchement refusé, puis accepté après annulation';
end $$;

-- ── F4 — plafond par vendeur ────────────────────────────────────────────────
do $$
declare i integer;
begin
  -- Le vendeur a déjà 1 offre vivante (F3). On publie 3 produits de plus et
  -- on remplit jusqu'au plafond (3), puis la 4e doit tomber.
  for i in 2..3 loop
    insert into products (id, seller_id, title, slug, price_htg, kind, status)
    values (('00000000-0000-0000-0000-00000015000' || i + 1)::uuid,
            '00000000-0000-0000-0000-000000140001',
            'Pwodwi ' || i, 'pwodwi-flash-' || i, 1000, 'fichier', 'published');
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values (('00000000-0000-0000-0000-00000015000' || i + 1)::uuid, 700,
            now() + interval '2 hours');
  end loop;

  insert into products (id, seller_id, title, slug, price_htg, kind, status)
  values ('00000000-0000-0000-0000-000000150009',
          '00000000-0000-0000-0000-000000140001',
          'Twòp', 'twop-flash', 1000, 'fichier', 'published');
  begin
    insert into zabelie_flash_sales (product_id, prix_flash_htg, fin)
    values ('00000000-0000-0000-0000-000000150009', 700, now() + interval '2 hours');
    raise exception 'F4 KO : 4e offre simultanée acceptée (plafond 3)';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;
  raise notice 'F4 OK — plafond de 3 offres par vendeur tenu';
end $$;

-- ── F5 — une offre ne se modifie pas ────────────────────────────────────────
do $$
begin
  begin
    update zabelie_flash_sales set prix_flash_htg = 500
     where product_id = '00000000-0000-0000-0000-000000150001'
       and annulee_a is null;
    raise exception 'F5 KO : le prix d''une offre en cours a pu être modifié';
  exception when others then
    if sqlerrm not like 'ZB080%' then raise; end if;
  end;
  raise notice 'F5 OK — offre immuable, seule l''annulation est permise';
end $$;

rollback;
