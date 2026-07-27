-- Tests de l'attestation vendeur (0046). Chaque cas dans sa propre
-- transaction, annulée à la fin.
--
--   PA1. Enregistrement : une ligne, la version demandée, accepted_at posé.
--   PA2. Idempotence : ré-accepter la même version ne crée pas de ligne
--        et NE TOUCHE PAS accepted_at (la première acceptation compte).
--   PA3. Une NOUVELLE version produit une NOUVELLE ligne, l'ancienne intacte.
--   PA4. UPDATE refusé (append-only).
--   PA5. DELETE refusé (append-only).
--   PA6. CAS CONNU-NÉGATIF : sans le déclencheur, l'UPDATE passe — c'est donc
--        bien lui qui bloque, et pas une autre contrainte.
--   PA7. Format de version borné : « v1 » oui, « 1 » ou « latest » non.
--
-- Usage : psql "$DATABASE_URL" -f supabase/tests/policy_acceptance.test.sql

-- ─────────────────────────── PA1 → PA3 ──────────────────────────────────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0001', 'vandè@test.local');

do $$
declare
  v_n      integer;
  v_first  timestamptz;
  v_after  timestamptz;
begin
  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0001', 'v1');

  select count(*), min(accepted_at) into v_n, v_first
    from zabelie_policy_acceptances
   where user_id = '00000000-0000-0000-0000-0000000b0001';
  if v_n <> 1 then
    raise exception 'PA1 : % ligne(s) au lieu d''une', v_n;
  end if;
  if v_first is null then
    raise exception 'PA1 : accepted_at non renseigné';
  end if;

  -- PA2 : le vendeur coche à chaque mise en ligne. Dix fiches, une ligne.
  perform pg_sleep(0.01);
  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0001', 'v1');
  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0001', 'v1');

  select count(*), min(accepted_at) into v_n, v_after
    from zabelie_policy_acceptances
   where user_id = '00000000-0000-0000-0000-0000000b0001';
  if v_n <> 1 then
    raise exception 'PA2 : ré-acceptation a créé % lignes', v_n;
  end if;
  if v_after <> v_first then
    raise exception 'PA2 : accepted_at écrasé — la PREMIÈRE acceptation est '
                    'celle qui compte (% → %)', v_first, v_after;
  end if;

  -- PA3 : nouvelle version = nouvelle ligne, l'ancienne reste.
  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0001', 'v2');

  select count(*) into v_n
    from zabelie_policy_acceptances
   where user_id = '00000000-0000-0000-0000-0000000b0001';
  if v_n <> 2 then
    raise exception 'PA3 : % ligne(s) après une seconde version, 2 attendues', v_n;
  end if;
  if not exists (
    select 1 from zabelie_policy_acceptances
     where user_id = '00000000-0000-0000-0000-0000000b0001'
       and policy_version = 'v1'
  ) then
    raise exception 'PA3 : l''acceptation de v1 a disparu';
  end if;

  raise notice 'OK — PA1 enregistrée ; PA2 idempotente, accepted_at intact ; '
               'PA3 nouvelle version = nouvelle ligne';
end $$;
rollback;

-- ───────────────────── PA4 / PA5 : append-only ──────────────────────────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0002', 'append@test.local');

do $$
declare v_code text;
begin
  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0002', 'v1');

  begin
    update zabelie_policy_acceptances set policy_version = 'v2'
     where user_id = '00000000-0000-0000-0000-0000000b0002';
    raise exception 'PA4 : UPDATE accepté — une acceptation est réécrivable';
  exception
    when sqlstate 'ZB046' then v_code := 'ok';
  end;
  if v_code is distinct from 'ok' then
    raise exception 'PA4 : erreur inattendue';
  end if;

  v_code := null;
  begin
    delete from zabelie_policy_acceptances
     where user_id = '00000000-0000-0000-0000-0000000b0002';
    raise exception 'PA5 : DELETE accepté — une acceptation est effaçable';
  exception
    when sqlstate 'ZB046' then v_code := 'ok';
  end;
  if v_code is distinct from 'ok' then
    raise exception 'PA5 : erreur inattendue';
  end if;

  raise notice 'OK — PA4 UPDATE refusé ; PA5 DELETE refusé';
end $$;
rollback;

-- ───────── PA6 : cas connu-négatif — sans le déclencheur, ça passe ──────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0003', 'negatif@test.local');

do $$
declare v_version text;
begin
  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0003', 'v1');

  drop trigger trg_zabelie_policy_acceptances_append_only
    on zabelie_policy_acceptances;

  update zabelie_policy_acceptances set policy_version = 'v2'
   where user_id = '00000000-0000-0000-0000-0000000b0003';

  select policy_version into v_version
    from zabelie_policy_acceptances
   where user_id = '00000000-0000-0000-0000-0000000b0003';
  if v_version <> 'v2' then
    raise exception 'PA6 : l''UPDATE a été bloqué par autre chose que le '
                    'déclencheur — PA4 ne prouve donc pas ce qu''il annonce';
  end if;

  raise notice 'OK — PA6 sans le déclencheur l''UPDATE passe : c''est bien lui '
               'qui tient l''append-only, et rien d''autre';
end $$;
rollback;

-- ─────────────────── PA7 : format de version borné ──────────────────────────
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b0004', 'format@test.local');

do $$
declare v_cas text;
begin
  foreach v_cas in array array['1', 'latest', 'v', 'V1', 'v1.0', ''] loop
    begin
      perform zabelie_record_policy_acceptance(
        '00000000-0000-0000-0000-0000000b0004', v_cas);
      raise exception 'PA7 : version « % » acceptée', v_cas;
    exception
      when check_violation then null;
    end;
  end loop;

  perform zabelie_record_policy_acceptance(
    '00000000-0000-0000-0000-0000000b0004', 'v12');
  if not exists (
    select 1 from zabelie_policy_acceptances
     where user_id = '00000000-0000-0000-0000-0000000b0004'
       and policy_version = 'v12'
  ) then
    raise exception 'PA7 : « v12 » refusé alors qu''il est bien formé';
  end if;

  raise notice 'OK — PA7 versions mal formées refusées, « v12 » accepté';
end $$;
rollback;
