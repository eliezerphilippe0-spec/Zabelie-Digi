-- Tests des demandes de katye (0070). Transaction annulée à la fin.
--
--   R1. Connu-POSITIF : un vendeur propose un katye sous une komin active.
--   R2. Connus-NÉGATIFS d'entrée (ZB070) : cible depatman, cible katye,
--       komin inconnue.
--   R3. Anti-doublon : le même nom (casse/espaces ignorées) ne s'empile pas
--       en attente sous la même komin.
--   R4. RLS : on n'insère qu'en son propre nom, on ne lit que les siennes,
--       anon n'écrit pas.
--   R5. Décision : pending → accepted UNE fois ; re-décider échoue ; le
--       contenu ne se réécrit pas ; decided_at posé.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'r.vandè@test.local'),
  ('00000000-0000-0000-0000-0000000a0002', 'r.lòt@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000a0001', 'Vandè Katye'),
  ('00000000-0000-0000-0000-0000000a0002', 'Lòt Moun')
on conflict (id) do nothing;

-- ── R1 — le nominal ─────────────────────────────────────────────────────────
do $$
declare v_komin uuid;
begin
  select id into v_komin from zabelie_zones where level = 'komin' and slug = 'limonade';

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a0001';
  insert into zabelie_zone_requests (requester, komin_id, nom_propose)
  values ('00000000-0000-0000-0000-0000000a0001', v_komin, 'Bò Lanmè');
  reset role;

  if not exists (select 1 from zabelie_zone_requests
                  where nom_propose = 'Bò Lanmè' and status = 'pending') then
    raise exception 'R1 KO : la demande nominale n''existe pas';
  end if;
  raise notice 'R1 OK — demande créée, en attente';
end $$;

-- ── R2 — la cible est une komin, rien d'autre ───────────────────────────────
do $$
declare v_dep uuid; v_katye uuid;
begin
  select id into v_dep   from zabelie_zones where code = 'HT-ND';
  select id into v_katye from zabelie_zones where level = 'katye' and slug = 'carenage';

  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a0001';

  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
    values ('00000000-0000-0000-0000-0000000a0001', v_dep, 'z');
    raise exception 'R2 KO : demande sous un depatman acceptée';
  exception when others then
    if sqlerrm not like 'ZB070%' and sqlerrm not like '%check%' then raise; end if;
  end;

  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
    values ('00000000-0000-0000-0000-0000000a0001', v_katye, 'zz');
    raise exception 'R2 KO : demande sous un katye acceptée';
  exception when others then
    if sqlerrm not like 'ZB070%' then raise; end if;
  end;

  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
    values ('00000000-0000-0000-0000-0000000a0001',
            '00000000-0000-0000-0000-00000000dead', 'zzz');
    raise exception 'R2 KO : demande sous une komin inconnue acceptée';
  exception when others then
    if sqlerrm not like 'ZB070%' and sqlstate <> '23503' then raise; end if;
  end;

  reset role;
  raise notice 'R2 OK — depatman, katye et inconnue refusés';
end $$;

-- ── R3 — l'anti-doublon en attente, graphie normalisée ──────────────────────
do $$
declare v_komin uuid;
begin
  select id into v_komin from zabelie_zones where level = 'komin' and slug = 'limonade';
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a0001';
  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
    values ('00000000-0000-0000-0000-0000000a0001', v_komin, '  bò lanmè ');
    raise exception 'R3 KO : doublon en attente accepté (casse/espaces)';
  exception when unique_violation then null;
  end;
  reset role;
  raise notice 'R3 OK — la même graphie ne s''empile pas en attente';
end $$;

-- ── R4 — RLS : en son nom, les siennes, jamais anon ─────────────────────────
do $$
declare v_komin uuid; v_n integer;
begin
  select id into v_komin from zabelie_zones where level = 'komin' and slug = 'milot';

  -- B ne peut pas insérer AU NOM de A.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a0002';
  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
    values ('00000000-0000-0000-0000-0000000a0001', v_komin, 'Usurpation');
    raise exception 'R4 KO : insertion au nom d''un autre acceptée';
  exception when others then
    if sqlstate not in ('42501', '44000') and sqlerrm not like '%row-level security%' then raise; end if;
  end;

  -- B ne voit pas la demande de A.
  select count(*) into v_n from zabelie_zone_requests;
  if v_n <> 0 then
    raise exception 'R4 KO : B voit % demande(s) d''autrui', v_n;
  end if;
  reset role;

  -- anon n'écrit pas.
  set local role anon;
  begin
    insert into zabelie_zone_requests (requester, komin_id, nom_propose)
    values ('00000000-0000-0000-0000-0000000a0001', v_komin, 'Anon');
    raise exception 'R4 KO : anon a écrit une demande';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'R4 OK — en son nom, les siennes, anon dehors';
end $$;

-- ── R5 — la décision : une fois, sans réécriture ────────────────────────────
do $$
declare v_id uuid; v_decided timestamptz;
begin
  select id into v_id from zabelie_zone_requests where nom_propose = 'Bò Lanmè';

  -- Accepter (comme la route service-role le fera).
  update zabelie_zone_requests set status = 'accepted' where id = v_id;
  select decided_at into v_decided from zabelie_zone_requests where id = v_id;
  if v_decided is null then
    raise exception 'R5 KO : decided_at non posé à la décision';
  end if;

  -- Re-décider : refusé — une décision est finale.
  begin
    update zabelie_zone_requests set status = 'rejected' where id = v_id;
    raise exception 'R5 KO : une demande décidée a été re-décidée';
  exception when others then
    if sqlerrm not like 'ZB070%' then raise; end if;
  end;

  -- Réécrire le contenu d'une demande en attente : refusé aussi.
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000a0001';
  insert into zabelie_zone_requests (requester, komin_id, nom_propose)
  select '00000000-0000-0000-0000-0000000a0001', id, 'Reyekri Tès'
    from zabelie_zones where level = 'komin' and slug = 'milot';
  reset role;
  begin
    update zabelie_zone_requests
       set status = 'accepted', nom_propose = 'Autre Nom'
     where nom_propose = 'Reyekri Tès';
    raise exception 'R5 KO : le contenu a été réécrit au passage de la décision';
  exception when others then
    if sqlerrm not like 'ZB070%' then raise; end if;
  end;

  raise notice 'R5 OK — décision unique, contenu intouchable, decided_at posé';
end $$;

rollback;
