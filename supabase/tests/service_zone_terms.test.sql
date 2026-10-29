-- Tests des conditions d'une zone de service (0164). Transaction annulée.
--
--   T1. Connu-POSITIF : le vendeur pose frais, délai et pause sur SA ligne, à
--       l'insertion puis à la modification ; frais 0 (offerts) et NULL (à convenir) sont
--       deux choses distinctes.
--   T2. Connus-NÉGATIFS : un autre vendeur ne modifie pas ma ligne ; personne ne
--       déplace une ligne (zone_id, seller_id : aucun droit de colonne) ; anon ne modifie rien.
--   T3. Les bornes : frais négatifs ou > 100000, délai 0 ou > 720 → refusés.
--   T4. La pause est BORNÉE par la config : au-delà de max_pause_days (ZB164), à
--       l'insertion comme à la modification ; le plafond vient de la CONFIG, pas du code.
--   T5. Lecture publique : anon lit les conditions (c'est leur seul usage).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c6401', 'tz-a@test.local'),
  ('00000000-0000-0000-0000-0000000c6402', 'tz-b@test.local');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000c6401', 'TZ A'),
  ('00000000-0000-0000-0000-0000000c6402', 'TZ B')
on conflict (id) do nothing;

insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-tz-1', 'Komin Tès TZ 1', 'Commune Test TZ 1' from zabelie_zones where code = 'HT-OU';
insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr)
select id, 'komin', 'komin-test-tz-2', 'Komin Tès TZ 2', 'Commune Test TZ 2' from zabelie_zones where code = 'HT-OU';

-- ── T1 — le connu-positif ───────────────────────────────────────────────────
do $$
declare
  z1 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-1');
  z2 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-2');
  r record;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6401';
  insert into zabelie_seller_service_zones (seller_id, zone_id, fee_htg, delay_hours)
  values ('00000000-0000-0000-0000-0000000c6401', z1, 150, 24);
  insert into zabelie_seller_service_zones (seller_id, zone_id, fee_htg)
  values ('00000000-0000-0000-0000-0000000c6401', z2, 0);
  select * into r from zabelie_seller_service_zones where zone_id = z1 and seller_id = '00000000-0000-0000-0000-0000000c6401';
  if r.fee_htg <> 150 or r.delay_hours <> 24 or r.paused_until is not null then raise exception 'T1: conditions non enregistrées (%)', r; end if;
  select * into r from zabelie_seller_service_zones where zone_id = z2 and seller_id = '00000000-0000-0000-0000-0000000c6401';
  if r.fee_htg is distinct from 0 then raise exception 'T1: frais offerts (0) perdus'; end if;
  if r.delay_hours is not null then raise exception 'T1: un délai non précisé doit rester NULL'; end if;

  update zabelie_seller_service_zones set fee_htg = 200, delay_hours = 48, paused_until = now() + interval '7 days'
   where zone_id = z1 and seller_id = '00000000-0000-0000-0000-0000000c6401';
  select * into r from zabelie_seller_service_zones where zone_id = z1 and seller_id = '00000000-0000-0000-0000-0000000c6401';
  if r.fee_htg <> 200 or r.delay_hours <> 48 or r.paused_until is null then raise exception 'T1: modification perdue (%)', r; end if;
  -- Lever la pause.
  update zabelie_seller_service_zones set paused_until = null where zone_id = z1 and seller_id = '00000000-0000-0000-0000-0000000c6401';
  if (select paused_until from zabelie_seller_service_zones where zone_id = z1 and seller_id = '00000000-0000-0000-0000-0000000c6401') is not null then
    raise exception 'T1: la pause ne se lève pas';
  end if;
  reset role;
end $$;

