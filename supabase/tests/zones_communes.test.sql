-- Tests des communes des neuf autres départements (0159). Transaction annulée.
--
--   K1. Connu-POSITIF : 140 communes, au bon effectif PAR département (le Nord,
--       déjà en base, compris).
--   K2. Les 121 communes de 0159 sont FERMÉES : anon ne voit que les 19 du Nord.
--       Sans cela, K1 serait vert même si la migration ouvrait tout d'un coup.
--   K3. Connu-NÉGATIF de la fermeture : tant que Port-au-Prince est fermée, un
--       compte ne peut pas la déclarer ; une fois ROUVERTE (geste du porteur),
--       la déclaration passe, region_code dérive HT-OU, et la zone de service
--       s'écrit. C'est tout le chemin que la migration devait rendre possible.
--   K4. Intégrité : chaque commune a un département pour parent (ZB069), un
--       libellé kreyòl et un libellé français non vides, et son slug est de la
--       forme ASCII attendue.
--   K5. Les communes du Nord n'ont pas bougé (19, ouvertes, graphies intactes).
begin;

-- ── K1 — les effectifs ──────────────────────────────────────────────────────
do $$
declare v_ecart text; v_total integer;
begin
  select string_agg(a.code || '=' || coalesce(c.n, 0) || ' (attendu ' || a.attendu || ')', ' ; ')
    into v_ecart
    from (values ('HT-AR', 15), ('HT-CE', 12), ('HT-GA', 12), ('HT-NI', 11), ('HT-ND', 19),
                 ('HT-NE', 13), ('HT-NO', 10), ('HT-OU', 20), ('HT-SD', 18), ('HT-SE', 10))
         as a(code, attendu)
    left join (select d.code, count(*) as n from zabelie_zones k
                 join zabelie_zones d on d.id = k.parent_id
                where k.level = 'komin' group by d.code) c on c.code = a.code
   where coalesce(c.n, 0) <> a.attendu;
  if v_ecart is not null then raise exception 'K1 KO : %', v_ecart; end if;
  select count(*) into v_total from zabelie_zones where level = 'komin';
  if v_total <> 140 then raise exception 'K1 KO : % communes, 140 attendues', v_total; end if;
  raise notice 'K1 OK — 140 communes, effectifs conformes par département';
end $$;

-- ── K2 — fermées ────────────────────────────────────────────────────────────
do $$
declare v_anon integer; v_ouvertes_hors_nord integer;
begin
  select count(*) into v_ouvertes_hors_nord
    from zabelie_zones k join zabelie_zones d on d.id = k.parent_id
   where k.level = 'komin' and k.is_active and d.code <> 'HT-ND';
  if v_ouvertes_hors_nord <> 0 then
    raise exception 'K2 KO : % commune(s) hors Nord ouverte(s)', v_ouvertes_hors_nord;
  end if;

  set local role anon;
  select count(*) into v_anon from zabelie_zones where level = 'komin';
  reset role;
  if v_anon <> 19 then
    raise exception 'K2 KO : anon voit % communes, attendu 19 (le Nord seul)', v_anon;
  end if;
  raise notice 'K2 OK — les 121 nouvelles communes sont invisibles pour anon';
end $$;

-- ── K3 — fermée refusée, rouverte acceptée ──────────────────────────────────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000d5901', 'k.ouest@test.local');
insert into profiles (id, display_name) values ('00000000-0000-0000-0000-0000000d5901', 'Ouest Vandè')
  on conflict (id) do nothing;
update profiles set role = 'creator' where id = '00000000-0000-0000-0000-0000000d5901';

do $$
declare v_pap uuid; v_region text; v_nb integer;
begin
  select id into v_pap from zabelie_zones where slug = 'port-au-prince';
  if v_pap is null then raise exception 'K3 KO : Port-au-Prince absente'; end if;

  -- Fermée : une zone de service est refusée (introuvable pour le client).
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000d5901';
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id)
    values ('00000000-0000-0000-0000-0000000d5901', v_pap);
    raise exception 'K3 KO : une commune fermée a été déclarée desservie';
  exception when others then
    if sqlerrm not like 'ZB158%' then raise; end if;
  end;
  reset role;

  -- Le porteur la rouvre (depuis /admin/zones, en service-role).
  update zabelie_zones set is_active = true where id = v_pap;

  update profiles set zone_id = v_pap where id = '00000000-0000-0000-0000-0000000d5901';
  select region_code into v_region from profiles where id = '00000000-0000-0000-0000-0000000d5901';
  if v_region is distinct from 'HT-OU' then
    raise exception 'K3 KO : region_code = % au lieu de HT-OU', coalesce(v_region, 'null');
  end if;

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000d5901';
  insert into zabelie_seller_service_zones (seller_id, zone_id)
  values ('00000000-0000-0000-0000-0000000d5901', v_pap);
  select count(*) into v_nb from zabelie_seller_service_zones where seller_id = '00000000-0000-0000-0000-0000000d5901';
  reset role;
  if v_nb <> 1 then raise exception 'K3 KO : % zone(s) de service posée(s), attendu 1', v_nb; end if;
  raise notice 'K3 OK — fermée refusée ; rouverte, déclarable, region_code HT-OU, zone de service posée';
end $$;

-- ── K4 — intégrité ──────────────────────────────────────────────────────────
do $$
declare v_mauvais integer; v_dup integer;
begin
  select count(*) into v_mauvais
    from zabelie_zones k
    left join zabelie_zones d on d.id = k.parent_id
   where k.level = 'komin'
     and (d.level is distinct from 'depatman'
          or btrim(k.label_kr) = '' or btrim(k.label_fr) = ''
          or k.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  if v_mauvais <> 0 then raise exception 'K4 KO : % commune(s) mal formée(s)', v_mauvais; end if;

  select count(*) into v_dup from (
    select parent_id, slug from zabelie_zones group by 1, 2 having count(*) > 1) x;
  if v_dup <> 0 then raise exception 'K4 KO : % doublon(s) de slug sous un même parent', v_dup; end if;
  raise notice 'K4 OK — parents, libellés, slugs conformes';
end $$;

-- ── K5 — le Nord n'a pas bougé ──────────────────────────────────────────────
do $$
declare v_nord integer; v_okap text;
begin
  select count(*) into v_nord from zabelie_zones k join zabelie_zones d on d.id = k.parent_id
   where k.level = 'komin' and d.code = 'HT-ND' and k.is_active;
  select label_kr into v_okap from zabelie_zones where slug = 'cap-haitien' and level = 'komin';
  if v_nord <> 19 or v_okap is distinct from 'Okap' then
    raise exception 'K5 KO : Nord = % communes ouvertes, Cap-Haïtien = %', v_nord, coalesce(v_okap, 'null');
  end if;
  raise notice 'K5 OK — les 19 communes du Nord sont ouvertes et intactes';
end $$;

rollback;
