-- Tests du durcissement RLS de profiles (0009) — anti-régression sécurité.
-- Transaction annulée (rollback). ON_ERROR_STOP fait échouer au 1er assert faux.
--
-- Couvre :
--   A. Trigger protect_profile_privileges : un rôle client (non service_role) ne
--      peut PAS s'auto-attribuer role/tier — ni à l'INSERT ni à l'UPDATE — mais
--      peut modifier ses autres colonnes (display_name).
--   B. GRANT colonne : le rôle `authenticated` NE peut PAS lire country_code
--      (localisation), mais PEUT lire display_name.

begin;

insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000f1', 'client@test.local');

-- 0045 : le profil est désormais créé en base à l'inscription. Ces tests
-- veulent piloter la ligne eux-mêmes (rôle, tier) et éprouver le chemin
-- INSERT de `protect_profile_privileges` — on retire donc la ligne
-- auto-créée plutôt que de basculer en UPDATE, qui ne teste pas la même
-- chose.
delete from profiles where id in (select id from auth.users);

-- Rôle client éphémère, NON exempté par le trigger. bypassrls : on isole le
-- trigger (on ne teste pas la RLS ici, seulement la protection des colonnes).
create role test_client bypassrls;
grant usage on schema public to test_client;
grant select, insert, update on profiles to test_client;

-- ════════════════ A1 : INSERT — role/tier forcés aux défauts ════════════════
set local role test_client;
insert into profiles (id, role, display_name, tier)
  values ('00000000-0000-0000-0000-0000000000f1', 'admin', 'Pirate', 'elite');
reset role;

-- ════════════════ A2 : UPDATE — role/tier figés, display_name libre ═════════
set local role test_client;
update profiles
   set role = 'admin', tier = 'elite', display_name = 'Nom légitime'
 where id = '00000000-0000-0000-0000-0000000000f1';
reset role;

do $$
declare
  v_role user_role;
  v_tier creator_tier;
  v_name text;
begin
  select role, tier, display_name into v_role, v_tier, v_name
    from profiles where id = '00000000-0000-0000-0000-0000000000f1';

  assert v_role = 'buyer',
    format('A: role auto-attribué non bloqué — attendu buyer, obtenu %s', v_role);
  assert v_tier = 'standard',
    format('A: tier auto-attribué non bloqué — attendu standard, obtenu %s', v_tier);
  assert v_name = 'Nom légitime',
    format('A: la MAJ légitime du nom doit passer — obtenu %s', v_name);
end $$;

-- ════════════════ B : GRANT colonne — country_code non lisible ══════════════
-- country_code a été renseigné par le service role (postgres ici).
update profiles set country_code = 'HT'
 where id = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  -- B1 : lecture de country_code par `authenticated` → doit être refusée.
  begin
    set local role authenticated;
    perform country_code from profiles limit 1;
    reset role;
    raise exception 'B: authenticated a pu lire country_code (fuite localisation)';
  exception
    when insufficient_privilege then
      null; -- comportement attendu
  end;

  -- B2 : lecture d'une colonne sûre (display_name) par `authenticated` → OK.
  set local role authenticated;
  perform display_name from profiles limit 1;
  reset role;
end $$;

rollback;
