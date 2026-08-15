-- Tests de la galerie produit (0073). Transaction annulée à la fin.
--
--   M1. Connu-POSITIF : 6 images passent ; la 7e échoue ZB073.
--   M2. Une seule vidéo : la 2e échoue ZB073.
--   M3. RLS : un produit PUBLIÉ se lit par tous ; un BROUILLON n'est lu que
--       par son vendeur ; aucun insert client.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'm.vandè@test.local'),
  ('00000000-0000-0000-0000-0000000e0002', 'm.lòt@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', 'Vandè Galri'),
  ('00000000-0000-0000-0000-0000000e0002', 'Lòt Moun')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-0000000e0010', '00000000-0000-0000-0000-0000000e0001',
   'galri-pub', 'Galri Pub', 'fichier', 500, 'published'),
  ('00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000e0001',
   'galri-draft', 'Galri Draft', 'fichier', 500, 'draft');

-- ── M1 — le plafond des images ──────────────────────────────────────────────
do $$
begin
  insert into zabelie_product_media (product_id, kind, storage_path, position)
  select '00000000-0000-0000-0000-0000000e0010', 'image', 'p/' || g || '.jpg', g
    from generate_series(0, 5) g;

  begin
    insert into zabelie_product_media (product_id, kind, storage_path, position)
    values ('00000000-0000-0000-0000-0000000e0010', 'image', 'p/7.jpg', 6);
    raise exception 'M1 KO : la 7e image est passée';
  exception when others then
    if sqlerrm not like 'ZB073%' then raise; end if;
  end;
  raise notice 'M1 OK — 6 images, la 7e refusée';
end $$;

-- ── M2 — une seule vidéo ────────────────────────────────────────────────────
do $$
begin
  insert into zabelie_product_media (product_id, kind, storage_path)
  values ('00000000-0000-0000-0000-0000000e0010', 'video', 'p/v1.mp4');
  begin
    insert into zabelie_product_media (product_id, kind, storage_path)
    values ('00000000-0000-0000-0000-0000000e0010', 'video', 'p/v2.mp4');
    raise exception 'M2 KO : la 2e vidéo est passée';
  exception when others then
    if sqlerrm not like 'ZB073%' then raise; end if;
  end;
  raise notice 'M2 OK — une vidéo, la 2e refusée';
end $$;

-- Un média sur le brouillon, pour M3.
insert into zabelie_product_media (product_id, kind, storage_path)
values ('00000000-0000-0000-0000-0000000e0011', 'image', 'd/1.jpg');

-- ── M3 — RLS ────────────────────────────────────────────────────────────────
do $$
declare v_pub int; v_draft int;
begin
  -- Un AUTRE utilisateur : le publié se lit, le brouillon non.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e0002';
  select count(*) into v_pub from zabelie_product_media
   where product_id = '00000000-0000-0000-0000-0000000e0010';
  select count(*) into v_draft from zabelie_product_media
   where product_id = '00000000-0000-0000-0000-0000000e0011';
  if v_pub <> 7 or v_draft <> 0 then
    raise exception 'M3 KO : autre vendeur voit publié=%, brouillon=% (attendu 7, 0)', v_pub, v_draft;
  end if;

  begin
    insert into zabelie_product_media (product_id, kind, storage_path)
    values ('00000000-0000-0000-0000-0000000e0010', 'image', 'x/pirate.jpg');
    raise exception 'M3 KO : insert client accepté';
  exception when others then
    if sqlerrm like 'M3 KO%' then raise; end if;
  end;
  reset role;

  -- Le VENDEUR voit son brouillon.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000e0001';
  select count(*) into v_draft from zabelie_product_media
   where product_id = '00000000-0000-0000-0000-0000000e0011';
  if v_draft <> 1 then
    raise exception 'M3 KO : le vendeur ne voit pas son brouillon (%)', v_draft;
  end if;
  reset role;
  raise notice 'M3 OK — lecture publiée pour tous, brouillon pour le vendeur, zéro écriture client';
end $$;

rollback;
