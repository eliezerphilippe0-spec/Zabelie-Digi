-- Tests des zones de service des vendeurs (0158). Transaction annulée à la fin.
--
--   S1. Connu-POSITIF : un compte pose des zones à trois niveaux (quartier,
--       commune, département) sous SA session — les trois lignes existent. Le
--       compte A n'est PAS encore vendeur (rôle acheteur) : c'est le cas de
--       l'inscription, avant la première publication.
--   S2. Connus-NÉGATIFS de l'écriture : personne ne pose une zone au nom d'un
--       autre ; anon ne peut ni poser ni retirer. Sans eux, S1 pourrait être
--       vert parce que la policy laisse TOUT passer.
--   S3. Le garde ZB158 : zone inconnue, zone fermée, doublon (clé primaire).
--   S4. Le plafond vient de la CONFIG, pas du code : plafond 2 → la 3e est
--       refusée ; on le relève à 3 → elle passe. Le plafond d'un vendeur
--       n'est pas celui d'un autre.
--   S5. Lecture publique : anon et un autre vendeur lisent les zones desservies.
--   S6. Retrait : le vendeur retire SES lignes, pas celles d'un autre ; aucun
--       update n'est possible.
--   S7. Cascade : une zone supprimée emporte les lignes qui la visent.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c5801', 'v.zon-a@test.local'),
  ('00000000-0000-0000-0000-0000000c5802', 'v.zon-b@test.local'),
  ('00000000-0000-0000-0000-0000000c5803', 'a.zon@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000c5801', 'Zon A'),
  ('00000000-0000-0000-0000-0000000c5802', 'Zon B'),
  ('00000000-0000-0000-0000-0000000c5803', 'Zon acheteur')
on conflict (id) do nothing;
-- A reste acheteur (l'inscription précède la première publication) ; B est
-- déjà vendeur. Le rôle est figé côté client (0015) : seul le service le promeut.
update profiles set role = 'creator' where id = '00000000-0000-0000-0000-0000000c5802';

-- Fixtures : une commune, deux quartiers, une commune FERMÉE, sous un même département.
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-s1', 'Komin Tès S', 'Commune Test S'
  from zabelie_zones where code = 'HT-OU';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'katye', 'katye-test-s1', 'Katye Tès S', 'Quartier Test S'
  from zabelie_zones where slug = 'komin-test-s1';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr, is_active)
select id, 'komin', 'komin-ferme-s3', 'Komin Fèmen', 'Commune Fermee', false
  from zabelie_zones where code = 'HT-OU';

-- ── S1 — le connu-positif ───────────────────────────────────────────────────
do $$
declare n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5801';
  insert into zabelie_seller_service_zones (seller_id, zone_id)
  select '00000000-0000-0000-0000-0000000c5801', id
    from zabelie_zones where slug in ('katye-test-s1', 'komin-test-s1') or code = 'HT-OU';
  reset role;
  select count(*) into n from zabelie_seller_service_zones
   where seller_id = '00000000-0000-0000-0000-0000000c5801';
  if n <> 3 then raise exception 'S1 KO : % zone(s) posée(s), attendu 3 (quartier, commune, département)', n; end if;
  raise notice 'S1 OK — un compte pose trois niveaux sous sa session, vendeur ou non';
end $$;

-- ── S2 — les connus-négatifs de l'écriture ──────────────────────────────────
do $$
declare v_zone uuid;
begin
  select id into v_zone from zabelie_zones where slug = 'komin-test-s1';

  -- personne ne pose une zone au nom d'un AUTRE
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5801';
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c5802', v_zone);
    raise exception 'S2 KO : une zone a été posée au nom d''un autre vendeur';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- anon : ni poser ni retirer
  set local role anon;
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c5801', v_zone);
    raise exception 'S2 KO : anon a posé une zone';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from zabelie_seller_service_zones;
    raise exception 'S2 KO : anon a retiré des zones';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'S2 OK — usurpation et anon refusés';
end $$;

-- ── S3 — le garde ZB158 : inconnue, fermée, doublon ─────────────────────────
do $$
declare v_zone uuid; v_fermee uuid;
begin
  select id into v_zone from zabelie_zones where slug = 'komin-test-s1';
  select id into v_fermee from zabelie_zones where slug = 'komin-ferme-s3';

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5802';

  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c5802', gen_random_uuid());
    raise exception 'S3 KO : zone inconnue acceptée';
  exception when others then
    -- l'inconnue passe par ZB158 ; la clé étrangère n'est qu'un second filet
    if sqlerrm not like 'ZB158%' then raise; end if;
  end;

  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c5802', v_fermee);
    raise exception 'S3 KO : zone fermée acceptée';
  exception when others then
    if sqlerrm not like 'ZB158%' then raise; end if;
  end;

  insert into zabelie_seller_service_zones (seller_id, zone_id)
  values ('00000000-0000-0000-0000-0000000c5802', v_zone);
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c5802', v_zone);
    raise exception 'S3 KO : doublon accepté';
  exception when unique_violation then null;
  end;
  reset role;
  raise notice 'S3 OK — inconnue et fermée refusées (ZB158), doublon refusé';
end $$;

