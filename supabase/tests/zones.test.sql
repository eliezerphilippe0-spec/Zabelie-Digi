-- Tests des zones (0069). Transaction annulée à la fin.
--
--   Z1. Connu-POSITIF : komin sous depatman, katye sous komin — la
--       hiérarchie nominale passe.
--   Z2. Connus-NÉGATIFS du garde ZB069 : komin sous komin, katye sous
--       depatman, depatman avec parent, komin sans parent. Sans eux, Z1
--       pourrait être vert parce que le garde laisse TOUT passer.
--   Z3. Slug par parent (Z-E) : homonymes entre communes OK, doublon sous
--       le même parent refusé.
--   Z4. Code ISO exactement au niveau depatman : komin avec code refusée,
--       depatman sans code refusé (contraintes check).
--   Z5. La zone déclarée dérive region_code (Z-A) : katye → code du
--       depatman ancêtre ; depatman directement → ZB069 ; zone_id null →
--       region_code INTOUCHÉ (l'héritage 0014 reste maître).
--   Z6. RLS : anon lit les zones actives, ne voit pas les inactives,
--       n'écrit pas.
begin;

-- ── Z1 — la hiérarchie nominale ─────────────────────────────────────────────
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-z1', 'Komin Tès', 'Commune Test'
  from zabelie_zones where code = 'HT-OU';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'katye', 'katye-test-z1', 'Katye Tès', 'Quartier Test'
  from zabelie_zones where slug = 'komin-test-z1';
do $$
begin
  if not exists (select 1 from zabelie_zones where slug = 'katye-test-z1') then
    raise exception 'Z1 KO : le katye nominal n''a pas été créé';
  end if;
  raise notice 'Z1 OK — hierarchie nominale';
end $$;

-- ── Z2 — le garde refuse les rattachements incohérents ──────────────────────
do $$
declare v_komin uuid; v_dep uuid;
begin
  select id into v_komin from zabelie_zones where slug = 'komin-test-z1';
  select id into v_dep   from zabelie_zones where code = 'HT-OU';

  begin
    insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
    values (v_komin, 'komin', 'z2-komin-sous-komin', 'x', 'x');
    raise exception 'Z2 KO : komin sous komin acceptée';
  exception when others then
    if sqlerrm not like 'ZB069%' then raise; end if;
  end;

  begin
    insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
    values (v_dep, 'katye', 'z2-katye-sous-depatman', 'x', 'x');
    raise exception 'Z2 KO : katye sous depatman accepté';
  exception when others then
    if sqlerrm not like 'ZB069%' then raise; end if;
  end;

  begin
    insert into zabelie_zones (parent_id, level, code, slug, label_kr, label_fr)
    values (v_dep, 'depatman', 'HT-ZZ', 'z2-depatman-avec-parent', 'x', 'x');
    raise exception 'Z2 KO : depatman avec parent accepté';
  exception when others then
    if sqlerrm not like 'ZB069%' then raise; end if;
  end;

  begin
    insert into zabelie_zones (level, slug, label_kr, label_fr)
    values ('komin', 'z2-komin-sans-parent', 'x', 'x');
    raise exception 'Z2 KO : komin sans parent acceptée';
  exception when others then
    if sqlerrm not like 'ZB069%' then raise; end if;
  end;

  raise notice 'Z2 OK — les quatre rattachements incohérents refusés (ZB069)';
end $$;

-- ── Z3 — slug par parent, pas global ────────────────────────────────────────
do $$
declare v_komin uuid;
begin
  select id into v_komin from zabelie_zones where slug = 'komin-test-z1';

  -- Homonyme sous un AUTRE parent : passe (deux communes, un même nom de
  -- quartier — le cas réel que l'unicité globale aurait interdit).
  insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
  select id, 'katye', 'centre-ville', 'Sant vil', 'Centre-ville'
    from zabelie_zones where slug = 'komin-test-z1';

  -- Doublon sous le MÊME parent : refusé.
  begin
    insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
    values (v_komin, 'katye', 'centre-ville', 'x', 'x');
    raise exception 'Z3 KO : doublon de slug sous le même parent accepté';
  exception when unique_violation then null;
  end;

  raise notice 'Z3 OK — slug unique par parent, homonymes entre parents admis';
end $$;

-- ── Z4 — le code ISO vit exactement au niveau depatman ──────────────────────
do $$
begin
  begin
    insert into zabelie_zones (parent_id, level, code, slug, label_kr, label_fr)
    select id, 'komin', 'HT-XX', 'z4-komin-avec-code', 'x', 'x'
      from zabelie_zones where code = 'HT-OU';
    raise exception 'Z4 KO : komin avec code ISO acceptée';
  exception when check_violation then null;
  end;

  begin
    insert into zabelie_zones (level, slug, label_kr, label_fr)
    values ('depatman', 'z4-depatman-sans-code', 'x', 'x');
    raise exception 'Z4 KO : depatman sans code ISO accepté';
  exception when check_violation then null;
  end;

  raise notice 'Z4 OK — code ISO obligatoire au depatman, interdit ailleurs';
end $$;

-- ── Z5 — la zone déclarée dérive region_code ────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'z.vandè@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000f0001', 'Vandè Zòn')
on conflict (id) do nothing;

do $$
declare
  v_katye uuid; v_dep uuid; v_region text;
begin
  select id into v_katye from zabelie_zones where slug = 'haut-du-cap';
  select id into v_dep   from zabelie_zones where code = 'HT-ND';

  -- Un katye du Cap → region_code = HT-ND (le depatman remonté, pas saisi).
  update profiles set zone_id = v_katye
   where id = '00000000-0000-0000-0000-0000000f0001';
  select region_code into v_region from profiles
   where id = '00000000-0000-0000-0000-0000000f0001';
  if v_region is distinct from 'HT-ND' then
    raise exception 'Z5 KO : region_code = % au lieu de HT-ND', coalesce(v_region, 'null');
  end if;

  -- Un depatman entier n'est PAS une zone déclarable.
  begin
    update profiles set zone_id = v_dep
     where id = '00000000-0000-0000-0000-0000000f0001';
    raise exception 'Z5 KO : depatman accepté comme zone déclarée';
  exception when others then
    if sqlerrm not like 'ZB069%' then raise; end if;
  end;

  -- Retirer la zone ne touche PAS region_code : l'héritage 0014 reste.
  update profiles set zone_id = null
   where id = '00000000-0000-0000-0000-0000000f0001';
  select region_code into v_region from profiles
   where id = '00000000-0000-0000-0000-0000000f0001';
  if v_region is distinct from 'HT-ND' then
    raise exception 'Z5 KO : region_code effacé au retrait de la zone (%)', coalesce(v_region, 'null');
  end if;

  raise notice 'Z5 OK — region_code dérivé du depatman ancêtre, jamais effacé';
end $$;

-- ── Z6 — RLS : lecture publique des actives, zéro écriture ──────────────────
update zabelie_zones set is_active = false where slug = 'katye-test-z1';
do $$
declare v_n integer;
begin
  set local role anon;

  select count(*) into v_n from zabelie_zones where level = 'depatman';
  if v_n <> 10 then
    raise exception 'Z6 KO : anon voit % depatman au lieu de 10', v_n;
  end if;
  select count(*) into v_n from zabelie_zones where slug = 'katye-test-z1';
  if v_n <> 0 then
    raise exception 'Z6 KO : anon voit une zone inactive';
  end if;

  begin
    insert into zabelie_zones (level, code, slug, label_kr, label_fr)
    values ('depatman', 'HT-YY', 'z6-anon', 'x', 'x');
    raise exception 'Z6 KO : anon a écrit dans zabelie_zones';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'Z6 OK — lecture publique des actives, écriture refusée';
end $$;

rollback;
