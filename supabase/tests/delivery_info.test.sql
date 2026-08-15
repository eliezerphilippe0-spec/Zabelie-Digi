-- Tests des coordonnées de livraison (0076). Transaction annulée à la fin.
--
--   L1. Le titulaire écrit et lit SA ligne ; il ne lit pas celle d'un autre.
--   L2. LE CŒUR : un vendeur lit la ligne d'un acheteur SEULEMENT s'il a une
--       commande PAYÉE de cet acheteur — pending n'ouvre rien, un vendeur
--       sans commande ne voit rien.
--   L3. Personne n'écrit la ligne d'un autre.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000011f001', 'l.achtè@test.local'),
  ('00000000-0000-0000-0000-00000011f002', 'l.vandè@test.local'),
  ('00000000-0000-0000-0000-00000011f003', 'l.kirye@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000011f001', 'Achtè Liv'),
  ('00000000-0000-0000-0000-00000011f002', 'Vandè Liv'),
  ('00000000-0000-0000-0000-00000011f003', 'Kirye')
on conflict (id) do nothing;

insert into products (id, seller_id, slug, title, kind, price_htg, status) values
  ('00000000-0000-0000-0000-00000011f010', '00000000-0000-0000-0000-00000011f002',
   'liv-prod', 'Liv Prod', 'fichier', 800, 'published');

-- Une commande PAYÉE (le moment d'envoyer) et une PENDING (pas encore).
insert into orders (id, buyer_id, product_id, amount_htg, status) values
  ('00000000-0000-0000-0000-00000011f020', '00000000-0000-0000-0000-00000011f001',
   '00000000-0000-0000-0000-00000011f010', 800, 'paid');

-- ── L1 — le titulaire ───────────────────────────────────────────────────────
do $$
declare v_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000011f001';
  insert into zabelie_delivery_info (user_id, full_name, phone, adres_liv)
  values ('00000000-0000-0000-0000-00000011f001', 'Jan Batis',
          '+509 37 00 00 00', '12, Ri Kap, Okap');
  select count(*) into v_count from zabelie_delivery_info;
  if v_count <> 1 then
    raise exception 'L1 KO : le titulaire ne lit pas sa ligne (%)', v_count;
  end if;
  reset role;
  raise notice 'L1 OK — écrit et lu par le titulaire';
end $$;

-- ── L2 — le moment d'envoyer, et rien d'autre ───────────────────────────────
do $$
declare v_count int;
begin
  -- Le vendeur AVEC commande payée : il voit.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000011f002';
  select count(*) into v_count from zabelie_delivery_info
   where user_id = '00000000-0000-0000-0000-00000011f001';
  if v_count <> 1 then
    raise exception 'L2 KO : le vendeur avec commande payée ne voit pas (%)', v_count;
  end if;
  reset role;

  -- Le curieux SANS commande : rien.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000011f003';
  select count(*) into v_count from zabelie_delivery_info;
  if v_count <> 0 then
    raise exception 'L2 KO : un tiers sans commande voit % ligne(s)', v_count;
  end if;
  reset role;

  -- La commande repasse hors « payé » : la fenêtre se referme.
  update orders set status = 'delivered'
   where id = '00000000-0000-0000-0000-00000011f020';
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000011f002';
  select count(*) into v_count from zabelie_delivery_info
   where user_id = '00000000-0000-0000-0000-00000011f001';
  if v_count <> 0 then
    raise exception 'L2 KO : la fenêtre ne se referme pas après livraison (%)', v_count;
  end if;
  reset role;
  raise notice 'L2 OK — visible pendant « payé » seulement, fenêtre refermée après';
end $$;

-- ── L3 — personne n'écrit pour un autre ─────────────────────────────────────
do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000011f003';
  begin
    insert into zabelie_delivery_info (user_id, full_name)
    values ('00000000-0000-0000-0000-00000011f001', 'Pirate');
    raise exception 'L3 KO : écriture pour un autre acceptée';
  exception when others then
    if sqlerrm like 'L3 KO%' then raise; end if;
  end;
  reset role;
  raise notice 'L3 OK — écriture own-row seulement';
end $$;

rollback;
