-- Tests de la fiche riche (0074). Transaction annulée à la fin.
--
--   P1. Connu-POSITIF : marque, matière, état et dimensions s'inscrivent.
--   P2. Connus-NÉGATIFS : état hors énumération refusé ; marque vide refusée.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'sp.vandè@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000f0001', 'Vandè Fich')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000f0010', '00000000-0000-0000-0000-0000000f0001',
   'fich-rich', 'Fich Rich', 'physical', 1500, 'published');

-- ── P1 — le nominal ─────────────────────────────────────────────────────────
do $$
declare v_cat uuid;
begin
  select id into v_cat from zabelie_categories limit 1;
  insert into zabelie_physical_products
    (product_id, category_id, weight_grams, length_mm, width_mm, height_mm,
     brand, material, condition)
  values
    ('00000000-0000-0000-0000-0000000f0010', v_cat, 750, 300, 200, 100,
     'Bosch', 'metal', 'nef');

  if not exists (select 1 from zabelie_physical_products
                  where product_id = '00000000-0000-0000-0000-0000000f0010'
                    and brand = 'Bosch' and condition = 'nef'
                    and length_mm = 300) then
    raise exception 'P1 KO : la fiche riche ne porte pas ses attributs';
  end if;
  raise notice 'P1 OK — marque, matière, état et dimensions inscrits';
end $$;

-- ── P2 — les refus ──────────────────────────────────────────────────────────
do $$
begin
  begin
    update zabelie_physical_products
       set condition = 'kraze'
     where product_id = '00000000-0000-0000-0000-0000000f0010';
    raise exception 'P2 KO : état hors énumération accepté';
  exception when check_violation then null;
  end;

  begin
    update zabelie_physical_products
       set brand = '   '
     where product_id = '00000000-0000-0000-0000-0000000f0010';
    raise exception 'P2 KO : marque vide acceptée';
  exception when check_violation then null;
  end;
  raise notice 'P2 OK — état fermé, marque non vide';
end $$;

rollback;
