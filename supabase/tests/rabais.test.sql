-- Tests des rabais (0075). Transaction annulée à la fin.
--
--   D1. Connu-POSITIF : poser un rabais copie le prix pratiqué en barré,
--       baisse le prix, et la variante unique suit.
--   D2. Rabais approfondi : le barré reste le prix D'ORIGINE.
--   D3. Refus : hausse, prix invalide, non-propriétaire, variantes multiples.
--   D4. Retrait : le barré part, le prix courant reste.
--   D5. Contrainte : compare_at_htg <= price_htg est impossible même en SQL
--       direct (l'honnêteté ne dépend pas de la RPC).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000010f001', 'r.vandè2@test.local'),
  ('00000000-0000-0000-0000-00000010f002', 'r.lòt2@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000010f001', 'Vandè Raba'),
  ('00000000-0000-0000-0000-00000010f002', 'Lòt Moun R')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-00000010f010', '00000000-0000-0000-0000-00000010f001',
   'raba-fich', 'Raba Fich', 'fichier', 1000, 'published'),
  ('00000000-0000-0000-0000-00000010f011', '00000000-0000-0000-0000-00000010f001',
   'raba-fiz', 'Raba Fiz', 'physical', 2000, 'published'),
  ('00000000-0000-0000-0000-00000010f012', '00000000-0000-0000-0000-00000010f001',
   'raba-multi', 'Raba Multi', 'physical', 3000, 'published');

do $$
declare v_cat uuid;
begin
  select id into v_cat from zabelie_categories limit 1;
  insert into zabelie_physical_products (product_id, category_id, weight_grams) values
    ('00000000-0000-0000-0000-00000010f011', v_cat, 500),
    ('00000000-0000-0000-0000-00000010f012', v_cat, 500);
end $$;
insert into zabelie_product_variants (product_id, sku, price_htg, position, active) values
  ('00000000-0000-0000-0000-00000010f011', 'RB-FIZ-1', 2000, 0, true),
  ('00000000-0000-0000-0000-00000010f012', 'RB-M-1', 3000, 0, true),
  ('00000000-0000-0000-0000-00000010f012', 'RB-M-2', 3200, 1, true);

-- ── D1 — le nominal, variante unique synchronisée ───────────────────────────
do $$
declare v_res jsonb;
begin
  v_res := zabelie_set_discount('00000000-0000-0000-0000-00000010f001',
                                '00000000-0000-0000-0000-00000010f011', 1500);
  if not (v_res->>'ok')::boolean then
    raise exception 'D1 KO : rabais refusé (%)', v_res;
  end if;
  if not exists (select 1 from products
                  where id = '00000000-0000-0000-0000-00000010f011'
                    and price_htg = 1500 and compare_at_htg = 2000) then
    raise exception 'D1 KO : prix/barré incohérents';
  end if;
  if not exists (select 1 from zabelie_product_variants
                  where product_id = '00000000-0000-0000-0000-00000010f011'
                    and price_htg = 1500) then
    raise exception 'D1 KO : la variante n''a pas suivi le prix';
  end if;
  raise notice 'D1 OK — barré = prix pratiqué, prix baissé, variante synchrone';
end $$;

-- ── D2 — rabais approfondi : le barré reste l'ORIGINE ───────────────────────
do $$
declare v_res jsonb;
begin
  v_res := zabelie_set_discount('00000000-0000-0000-0000-00000010f001',
                                '00000000-0000-0000-0000-00000010f011', 1200);
  if (select compare_at_htg from products
       where id = '00000000-0000-0000-0000-00000010f011') <> 2000 then
    raise exception 'D2 KO : le barré a été réécrit — il devait rester 2000';
  end if;
  raise notice 'D2 OK — le barré reste le prix d''origine (2000)';
end $$;

-- ── D3 — les refus ──────────────────────────────────────────────────────────
do $$
declare v_res jsonb;
begin
  v_res := zabelie_set_discount('00000000-0000-0000-0000-00000010f001',
                                '00000000-0000-0000-0000-00000010f010', 1000);
  if v_res->>'reason' <> 'pas_une_baisse' then
    raise exception 'D3 KO : hausse/égalité non refusée (%)', v_res;
  end if;
  v_res := zabelie_set_discount('00000000-0000-0000-0000-00000010f001',
                                '00000000-0000-0000-0000-00000010f010', 0);
  if v_res->>'reason' <> 'prix_invalide' then
    raise exception 'D3 KO : prix nul non refusé (%)', v_res;
  end if;
  v_res := zabelie_set_discount('00000000-0000-0000-0000-00000010f002',
                                '00000000-0000-0000-0000-00000010f010', 500);
  if v_res->>'reason' <> 'introuvable' then
    raise exception 'D3 KO : non-propriétaire non refusé (%)', v_res;
  end if;
  v_res := zabelie_set_discount('00000000-0000-0000-0000-00000010f001',
                                '00000000-0000-0000-0000-00000010f012', 2500);
  if v_res->>'reason' <> 'variantes_multiples' then
    raise exception 'D3 KO : multi-variantes non refusé (%)', v_res;
  end if;
  raise notice 'D3 OK — hausse, prix nul, non-propriétaire, multi-variantes refusés';
end $$;

-- ── D4 — le retrait ─────────────────────────────────────────────────────────
do $$
declare v_res jsonb;
begin
  v_res := zabelie_clear_discount('00000000-0000-0000-0000-00000010f001',
                                  '00000000-0000-0000-0000-00000010f011');
  if not exists (select 1 from products
                  where id = '00000000-0000-0000-0000-00000010f011'
                    and price_htg = 1200 and compare_at_htg is null) then
    raise exception 'D4 KO : le retrait devait garder 1200 sans barré';
  end if;
  raise notice 'D4 OK — barré retiré, prix courant conservé';
end $$;

-- ── D5 — la contrainte tient même en SQL direct ─────────────────────────────
do $$
begin
  begin
    update products set compare_at_htg = 100
     where id = '00000000-0000-0000-0000-00000010f010';
    raise exception 'D5 KO : barré <= prix accepté';
  exception when check_violation then null;
  end;
  raise notice 'D5 OK — un barré gonflé à l''envers est impossible, RPC ou pas';
end $$;

rollback;
