-- Tests du surplus IA (0071). Transaction annulée à la fin.
--
--   S1. Connu-POSITIF : la config porte les défauts arbitrés (50 / 5 / 200)
--       et une ligne de surplus s'inscrit au prix du moment.
--   S2. Append-only (ZB071) : delete interdit, réécriture du contenu
--       interdite.
--   S3. Règlement : null → valeur passe UNE fois (les deux colonnes
--       ensemble) ; re-régler échoue ; régler sans référence échoue.
--   S4. RLS : le vendeur lit SES lignes, pas celles d'un autre ; aucun
--       insert client.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0001', 's.vandè@test.local'),
  ('00000000-0000-0000-0000-0000000b0002', 's.lòt@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000b0001', 'Vandè Surplus'),
  ('00000000-0000-0000-0000-0000000b0002', 'Lòt Vandè')
on conflict (id) do nothing;

-- ── S1 — défauts arbitrés + inscription nominale ────────────────────────────
do $$
declare v_quota int; v_prix int; v_plafond int;
begin
  select quota_gratuit_jour, prix_surplus_htg, plafond_jour
    into v_quota, v_prix, v_plafond from zabelie_ai_config;
  if v_quota <> 50 or v_prix <> 5 or v_plafond <> 200 then
    raise exception 'S1 KO : défauts inattendus (%, %, %)', v_quota, v_prix, v_plafond;
  end if;

  insert into zabelie_ai_surplus (seller_id, prix_htg)
  values ('00000000-0000-0000-0000-0000000b0001', 5);

  if not exists (select 1 from zabelie_ai_surplus
                  where seller_id = '00000000-0000-0000-0000-0000000b0001'
                    and prix_htg = 5 and settled_at is null) then
    raise exception 'S1 KO : la ligne de surplus n''existe pas';
  end if;
  raise notice 'S1 OK — config aux défauts, ligne inscrite non réglée';
end $$;

-- ── S2 — append-only ────────────────────────────────────────────────────────
do $$
begin
  begin
    delete from zabelie_ai_surplus
     where seller_id = '00000000-0000-0000-0000-0000000b0001';
    raise exception 'S2 KO : delete accepté';
  exception when others then
    if sqlerrm not like 'ZB071%' then raise; end if;
  end;

  begin
    update zabelie_ai_surplus set prix_htg = 0
     where seller_id = '00000000-0000-0000-0000-0000000b0001';
    raise exception 'S2 KO : réécriture du prix acceptée';
  exception when others then
    if sqlerrm not like 'ZB071%' then raise; end if;
  end;
  raise notice 'S2 OK — append-only tenu (delete et réécriture refusés)';
end $$;

-- ── S3 — le règlement, une fois, complet ────────────────────────────────────
do $$
declare v_id bigint;
begin
  select id into v_id from zabelie_ai_surplus
   where seller_id = '00000000-0000-0000-0000-0000000b0001' limit 1;

  -- Régler sans référence : la contrainte couple les deux colonnes.
  begin
    update zabelie_ai_surplus set settled_at = now() where id = v_id;
    raise exception 'S3 KO : règlement sans référence accepté';
  exception when others then
    if sqlerrm like 'S3 KO%' then raise; end if;
  end;

  update zabelie_ai_surplus
     set settled_at = now(), settlement_ref = 'payout-test-1'
   where id = v_id;

  begin
    update zabelie_ai_surplus
       set settled_at = now(), settlement_ref = 'payout-test-2'
     where id = v_id;
    raise exception 'S3 KO : re-règlement accepté';
  exception when others then
    if sqlerrm not like 'ZB071%' then raise; end if;
  end;
  raise notice 'S3 OK — règlement posé une fois, définitif';
end $$;

-- ── S4 — RLS : lecture propre, aucun insert client ──────────────────────────
insert into zabelie_ai_surplus (seller_id, prix_htg)
values ('00000000-0000-0000-0000-0000000b0002', 5);

do $$
declare v_count int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000b0001';

  select count(*) into v_count from zabelie_ai_surplus;
  if v_count <> 1 then
    raise exception 'S4 KO : le vendeur voit % ligne(s), attendu 1 (les siennes)', v_count;
  end if;

  begin
    insert into zabelie_ai_surplus (seller_id, prix_htg)
    values ('00000000-0000-0000-0000-0000000b0001', 0);
    raise exception 'S4 KO : insert client accepté';
  exception when others then
    if sqlerrm like 'S4 KO%' then raise; end if;
  end;

  reset role;
  raise notice 'S4 OK — lecture propre seulement, écriture service-role seulement';
end $$;

rollback;