-- ── S4 — le plafond vient de la config ──────────────────────────────────────
do $$
declare v_k uuid; v_q uuid; v_dep uuid;
begin
  select id into v_k   from zabelie_zones where slug = 'komin-test-s1';
  select id into v_q   from zabelie_zones where slug = 'katye-test-s1';
  select id into v_dep from zabelie_zones where code = 'HT-OU';

  -- vendeur B a déjà 1 zone (S3). Plafond 2 → une de plus passe, la suivante non.
  update zabelie_service_zone_config set max_zones = 2;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5802';
  insert into zabelie_seller_service_zones (seller_id, zone_id)
  values ('00000000-0000-0000-0000-0000000c5802', v_q);
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000c5802', v_dep);
    raise exception 'S4 KO : la 3e zone a passé un plafond de 2';
  exception when others then
    if sqlerrm not like 'ZB158%' then raise; end if;
  end;
  reset role;

  -- le plafond est un PARAMÈTRE : relevé à 3, la même insertion passe
  update zabelie_service_zone_config set max_zones = 3;
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5802';
  insert into zabelie_seller_service_zones (seller_id, zone_id)
  values ('00000000-0000-0000-0000-0000000c5802', v_dep);
  reset role;
  raise notice 'S4 OK — plafond 2 refuse la 3e, relevé à 3 il l''accepte';
end $$;

-- ── S4b — une insertion GROUPÉE ne contourne pas le plafond ─────────────────
-- Le garde compte les lignes déjà posées ; sur un `insert` de plusieurs lignes,
-- les premières doivent être visibles des suivantes (fonction volatile).
-- Mesuré ici plutôt que supposé : le compte C n'a rien, le plafond vaut 2, un
-- seul ordre en pose trois — il doit échouer ENTIER.
do $$
declare n integer;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c5804', 'v.zon-c@test.local');
  insert into profiles (id, display_name) values ('00000000-0000-0000-0000-0000000c5804', 'Zon C')
    on conflict (id) do nothing;
  update zabelie_service_zone_config set max_zones = 2;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5804';
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    select '00000000-0000-0000-0000-0000000c5804', id
      from zabelie_zones where slug in ('komin-test-s1', 'katye-test-s1') or code = 'HT-OU';
    raise exception 'S4b KO : trois zones posées d''un coup sur un plafond de 2';
  exception when others then
    if sqlerrm not like 'ZB158%' then raise; end if;
  end;
  reset role;

  select count(*) into n from zabelie_seller_service_zones where seller_id = '00000000-0000-0000-0000-0000000c5804';
  if n <> 0 then raise exception 'S4b KO : % ligne(s) posée(s) malgré le refus (l''ordre doit être atomique)', n; end if;
  update zabelie_service_zone_config set max_zones = 3;
  raise notice 'S4b OK — l''insertion groupée est refusée entière';
end $$;

-- ── S5 — lecture publique ───────────────────────────────────────────────────
do $$
declare n_anon integer; n_autre integer;
begin
  set local role anon;
  select count(*) into n_anon from zabelie_seller_service_zones
   where seller_id = '00000000-0000-0000-0000-0000000c5801';
  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5803';
  select count(*) into n_autre from zabelie_seller_service_zones
   where seller_id = '00000000-0000-0000-0000-0000000c5801';
  reset role;
  if n_anon <> 3 or n_autre <> 3 then
    raise exception 'S5 KO : anon lit %, un autre compte lit % — attendu 3 et 3', n_anon, n_autre;
  end if;
  raise notice 'S5 OK — les zones desservies se lisent sans compte';
end $$;

-- ── S6 — retrait, et aucun update ───────────────────────────────────────────
do $$
declare n integer; v_zone uuid;
begin
  select id into v_zone from zabelie_zones where slug = 'komin-test-s1';

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c5801';

  -- le vendeur A ne retire pas les lignes de B : 0 ligne touchée, sans erreur (RLS)
  delete from zabelie_seller_service_zones where seller_id = '00000000-0000-0000-0000-0000000c5802';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'S6 KO : A a retiré % ligne(s) de B', n; end if;

  begin
    update zabelie_seller_service_zones set zone_id = v_zone where seller_id = '00000000-0000-0000-0000-0000000c5801';
    raise exception 'S6 KO : update accepté';
  exception when insufficient_privilege then null;
  end;

  delete from zabelie_seller_service_zones where seller_id = '00000000-0000-0000-0000-0000000c5801' and zone_id = v_zone;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'S6 KO : le retrait de sa propre ligne a touché % ligne(s)', n; end if;
  reset role;

  select count(*) into n from zabelie_seller_service_zones where seller_id = '00000000-0000-0000-0000-0000000c5802';
  if n <> 3 then raise exception 'S6 KO : B a % zone(s) après le passage de A, attendu 3', n; end if;
  raise notice 'S6 OK — on retire les siennes, jamais celles d''un autre, jamais d''update';
end $$;

-- ── S7 — cascade ────────────────────────────────────────────────────────────
do $$
declare n integer;
begin
  delete from zabelie_zones where slug = 'katye-test-s1';
  select count(*) into n from zabelie_seller_service_zones ssz
   where not exists (select 1 from zabelie_zones z where z.id = ssz.zone_id);
  if n <> 0 then raise exception 'S7 KO : % ligne(s) orpheline(s) après suppression de la zone', n; end if;
  raise notice 'S7 OK — aucune zone desservie orpheline';
end $$;

rollback;