-- ── T2 — les connus-négatifs ────────────────────────────────────────────────
do $$
declare
  z1 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-1');
  z2 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-2');
  n integer;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6402';
  update zabelie_seller_service_zones set fee_htg = 999 where seller_id = '00000000-0000-0000-0000-0000000c6401';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T2: un AUTRE vendeur a modifié mes conditions (% ligne(s))', n; end if;

  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6401';
  begin
    update zabelie_seller_service_zones set zone_id = z2 where zone_id = z1 and seller_id = '00000000-0000-0000-0000-0000000c6401';
    raise exception 'T2: une zone a été déplacée';
  exception when insufficient_privilege then null; end;
  begin
    update zabelie_seller_service_zones set seller_id = '00000000-0000-0000-0000-0000000c6402' where zone_id = z1;
    raise exception 'T2: une ligne a changé de vendeur';
  exception when insufficient_privilege then null; end;
  reset role;

  set local role anon;
  begin
    update zabelie_seller_service_zones set fee_htg = 1;
    raise exception 'T2: anon a modifié des conditions';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- ── T3 — les bornes ─────────────────────────────────────────────────────────
do $$
declare
  z1 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-1');
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6401';
  begin update zabelie_seller_service_zones set fee_htg = -1 where zone_id = z1; raise exception 'T3: frais négatifs acceptés';
  exception when check_violation then null; end;
  begin update zabelie_seller_service_zones set fee_htg = 100001 where zone_id = z1; raise exception 'T3: frais > 100000 acceptés';
  exception when check_violation then null; end;
  begin update zabelie_seller_service_zones set delay_hours = 0 where zone_id = z1; raise exception 'T3: délai 0 accepté';
  exception when check_violation then null; end;
  begin update zabelie_seller_service_zones set delay_hours = 721 where zone_id = z1; raise exception 'T3: délai > 720 accepté';
  exception when check_violation then null; end;
  reset role;
end $$;

-- ── T4 — la pause est bornée, et la borne vient de la config ────────────────
do $$
declare
  z1 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-1');
  z2 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-2');
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6401';
  -- 30 jours par défaut : 29 passe, 31 est refusé.
  update zabelie_seller_service_zones set paused_until = now() + interval '29 days' where zone_id = z1;
  begin
    update zabelie_seller_service_zones set paused_until = now() + interval '31 days' where zone_id = z1;
    raise exception 'T4: une pause de 31 jours a été acceptée (modification)';
  exception when check_violation then null; end;
  -- À l'insertion aussi (sur une zone neuve) : retirer puis réinsérer avec une pause trop longue.
  delete from zabelie_seller_service_zones where zone_id = z2 and seller_id = '00000000-0000-0000-0000-0000000c6401';
  begin
    insert into zabelie_seller_service_zones (seller_id, zone_id, paused_until)
    values ('00000000-0000-0000-0000-0000000c6401', z2, now() + interval '40 days');
    raise exception 'T4: une pause de 40 jours a été acceptée (insertion)';
  exception when check_violation then null; end;
  reset role;

  -- La borne vient de la CONFIG : à 5 jours, 7 jours est refusé ; relevée à 10, il passe.
  update zabelie_service_zone_config set max_pause_days = 5 where id;
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6401';
  begin
    update zabelie_seller_service_zones set paused_until = now() + interval '7 days' where zone_id = z1;
    raise exception 'T4: le plafond de la config (5) n''est pas lu';
  exception when check_violation then null; end;
  reset role;
  update zabelie_service_zone_config set max_pause_days = 10 where id;
  set local role authenticated;
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c6401';
  update zabelie_seller_service_zones set paused_until = now() + interval '7 days' where zone_id = z1;
  reset role;
end $$;

-- ── T5 — lecture publique ───────────────────────────────────────────────────
do $$
declare z1 uuid := (select id from zabelie_zones where slug = 'komin-test-tz-1'); r record;
begin
  set local role anon;
  select fee_htg, delay_hours into r from zabelie_seller_service_zones where zone_id = z1;
  if r.fee_htg is null or r.delay_hours is null then raise exception 'T5: anon ne lit pas les conditions'; end if;
  reset role;
end $$;

rollback;
